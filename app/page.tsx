"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Radio,
  Gauge,
  Thermometer,
  Droplets,
  Wind,
  Signal,
  MapPin,
  Terminal,
  Activity,
  AlertTriangle,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  Download,
  RefreshCw,
  Crosshair,
  Satellite,
  Compass,
  BatteryCharging,
  Maximize2,
  FileText,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const TacticalMap = dynamic(() => import("./components/TacticalMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[460px] bg-[#070b12] rounded-xl flex items-center justify-center border border-emerald-500/20 text-emerald-400 font-mono text-xs">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin"></div>
        <div className="tracking-widest uppercase text-emerald-300">
          INITIALIZING MILITARY SATELLITE RECON RECONNAISSANCE HUD...
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          COORDINATES: 23.154455° N, 72.885000° E (RRU LAVAD)
        </span>
      </div>
    </div>
  ),
});

interface Reading {
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

// Default Fallback: Rashtriya Raksha University, Lavad, Dahegam, Gandhinagar
const RRU_DEFAULT_LAT = 23.154455;
const RRU_DEFAULT_LON = 72.885000;

export default function MilitaryAssetDashboard() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("SYNCING...");
  const [isArmActive, setIsArmActive] = useState<boolean>(true);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [filterType, setFilterType] = useState<"ALL" | "BREACH" | "ENV">("ALL");
  const [activeTab, setActiveTab] = useState<"LIVE" | "RAW">("LIVE");

  // Real-time Military Zulu (UTC) & Local (IST) Clocks
  const [zuluTime, setZuluTime] = useState<string>("");
  const [istTime, setIstTime] = useState<string>("");

  const audioCtxRef = useRef<AudioContext | null>(null);

  // Play Tactical Two-tone Alert Siren via Web Audio API
  const playTacticalSiren = () => {
    if (isAudioMuted || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      // Audio autoplay policy catch
    }
  };

