#include <Arduino.h>
#include <DHT.h>
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>

// ================= USER CONFIGURATION =================
// 1. Mobile number to receive intrusion SMS (with country code):
#define TARGET_PHONE_NUMBER "+919155270295"

// 2. Telemetry Ingestion Endpoint:
const char* SERVER_URL = "https://esp32-sentinel-monitor-187t-ankur1212s.vercel.app/api/readings";

#define UNIT_CALLSIGN         "UNIT-01"
#define UPLOAD_INTERVAL_MS    7000   // Telemetry upload interval (7 seconds)
#define SMS_COOLDOWN_MS       30000  // Minimum cooldown between SMS alerts (30 seconds)
// ======================================================

// --- PIN DEFINITIONS ---
#define DHTPIN        4      // DHT11 Data Pin
#define DHTTYPE       DHT11
#define PIR_PIN       32     // PIR Motion Sensor (Active HIGH on motion)
#define GPS_RX_PIN    25     // ESP32 RX1 <- NEO-6M GPS TX
#define GPS_TX_PIN    26     // ESP32 TX1 -> NEO-6M GPS RX
#define MODEM_TX_PIN  1      // ESP32 TX0 (GPIO 1) -> A7670C RXD
#define MODEM_RX_PIN  3      // ESP32 RX0 (GPIO 3) <- A7670C TXD

DHT dht(DHTPIN, DHTTYPE);
TinyGPSPlus gps;
HardwareSerial gpsSerial(1); // Hardware UART1 for GPS (Pins 25 & 26)

bool modemOnline = false;
unsigned long lastUploadTime = 0;
unsigned long lastSmsTime = 0;
unsigned long lastModemRetry = 0;
unsigned long lastLbsCheck = 0;

// Default deployment: Rashtriya Raksha University (RRU), Lavad, Dahegam
float currentLat = 23.154455;
float currentLon = 72.885000;
String locationSource = "RRU-BASE";

bool detectMotion() {
  return digitalRead(PIR_PIN) == HIGH;
}

// Helper to send AT command to modem on Serial (TX0/RX0) safely
String sendAT(String cmd, unsigned long timeout = 1500) {
  while (Serial.available()) Serial.read();
  Serial.println(cmd);
  String resp = "";
  unsigned long start = millis();
  while (millis() - start < timeout) {
    while (Serial.available() > 0) {
      char c = (char)Serial.read();
      if (c != '\0' && resp.length() < 256) {
        resp += c;
      }
    }
    if (resp.indexOf("OK") != -1 || resp.indexOf("ERROR") != -1) break;
    delay(10);
  }
  return resp;
}

// Query A7670 Cellular LBS (Base Station Triangulation)
bool updateCellularLBS() {
  Serial.println("[LBS] Requesting cell tower triangulation (AT+CLBS=1)...");
  while (Serial.available()) Serial.read();
  Serial.println("AT+CLBS=1");

  String resp = "";
  unsigned long start = millis();
  // Wait up to 5 seconds for the cell tower URC (+CLBS: ...)
  while (millis() - start < 5000) {
    while (Serial.available() > 0) {
      char c = (char)Serial.read();
      if (c != '\0' && resp.length() < 256) {
        resp += c;
      }
    }
    if (resp.indexOf("+CLBS:") != -1 && resp.indexOf("\n", resp.indexOf("+CLBS:")) != -1) {
      break;
    }
    delay(20);
  }
  resp.trim();
  Serial.printf("[LBS] Modem Response: [%s]\n", resp.c_str());

  int idx = resp.indexOf("+CLBS:");
  if (idx != -1) {
    int firstComma = resp.indexOf(',', idx);
    if (firstComma != -1) {
      int retCode = resp.substring(idx + 6, firstComma).toInt();
      if (retCode == 0) {
        int secondComma = resp.indexOf(',', firstComma + 1);
        int thirdComma = resp.indexOf(',', secondComma + 1);
        if (secondComma != -1 && thirdComma != -1) {
          String sLat = resp.substring(firstComma + 1, secondComma);
          String sLon = resp.substring(secondComma + 1, thirdComma);
          sLat.trim();
          sLon.trim();
          float pLat = sLat.toFloat();
          float pLon = sLon.toFloat();
          if (pLat != 0.0 && pLon != 0.0) {
            currentLat = pLat;
            currentLon = pLon;
            locationSource = "4G-LBS";
            Serial.printf("[LBS] SUCCESS! Coordinates: %.6f, %.6f\n", currentLat, currentLon);
            return true;
          }
        }
      } else {
        Serial.printf("[LBS] Cell tower status code: %d\n", retCode);
      }
    }
  }
  return false;
}

// Generate Google Maps link
String getGoogleMapsLink() {
  if (currentLat != 0.0 && currentLon != 0.0) {
    return "https://maps.google.com/?q=" + String(currentLat, 6) + "," + String(currentLon, 6) + " (" + locationSource + ")";
  }
  return "Location searching...";
}

// Forward declaration
void sendSMS(String text);

