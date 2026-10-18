# SENTINEL-4G: Military Tactical Asset Tracking & C2 Defense Operations

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Ankur1212s/esp32-sentinel-monitor)

A 24/7 cloud-native remote asset tracking, perimeter security surveillance, and multi-sensor environmental telemetry system built for defense and high-value asset monitoring.

Powered by **ESP32**, **A7670C LTE Cat-1 cellular**, **NEO-6M GPS**, **PIR motion sensing**, and **Next.js 14** hosted on Vercel.

---

## ⚡ Tactical Capabilities

- **24/7 Cloud Availability**: Fully deployed on Vercel with zero requirement for a local laptop, local Python server, or SSH tunnel.
- **Direct 4G Telemetry Ingestion**: The ESP32 device posts telemetry directly over Airtel 4G to `https://<your-project>.vercel.app/api/readings`.
- **Tactical Geospatial Satellite Map**: Real-time Leaflet GPS tracking with dark tactical radar overlay, asset breadcrumb trail, and direct coordinate navigation.
- **Autonomous Perimeter Defense**: PIR motion sensing on GPIO32. Fires SMS alerts with Google Maps links on intrusion and triggers a DEFCON 1 visual alarm on the cloud dashboard.
- **NBC / Hazardous Environmental Sensing**: Real-time air quality index monitoring (MQ-135) and temperature/humidity diagnostics (DHT11).
- **Hardened Power Subsystem**: 3.7V 7600mAh Li-ion battery pack with 1S 5A BMS protection, 3A IP2312 fast charger, and star-topology grounding.

---

## 🚀 1-Click Cloud Deployment to Vercel (No Coding Needed)

1. Open [vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **"Add New..."** $\rightarrow$ **"Project"**.
3. Select your repository: **`Ankur1212s/esp32-sentinel-monitor`**.
4. Click **Deploy**. Vercel will build and launch your dashboard in ~60 seconds!
5. Your dashboard is now permanently live at:
   `https://esp32-sentinel-monitor.vercel.app`

---

## 🔌 Hardware Pinout (ESP32)

| Module Pin | ESP32 Pin / Rail | Purpose / Description |
| :--- | :--- | :--- |
| **A7670C TX** | **RX0 (GPIO 3)** | Modem Hardware UART (115200 baud) |
| **A7670C RX** | **TX0 (GPIO 1)** | Modem Hardware UART (115200 baud) |
| **A7670C VBAT** | **Battery (+)** Direct | 1000µF 25V capacitor in parallel |
| **NEO-6M TX** | **GPIO 25** | Hardware UART1 RX (9600 baud) |
| **NEO-6M RX** | **GPIO 26** | Hardware UART1 TX (9600 baud) |
| **PIR OUT** | **GPIO 32** | Digital motion signal |
| **DHT11 DATA** | **GPIO 4** | Internal pull-up enabled |
| **MQ135 A0** | **GPIO 34** | ADC1 Analog Input (0-3.3V) |
| **5V Sensors Rail** | **MT3608 5V Out** | Powers ESP32 VIN, MQ135 heater, PIR sensor |
| **Star GND** | **Battery (-)** Direct | Common ground tied at battery negative |

---

## 📡 API Endpoints (Vercel Serverless)

- **`POST /api/readings`**: Ingests telemetry from ESP32 over 4G LTE.
  ```json
  {
    "unit_id": "UNIT-ALPHA-01",
    "dist": 28.4,
    "temp": 27.2,
    "hum": 55.0,
    "gas": 420,
    "lat": 28.6139,
    "lon": 77.2090,
    "alert": false
  }
  ```
- **`GET /api/readings`**: Returns live telemetry records and history for the dashboard.
- **`GET /api/alerts`**: Returns recent perimeter breach events.

---

## 📄 License
MIT License - Defense & Tactical Surveillance Open Source