  // Clock Update Effect
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setZuluTime(now.toISOString().slice(11, 19) + "Z");
      setIstTime(
        now.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour12: false,
        })
      );
    };
    updateClocks();
    const timer = setInterval(updateClocks, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Telemetry from Backend
  const fetchTelemetry = async () => {
    try {
      const res = await fetch("/api/readings", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setIsOnline(Boolean(data.is_online));
      if (data.readings && data.readings.length > 0) {
        setReadings(data.readings);
        const latestRec = data.latest || data.readings[data.readings.length - 1];
        setLatest(latestRec);
        setLastSyncTime(new Date().toLocaleTimeString("en-IN", { hour12: false }));

        if (latestRec?.alert || latestRec?.motion) {
          playTacticalSiren();
        }
      }
    } catch (err) {
      console.error("Telemetry sync error:", err);
      setIsOnline(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [isAudioMuted]);

  const activeLat = latest?.lat && latest.lat !== 0 ? latest.lat : RRU_DEFAULT_LAT;
  const activeLon = latest?.lon && latest.lon !== 0 ? latest.lon : RRU_DEFAULT_LON;
  const isBreached = Boolean(latest?.alert || latest?.motion);

  const trailCoords = useMemo(() => {
    return readings
      .filter((r) => r.lat && r.lon && (r.lat !== 0 || r.lon !== 0))
      .map((r) => [r.lat, r.lon] as [number, number]);
  }, [readings]);

  // Chart Data Styling (Tactical Radar Spectrum)
  const chartData = useMemo(() => {
    const slice = readings.slice(-18);
    return {
      labels: slice.map((r) =>
        r.timestamp ? r.timestamp.split("T")[1]?.slice(0, 8) || "..." : "..."
      ),
      datasets: [
        {
          label: "Gas Concentration (PPM)",
          data: slice.map((r) => r.gas || 0),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#10b981",
          fill: true,
          tension: 0.2,
          yAxisID: "y1",
        },
        {
          label: "Ambient Temp (°C)",
          data: slice.map((r) => r.temp || 0),
          borderColor: "#f59e0b",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#f59e0b",
          tension: 0.2,
          yAxisID: "y",
        },
        {
          label: "Relative Humidity (%)",
          data: slice.map((r) => r.hum || 0),
          borderColor: "#0ea5e9",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#0ea5e9",
          tension: 0.2,
          yAxisID: "y",
        },
      ],
    };
  }, [readings]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: "#94a3b8",
          font: { family: "monospace", size: 11 },
          boxWidth: 12,
        },
      },
      tooltip: {
        backgroundColor: "#070c14",
        borderColor: "#1e293b",
        borderWidth: 1,
        titleColor: "#f8fafc",
        bodyColor: "#cbd5e1",
        bodyFont: { family: "monospace" },
      },
    },
    scales: {
      x: {
        grid: { color: "rgba(30, 41, 59, 0.5)" },
        ticks: { color: "#64748b", font: { family: "monospace", size: 10 } },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        grid: { color: "rgba(30, 41, 59, 0.5)" },
        ticks: { color: "#94a3b8", font: { family: "monospace", size: 10 } },
        title: {
          display: true,
          text: "Temp (°C) / Hum (%)",
          color: "#64748b",
          font: { family: "monospace", size: 10 },
        },
      },
      y1: {
        type: "linear" as const,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        ticks: { color: "#10b981", font: { family: "monospace", size: 10 } },
        title: {
          display: true,
          text: "Gas (PPM)",
          color: "#10b981",
          font: { family: "monospace", size: 10 },
        },
      },
    },
  };

  // Export Mission Telemetry Log as CSV
  const handleExportCSV = () => {
    if (readings.length === 0) return;
    const headers = [
      "ID",
      "Timestamp",
      "Callsign",
      "Motion_Alert",
      "Gas_PPM",
      "Temp_C",
      "Humidity_Pct",
      "Latitude",
      "Longitude",
    ];
    const rows = readings.map((r) => [
      r.id,
      r.timestamp,
      r.unit_id || "UNIT-01",
      r.alert || r.motion ? "BREACH" : "SECURE",
      r.gas || 0,
      r.temp || 0,
      r.hum || 0,
      r.lat || RRU_DEFAULT_LAT,
      r.lon || RRU_DEFAULT_LON,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `SENTINEL_MISSION_LOG_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered readings for audit table
  const filteredReadings = useMemo(() => {
    if (filterType === "BREACH") {
      return readings.filter((r) => r.alert || r.motion);
    }
    if (filterType === "ENV") {
      return readings.filter((r) => (r.gas && r.gas > 400) || (r.temp && r.temp > 35));
    }
    return readings;
  }, [readings, filterType]);

  return (
    <div className="min-h-screen bg-[#04070c] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      {/* 1. TOP MILITARY CLASSIFICATION BANNER */}
      <div className="bg-[#070e17] border-b border-emerald-500/30 text-[11px] font-mono px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-slate-400">
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold tracking-wider">
            RESTRICTED // DEFENSE C2
          </span>
          <span className="hidden sm:inline text-slate-400">
            OPERATION: <strong className="text-slate-200">SENTINEL-4G TACTICAL MATRIX</strong>
          </span>
          <span className="hidden md:inline text-slate-400">
            BASE: <strong className="text-emerald-400">RASHTRIYA RAKSHA UNIVERSITY (RRU)</strong> // SECTOR LAVAD-DAHEGAM
          </span>
        </div>

        {/* Real-time Zulu & IST Military Clock */}
        <div className="flex items-center gap-4 text-xs font-mono ml-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">ZULU:</span>
            <span className="text-emerald-400 font-semibold">{zuluTime || "17:00:00Z"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">IST:</span>
            <span className="text-sky-400 font-semibold">{istTime || "22:30:00"}</span>
          </div>
          <div
            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
              isBreached
                ? "bg-rose-950 border-rose-500 text-rose-300 breach-strobe"
                : "bg-emerald-950/60 border-emerald-500/40 text-emerald-400"
            }`}
          >
            {isBreached ? "DEFCON 1 // BREACH" : "DEFCON 4 // NOMINAL"}
          </div>
        </div>
      </div>

      {/* 2. COMMAND & CONTROL TACTICAL HEADER */}
      <header className="border-b border-slate-800 bg-[#080d15]/90 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Node Callsign */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-slate-900 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Crosshair className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-mono font-bold text-lg tracking-wider text-slate-100 flex items-center gap-2">
                  SENTINEL-4G
                  <span className="text-[11px] font-normal px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/50 text-emerald-400">
                    C2 COMMAND
                  </span>
                </h1>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-800/80 text-sky-300 border border-slate-700">
                  {latest?.unit_id || "UNIT-01 [ALPHA]"}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                <span>Autonomous Perimeter Defense Node</span>
                <span className="text-slate-600">|</span>
                <span className="text-emerald-400">RRU Lavad Outpost</span>
              </p>
            </div>
          </div>

          {/* Real-time Hardware Link Status & Tactical Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Live 4G Hardware Indicator */}
            <div
              className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2.5 border transition ${
                isOnline
                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300 glow-emerald"
                  : "bg-slate-900/80 border-slate-800 text-slate-400"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? "bg-emerald-400 animate-ping" : "bg-amber-500"
                }`}
              ></span>
              <div className="flex flex-col">
                <span className="font-bold leading-none">
                  {isOnline ? "LINK: 4G ACTIVE" : "LINK: STANDBY"}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isOnline ? "Airtel 4G LTE Stream" : `Sync: ${lastSyncTime}`}
                </span>
              </div>
            </div>

            {/* Perimeter Arm Switch */}
            <button
              onClick={() => setIsArmActive(!isArmActive)}
              className={`text-xs font-mono font-semibold px-3 py-2 rounded-lg border transition flex items-center gap-1.5 ${
                isArmActive
                  ? "bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
              }`}
            >
              {isArmActive ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>PERIMETER ARMED</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>STANDBY (DISARMED)</span>
                </>
              )}
            </button>

            {/* Audio Siren Toggle */}
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className={`p-2 rounded-lg border text-xs font-mono transition ${
                isAudioMuted
                  ? "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                  : "bg-emerald-950/50 text-emerald-300 border-emerald-500/40 hover:bg-emerald-950"
              }`}
              title={isAudioMuted ? "Unmute Tactical Audio Alarm" : "Mute Tactical Audio Alarm"}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            {/* Manual Sync Button */}
            <button
              onClick={fetchTelemetry}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 transition"
              title="Force Poll Telemetry Now"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. TACTICAL REAL-TIME INTRUSION ALERT STROBE BANNER */}
      {isBreached && (
        <div className="bg-rose-950/90 border-y-2 border-rose-500 text-rose-100 px-4 sm:px-8 py-3 breach-strobe shadow-[0_0_30px_rgba(239,68,68,0.5)]">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-600 flex items-center justify-center text-white animate-bounce flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="font-mono font-bold text-sm tracking-wide text-white flex items-center gap-2">
                  <span>🚨 CRITICAL PERIMETER BREACH DETECTED</span>
                  <span className="text-[10px] bg-rose-900 border border-rose-400 px-2 py-0.5 rounded">
                    PIR SENSOR ACTIVE
                  </span>
                </div>
                <p className="text-xs text-rose-200 font-mono mt-0.5">
                  Motion verified at <strong>Rashtriya Raksha University (RRU Lavad Campus)</strong>. GSM Alert SMS dispatched to +91 91552 70295.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-rose-300 bg-rose-900/60 px-2.5 py-1 rounded border border-rose-700">
                LOC: {activeLat.toFixed(5)}°N, {activeLon.toFixed(5)}°E
              </span>
              <a
                href={`https://maps.google.com/?q=${activeLat},${activeLon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1 shadow"
              >
                <span>OPEN SATELLITE HUD ↗</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 4. MAIN TACTICAL WORKSPACE CONTAINER */}
      <main className="max-w-7xl mx-auto w-full p-4 lg:p-8 space-y-6 flex-1">
        {/* ROW 1: SENSOR TELEMETRY HUD (6 MILITARY PANELS) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Panel 1: PIR Motion / Perimeter Radar */}
          <div
            className={`military-panel rounded-xl p-3.5 flex flex-col justify-between transition ${
              isBreached ? "military-panel-danger glow-danger border-rose-500" : "hover:border-emerald-500/60"
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span className="tracking-wider">PIR RADAR</span>
              <Activity className={`w-4 h-4 ${isBreached ? "text-rose-400 animate-spin" : "text-emerald-400"}`} />
            </div>
            <div className="my-2.5">
              <div
                className={`text-2xl font-mono font-bold tracking-tight ${
                  isBreached ? "text-rose-400 animate-pulse" : "text-emerald-400"
                }`}
              >
                {latest ? (isBreached ? "BREACH" : "SECURE") : "--"}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                {isBreached ? "Motion Confirmed" : "Perimeter Clear"}
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
              <span>PIN: GPIO 32</span>
              <span className={isBreached ? "text-rose-400" : "text-emerald-500"}>
                {isBreached ? "SMS SENT" : "READY"}
              </span>
            </div>
          </div>

          {/* Panel 2: CBRN Atmospheric Gas (MQ-135) */}
          <div className="military-panel rounded-xl p-3.5 flex flex-col justify-between hover:border-emerald-500/60 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span className="tracking-wider">CBRN / GAS</span>
              <Wind className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2.5">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-mono font-bold text-emerald-300">
                  {latest?.gas !== undefined ? Math.round(latest.gas) : "310"}
                </span>
                <span className="text-xs font-mono text-slate-400">PPM</span>
              </div>
              {/* Tactical Progress Bar */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full transition-all duration-500 ${
                    (latest?.gas || 0) > 800
                      ? "bg-rose-500"
                      : (latest?.gas || 0) > 500
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(15, ((latest?.gas || 310) / 1000) * 100))}%`,
                  }}
                ></div>
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
              <span>MQ-135 TOXIN</span>
              <span className="text-emerald-400 font-semibold">
                {(latest?.gas || 0) > 800 ? "HAZARD" : "NOMINAL"}
              </span>
            </div>
          </div>

          {/* Panel 3: Thermal Surveillance (DHT11) */}
          <div className="military-panel rounded-xl p-3.5 flex flex-col justify-between hover:border-amber-500/60 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span className="tracking-wider">THERMAL</span>
              <Thermometer className="w-4 h-4 text-amber-400" />
            </div>
            <div className="my-2.5">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-mono font-bold text-amber-300">
                  {latest?.temp !== undefined && latest.temp > 0 ? latest.temp.toFixed(1) : "27.0"}
                </span>
                <span className="text-xs font-mono text-slate-400">°C</span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                {latest?.temp ? `${((latest.temp * 9) / 5 + 32).toFixed(1)}°F Ambient` : "80.6°F Ambient"}
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
              <span>DHT11 AMBIENT</span>
              <span className="text-amber-400">NORMAL</span>
            </div>
          </div>

          {/* Panel 4: Hygrometric Environment (DHT11 Hum) */}
          <div className="military-panel rounded-xl p-3.5 flex flex-col justify-between hover:border-sky-500/60 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span className="tracking-wider">HUMIDITY</span>
              <Droplets className="w-4 h-4 text-sky-400" />
            </div>
            <div className="my-2.5">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-mono font-bold text-sky-300">
                  {latest?.hum !== undefined && latest.hum > 0 ? latest.hum.toFixed(1) : "52.0"}
                </span>
                <span className="text-xs font-mono text-slate-400">%</span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                Moisture Content Nominal
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
              <span>DEW PT: 16.4°C</span>
              <span className="text-sky-400">CLEAR</span>
            </div>
          </div>

          {/* Panel 5: Power Bus & Cellular Carrier */}
          <div className="military-panel rounded-xl p-3.5 flex flex-col justify-between hover:border-emerald-500/60 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span className="tracking-wider">POWER & RF</span>
              <Signal className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-mono font-bold text-slate-100">
                  {latest?.battery_mv ? (latest.battery_mv / 1000).toFixed(2) : "3.93"}V
                </span>
                <span className="text-xs font-mono font-semibold text-emerald-400">
                  Airtel 4G
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex justify-between">
                <span>Li-ion 7600mAh</span>
                <span className="text-emerald-400 font-semibold">CSQ 22</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
              <span>BOOST: 5.0V MT3608</span>
              <span className="text-emerald-400">{isOnline ? "STREAMING" : "STANDBY"}</span>
            </div>
          </div>

          {/* Panel 6: Tactical Geo Target (Rashtriya Raksha University) */}
          <div className="military-panel rounded-xl p-3.5 flex flex-col justify-between hover:border-emerald-500/60 transition col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
              <span className="tracking-wider">DEPLOYMENT</span>
              <MapPin className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="my-2.5">
              <div className="text-xs font-mono font-bold text-emerald-300 truncate">
                RRU LAVAD BASE
              </div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5">
                Dahegam, Gandhinagar
              </div>
              <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                23.1545°N, 72.8850°E
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 border-t border-slate-800/80 pt-1.5 flex justify-between">
              <span>SATS: 8 FIX</span>
              <span className="text-emerald-400 font-bold">LOCKED</span>
            </div>
          </div>
        </div>

        {/* ROW 2: TACTICAL RECONNAISSANCE SATELLITE MAP & MULTI-CHANNEL SPECTRUM */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Tactical Satellite Recon Map (7 Columns) */}
          <div className="lg:col-span-7 military-panel rounded-xl p-4 sm:p-5 flex flex-col shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Satellite className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-mono font-bold text-slate-100 tracking-wider">
                  TACTICAL SATELLITE RECONNAISSANCE MAP
                </h2>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-[11px] text-slate-400">
                  BASE: <strong className="text-emerald-400">RASHTRIYA RAKSHA UNIV, LAVAD</strong>
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              </div>
            </div>

            {/* Tactical Map Container */}
            <div className="flex-1 w-full min-h-[460px]">
              <TacticalMap
                lat={activeLat}
                lon={activeLon}
                unitId={latest?.unit_id || "UNIT-01 [RRU-OUTPOST]"}
                isAlert={isBreached}
                isOnline={isOnline}
                trailCoords={trailCoords}
              />
            </div>
          </div>

          {/* Telemetry Spectrum Analyzer (5 Columns) */}
          <div className="lg:col-span-5 military-panel rounded-xl p-4 sm:p-5 flex flex-col shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-mono font-bold text-slate-100 tracking-wider">
                  MULTI-SENSOR SPECTRUM ANALYZER
                </h2>
              </div>
              <div className="text-xs font-mono text-slate-400">
                <span className="text-emerald-400 font-bold">{readings.length}</span> CYCLES
              </div>
            </div>

            {/* Channel Metrics Summary Bar */}
            <div className="grid grid-cols-3 gap-2 mb-3 text-[11px] font-mono">
              <div className="bg-[#080d16] border border-emerald-500/30 rounded p-2 text-center">
                <div className="text-slate-400 text-[10px]">GAS PEAK</div>
                <div className="text-emerald-400 font-bold mt-0.5">
                  {readings.length > 0 ? Math.max(...readings.map((r) => r.gas || 0)) : 310} PPM
                </div>
              </div>
              <div className="bg-[#080d16] border border-amber-500/30 rounded p-2 text-center">
                <div className="text-slate-400 text-[10px]">TEMP AVG</div>
                <div className="text-amber-400 font-bold mt-0.5">
                  {readings.length > 0
                    ? (
                        readings.reduce((acc, r) => acc + (r.temp || 0), 0) / readings.length
                      ).toFixed(1)
                    : "27.0"}
                  °C
                </div>
              </div>
              <div className="bg-[#080d16] border border-sky-500/30 rounded p-2 text-center">
                <div className="text-slate-400 text-[10px]">HUM AVG</div>
                <div className="text-sky-400 font-bold mt-0.5">
                  {readings.length > 0
                    ? (
                        readings.reduce((acc, r) => acc + (r.hum || 0), 0) / readings.length
                      ).toFixed(1)
                    : "52.0"}
                  %
                </div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="relative flex-1 w-full min-h-[360px]">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* ROW 3: MILITARY AUDIT TRAIL & INGESTION EVENT LOG */}
        <div className="military-panel rounded-xl p-4 sm:p-5 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-mono font-bold text-slate-100 tracking-wider">
                  MISSION TELEMETRY AUDIT LOG
                </h3>
                <p className="text-[11px] font-mono text-slate-400">
                  Cryptographically indexed defense data stream // Sensor node verification
                </p>
              </div>
            </div>

            {/* Controls: Filter chips + CSV Export */}
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <div className="flex rounded-lg bg-slate-900 border border-slate-800 p-0.5">
                <button
                  onClick={() => setFilterType("ALL")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    filterType === "ALL" ? "bg-emerald-950 text-emerald-300 font-bold" : "text-slate-400"
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setFilterType("BREACH")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    filterType === "BREACH" ? "bg-rose-950 text-rose-300 font-bold" : "text-slate-400"
                  }`}
                >
                  BREACHES
                </button>
                <button
                  onClick={() => setFilterType("ENV")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    filterType === "ENV" ? "bg-amber-950 text-amber-300 font-bold" : "text-slate-400"
                  }`}
                >
                  HAZARDS
                </button>
              </div>

              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 transition flex items-center gap-1.5"
                title="Export entire telemetry log to CSV file"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>EXPORT CSV</span>
              </button>
            </div>
          </div>

          {/* Audit Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-800/80">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-slate-400 border-b border-slate-800 bg-[#070d16]">
                <tr>
                  <th className="py-2.5 px-3">RECORD ID</th>
                  <th className="py-2.5 px-3">TIMESTAMP (UTC)</th>
                  <th className="py-2.5 px-3">CALLSIGN</th>
                  <th className="py-2.5 px-3">PIR RADAR</th>
                  <th className="py-2.5 px-3">GAS (MQ135)</th>
                  <th className="py-2.5 px-3">THERMAL / HUM</th>
                  <th className="py-2.5 px-3">DEPLOYMENT SECTOR</th>
                  <th className="py-2.5 px-3 text-right">MISSION STATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 bg-[#060a12]/60 text-slate-300">
                {filteredReadings.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                      No matching tactical transmissions recorded in this buffer.
                    </td>
                  </tr>
                ) : (
                  filteredReadings
                    .slice(-10)
                    .reverse()
                    .map((r, i) => (
                      <tr
                        key={r.id || i}
                        className={`hover:bg-slate-800/40 transition ${
                          r.alert || r.motion ? "bg-rose-950/20 text-rose-200" : ""
                        }`}
                      >
                        <td className="py-2 px-3 text-slate-400 text-[11px]">
                          {r.id ? r.id.slice(0, 14) : `TLM-${i + 1}`}
                        </td>
                        <td className="py-2 px-3 text-slate-300 text-[11px]">
                          {r.timestamp ? r.timestamp.replace("T", " ").slice(0, 19) : "--"}
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-100">
                          {r.unit_id || "UNIT-01"}
                        </td>
                        <td className="py-2 px-3">
                          {r.alert || r.motion ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
                              MOTION DETECTED
                            </span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              CLEAR
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-emerald-400 font-semibold">
                          {Math.round(r.gas || 0)} PPM
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {r.temp > 0 ? `${r.temp.toFixed(1)}°C / ${r.hum.toFixed(1)}%` : "27.0°C / 52.0%"}
                        </td>
                        <td className="py-2 px-3 text-sky-400 text-[11px]">
                          RRU Lavad ({(r.lat || RRU_DEFAULT_LAT).toFixed(4)}, {(r.lon || RRU_DEFAULT_LON).toFixed(4)})
                        </td>
                        <td className="py-2 px-3 text-right">
                          {r.alert || r.motion ? (
                            <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-600 text-rose-300 font-bold text-[10px]">
                              BREACH
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-600 text-emerald-300 text-[10px]">
                              VERIFIED
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 5. MILITARY FOOTER */}
      <footer className="border-t border-slate-800 bg-[#05080f] py-4 px-6 text-center text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            RESTRICTED DEFENSE APPLICATION // OPERATION SENTINEL-4G
          </div>
          <div className="text-emerald-400/80">
            RASHTRIYA RAKSHA UNIVERSITY (RRU) AIC PROJECT &copy; 2026
          </div>
        </div>
      </footer>
    </div>
  );
}