// Initialize 4G Modem Network parameters
void initModemNetwork() {
  Serial.println("[MODEM] Configuring 4G network parameters...");
  sendAT("AT+CPIN?", 1000);

  // Wait for 4G network registration
  Serial.println("[MODEM] Waiting for cellular network registration...");
  for (int i = 0; i < 10; i++) {
    String reg = sendAT("AT+CEREG?", 1000);
    if (reg.indexOf(",1") != -1 || reg.indexOf(", 1") != -1 ||
        reg.indexOf(",5") != -1 || reg.indexOf(", 5") != -1) {
      Serial.println("[MODEM] Registered on cellular network!");
      break; 
    }
    delay(1000);
  }

  // APN and Internet Context
  sendAT("AT+CGDCONT=1,\"IP\",\"airtelgprs.com\"", 1500);
  sendAT("AT+NETOPEN", 2000);

  // SSL Context (TLS 1.2, no CA check, enable SNI for Vercel/Cloudflare)
  sendAT("AT+CSSLCFG=\"sslversion\",0,4", 400);
  sendAT("AT+CSSLCFG=\"authmode\",0,0", 400);
  sendAT("AT+CSSLCFG=\"enableSNI\",0,1", 400);

  // Query initial cellular triangulation location
  updateCellularLBS();

  Serial.println("[BOOT] Modem network online and ready!");
  sendSMS("✅ SENTINEL-4G: System Online via Hardware Serial!");
}

// Send SMS alert via A7670C on Serial
void sendSMS(String text) {
  Serial.println("[SMS] Preparing alert SMS...");
  sendAT("AT+CSCS=\"GSM\"", 500);
  String cmgf = sendAT("AT+CMGF=1", 500);
  if (cmgf.indexOf("OK") == -1) {
    Serial.print("[SMS] Warning: AT+CMGF=1: ");
    Serial.println(cmgf);
  }

  while (Serial.available()) Serial.read();
  Serial.print("AT+CMGS=\"");
  Serial.print(TARGET_PHONE_NUMBER);
  Serial.println("\"");

  // Wait specifically for '>' prompt from modem
  unsigned long start = millis();
  bool promptReady = false;
  String modemResp = "";
  while (millis() - start < 3000) {
    if (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '>') {
        promptReady = true;
        break;
      }
      if (c != '\0' && modemResp.length() < 128) {
        modemResp += c;
      }
    }
  }

  if (promptReady) {
    Serial.print(text);
    Serial.write(26); // ASCII 26 (Ctrl+Z) sends SMS
    Serial.println("[SMS] SMS submitted, waiting for network dispatch...");
    delay(3000);
    Serial.println("[SMS] SMS dispatched successfully!");
  } else {
    Serial.write(27); // Escape to cancel stuck prompt
    Serial.print("[SMS] Error: Modem did not return '>' prompt! Response: [");
    modemResp.trim();
    Serial.print(modemResp);
    Serial.println("]");
  }
}

// Upload JSON payload over 4G LTE to Backend
void postTelemetryToCloud(String json) {
  sendAT("AT+HTTPTERM", 300);
  String initResp = sendAT("AT+HTTPINIT", 1000);
  if (initResp.indexOf("ERROR") != -1) {
    sendAT("AT+HTTPTERM", 400);
    sendAT("AT+HTTPINIT", 1000);
  }

  sendAT("AT+HTTPPARA=\"URL\",\"" + String(SERVER_URL) + "\"", 1000);
  sendAT("AT+HTTPPARA=\"SSLCFG\",0", 300);
  sendAT("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 300);
  sendAT("AT+HTTPPARA=\"USERAGENT\",\"Mozilla/5.0 (Windows NT 10.0; Win64; x64)\"", 300);

  while (Serial.available()) Serial.read();
  Serial.println("AT+HTTPDATA=" + String(json.length()) + ",5000");

  // Wait specifically for DOWNLOAD prompt
  unsigned long start = millis();
  bool downloadReady = false;
  while (millis() - start < 2000) {
    if (Serial.find("DOWNLOAD")) {
      downloadReady = true;
      break;
    }
  }

  if (downloadReady) {
    Serial.print(json); // Exact payload bytes
    delay(200);

    while (Serial.available()) Serial.read();
    Serial.println("AT+HTTPACTION=1");

    // Wait for HTTP action response (+HTTPACTION: 1,200,...)
    start = millis();
    String actionResp = "";
    while (millis() - start < 7000) {
      if (Serial.available()) {
        char c = (char)Serial.read();
        actionResp += c;
        if (actionResp.indexOf("+HTTPACTION:") != -1 && actionResp.indexOf("\n", actionResp.indexOf("+HTTPACTION:")) != -1) {
          break;
        }
      }
    }

    if (actionResp.indexOf(",200,") != -1 || actionResp.indexOf(",200") != -1) {
      Serial.println("[HTTP] Upload Success: 200 OK!");
    } else {
      Serial.print("[HTTP] Upload Result: ");
      Serial.println(actionResp);
      String body = sendAT("AT+HTTPREAD", 1500);
      Serial.print("[HTTP] Server Response: ");
      Serial.println(body);
    }
  } else {
    Serial.println("[HTTP] Modem not ready for DOWNLOAD prompt. Skipping.");
  }

  sendAT("AT+HTTPTERM", 300);
}

void setup() {
  // 1. Primary Hardware Serial (TX0 = GPIO 1, RX0 = GPIO 3) for both USB and A7670C Modem
  Serial.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
  delay(1000);
  Serial.println("\n==============================================");
  Serial.println("       SENTINEL-4G TACTICAL SYSTEM BOOT       ");
  Serial.println("==============================================");

  // 2. Hardware GPS (UART1) on GPIO 25 & 26
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] Initialized on RX:25, TX:26 at 9600 baud.");

  // 3. Sensors
  dht.begin();
  pinMode(DHTPIN, INPUT_PULLUP);
  pinMode(PIR_PIN, INPUT_PULLDOWN);
  Serial.println("[SENSORS] DHT11 on GPIO 4, PIR Sensor on GPIO 32 (PULLDOWN).");

  delay(1500);
  Serial.println("[MODEM] Testing AT communication on TX0/RX0 (115200 baud)...");
  for (int i = 0; i < 5; i++) {
    String atResp = sendAT("AT", 600);
    atResp.trim();
    if (atResp.indexOf("OK") != -1) {
      Serial.println("[MODEM] Communication established! (OK)");
      modemOnline = true;
      break;
    }
    Serial.printf("[MODEM] Sync attempt %d: [%s]\n", i + 1, atResp.c_str());
    delay(300);
  }

  if (modemOnline) {
    initModemNetwork();
  } else {
    Serial.println("[MODEM] Modem not responding yet. Running in offline sensor mode.");
    Serial.println("[MODEM] Ensure A7670C TXD->RX0 and RXD->TX0, with common GND.");
  }

  Serial.println("[BOOT] Sentinel system armed and active!");
}

