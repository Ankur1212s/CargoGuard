export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";

export interface TelemetryReading {
  id: string;
  timestamp: string;
  unit_id: string;
  dist: number;
  temp: number;
  hum: number;
  gas: number;
  lat: number;
  lon: number;
  alert: boolean;
  motion?: boolean;
  battery_mv?: number;
  signal_rssi?: number;
}

declare global {
  var __telemetry_store: TelemetryReading[] | undefined;
}

if (!globalThis.__telemetry_store) {
  globalThis.__telemetry_store = [];
}

const store = globalThis.__telemetry_store;

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();

    let lat = parseFloat(data.lat ?? 0);
    let lon = parseFloat(data.lon ?? 0);
    let locSource = (lat !== 0 && lon !== 0) ? "GPS" : "RRU-LAVAD-DEFAULT";

    /*
    // --- PREVIOUS VERCEL IP / CARRIER GEOLOCATION CODE (KEPT AS COMMENT AS REQUESTED) ---
    // Indoor Cellular Carrier Geolocation Fallback using Vercel headers and IP lookup
    if (lat === 0 && lon === 0) {
      const vLat = req.headers.get("x-vercel-ip-latitude");
      const vLon = req.headers.get("x-vercel-ip-longitude");
      if (vLat && vLon && parseFloat(vLat) !== 0 && parseFloat(vLon) !== 0) {
        lat = parseFloat(vLat);
        lon = parseFloat(vLon);
        locSource = "CELLULAR-LBS";
      } else {
        const forwarded = req.headers.get("x-forwarded-for");
        const clientIp = forwarded ? forwarded.split(",")[0].trim() : null;
        if (clientIp && !clientIp.startsWith("127.") && !clientIp.startsWith("192.168.")) {
          try {
            const geoRes = await fetch(`http://ip-api.com/json/${clientIp}?fields=status,lat,lon,city`, {
              signal: AbortSignal.timeout(1500),
            });
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData.status === "success" && geoData.lat && geoData.lon) {
                lat = geoData.lat;
                lon = geoData.lon;
                locSource = "CELLULAR-LBS";
              }
            }
          } catch (e) {
            // Silently ignore geo lookup error
          }
        }
      }
    }
    // ----------------------------------------------------------------------------------
    */

    // Default Location: Rashtriya Raksha University (RRU), Lavad, Dahegam, Gandhinagar, Gujarat
    const RRU_DEFAULT_LAT = 23.154455;
    const RRU_DEFAULT_LON = 72.885000;

    if (lat === 0 && lon === 0) {
      lat = RRU_DEFAULT_LAT;
      lon = RRU_DEFAULT_LON;
      locSource = "RRU-LAVAD";
    }

    const reading: TelemetryReading = {
      id: "tlm-" + Date.now(),
      timestamp: new Date().toISOString(),
      unit_id: String(data.unit_id || "UNIT-01"),
      dist: parseFloat(data.dist ?? 0),
      temp: parseFloat(data.temp ?? 0),
      hum: parseFloat(data.hum ?? 0),
      gas: parseFloat(data.gas ?? 0),
      lat: lat,
      lon: lon,
      alert: Boolean(data.alert === true || data.alert === "true" || data.alert === 1 || data.alert === "1"),
      motion: Boolean(data.motion === true || data.motion === "true" || data.motion === 1 || data.motion === "1"),
      battery_mv: data.battery_mv ? parseInt(data.battery_mv) : 3930,
      signal_rssi: data.signal_rssi ? parseInt(data.signal_rssi) : 22,
    };

    store.push(reading);
    if (store.length > 200) {
      store.shift();
    }

    return NextResponse.json({
      status: "success",
      timestamp: reading.timestamp,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error?.message || "Invalid payload" },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  // Default standby record centered on vehicle location at Rashtriya Raksha University, Lavad, Dahegam
  const defaultStandby: TelemetryReading = {
    id: "tlm-standby-rru",
    timestamp: new Date().toISOString(),
    unit_id: "VEHICLE-01",
    dist: 0,
    temp: 27.0,
    hum: 52.0,
    gas: 310,
    lat: 23.154455,
    lon: 72.885000,
    alert: false,
    motion: false,
    battery_mv: 3930,
    signal_rssi: 22,
  };

  const hasRealData = store.length > 0;
  const latest = hasRealData ? store[store.length - 1] : defaultStandby;

  let isOnline = false;
  if (hasRealData && latest && latest.timestamp) {
    const diffSeconds = (Date.now() - new Date(latest.timestamp).getTime()) / 1000;
    isOnline = diffSeconds < 45;
  }

  return NextResponse.json({
    is_online: isOnline,
    total_count: store.length,
    latest: latest,
    readings: hasRealData ? store.slice(-30) : [defaultStandby],
  });
}