void loop() {
  // 1. Feed GPS parser
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Dual Positioning Strategy:
  // Priority 1: High-precision satellite GPS
  if (gps.location.isValid()) {
    currentLat = gps.location.lat();
    currentLon = gps.location.lng();
    locationSource = "GPS";
  }
  // Priority 2: Indoor Cellular LBS Triangulation (Attempt every 60 seconds)
  else if (modemOnline && (millis() - lastLbsCheck > 60000)) {
    lastLbsCheck = millis();
    updateCellularLBS();
  }

  // 2. Periodic background check for modem if currently offline
  if (!modemOnline && (millis() - lastModemRetry > 6000)) {
    lastModemRetry = millis();
    String resp = sendAT("AT", 300);
    if (resp.indexOf("OK") != -1) {
      Serial.println("\n>>> [MODEM] Modem connection detected! Initializing 4G network... <<<");
      modemOnline = true;
      initModemNetwork();
    }
  }

  // 3. Read PIR motion state (GPIO 32)
  bool isIntrusion = detectMotion();

  if (isIntrusion) {
    if (modemOnline && (millis() - lastSmsTime > SMS_COOLDOWN_MS)) {
      Serial.println("[PIR] Motion detected! Firing alert SMS...");
      String msg = "🚨 ALERT: Motion detected near sensor!\n";
      msg += "PIR motion sensor triggered.\n";
      msg += "Location: " + getGoogleMapsLink();
      sendSMS(msg);
      lastSmsTime = millis();
    }
  }

  // 4. Telemetry Upload to Backend
  if (millis() - lastUploadTime >= UPLOAD_INTERVAL_MS) {
    lastUploadTime = millis();

    // Read DHT11
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();
    if (isnan(temp) || isnan(hum)) {
      delay(200);
      temp = dht.readTemperature();
      hum = dht.readHumidity();
    }

    // Diagnostic log to USB Serial Monitor
    Serial.printf("[DIAG] Temp: %.1fC | Hum: %.1f%% | PIR: %s | Loc: %.4f,%.4f [%s] (Sats: %d, Chars: %lu) | 4G: %s\n",
      isnan(temp) ? 0.0 : temp,
      isnan(hum) ? 0.0 : hum,
      isIntrusion ? "MOTION!" : "CLEAR",
      currentLat,
      currentLon,
      locationSource.c_str(),
      gps.satellites.value(),
      gps.charsProcessed(),
      modemOnline ? "ONLINE" : "SEARCHING"
    );

    // If modem is online, post over 4G LTE
    if (modemOnline) {
      String payload = "{";
      payload += "\"unit_id\":\"" + String(UNIT_CALLSIGN) + "\",";
      payload += "\"dist\":0,";
      payload += "\"temp\":" + String(isnan(temp) ? 0.0 : temp, 1) + ",";
      payload += "\"hum\":" + String(isnan(hum) ? 0.0 : hum, 1) + ",";
      payload += "\"gas\":0,";
      payload += "\"lat\":" + String(currentLat, 6) + ",";
      payload += "\"lon\":" + String(currentLon, 6) + ",";
      payload += "\"alert\":" + String(isIntrusion ? "true" : "false") + ",";
      payload += "\"motion\":" + String(isIntrusion ? "true" : "false");
      payload += "}";

      postTelemetryToCloud(payload);
    }
  }

  delay(50);
}