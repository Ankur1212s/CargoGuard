import sqlite3
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI(title="Remote IoT Sentinel Dashboard")
DB_FILE = "readings.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            distance REAL,
            temp REAL,
            hum REAL,
            gas REAL,
            lat REAL,
            lon REAL,
            alert INTEGER
        )
    """)
    conn.commit()
    conn.close()

init_db()

@app.post("/api/readings")
async def receive_reading(request: Request):
    data = await request.json()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    dist = float(data.get("dist", 0))
    temp = float(data.get("temp", 0))
    hum = float(data.get("hum", 0))
    gas = float(data.get("gas", 0))
    lat = float(data.get("lat", 0))
    lon = float(data.get("lon", 0))
    alert = 1 if data.get("alert") in [True, "true", 1, "1"] else 0

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        INSERT INTO readings (timestamp, distance, temp, hum, gas, lat, lon, alert)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (now, dist, temp, hum, gas, lat, lon, alert))
    conn.commit()
    conn.close()

    print(f"[{now}] [TELEMETRY] Temp: {temp}C, Hum: {hum}%, Gas: {gas}, Dist: {dist}cm (Alert: {alert})")
    return {"status": "success"}

@app.get("/api/data/latest")
async def get_latest():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    row = c.execute("SELECT * FROM readings ORDER BY id DESC LIMIT 1").fetchone()
    conn.close()
    if not row:
        return {}
    return dict(row)

@app.get("/api/data/history")
async def get_history():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    rows = c.execute("SELECT * FROM readings ORDER BY id DESC LIMIT 30").fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    return """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentinel IoT Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body class="bg-slate-950 text-slate-100 font-sans min-h-screen">
  <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4 flex justify-between items-center sticky top-0 z-50">
    <div class="flex items-center gap-3">
      <div class="h-3 w-3 rounded-full bg-emerald-500 animate-ping"></div>
      <h1 class="text-xl font-bold tracking-wide text-white">SENTINEL-4G <span class="text-xs text-emerald-400 font-mono px-2 py-0.5 bg-emerald-950/60 border border-emerald-800 rounded">ONLINE</span></h1>
    </div>
    <div class="text-xs text-slate-400 font-mono" id="last-update">Waiting for data...</div>
  </header>

  <div id="alert-banner" class="hidden bg-rose-600/90 text-white px-6 py-3 font-semibold text-center animate-pulse border-b border-rose-400">
    🚨 CRITICAL: INTRUSION DETECTED! <span id="alert-detail" class="font-mono text-sm underline ml-2"></span>
  </div>

  <main class="max-w-7xl mx-auto p-6 space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
        <span class="text-xs text-slate-400 uppercase font-bold">Proximity</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-3xl font-black text-white" id="kpi-dist">--</span>
          <span class="text-sm text-slate-400">cm</span>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
        <span class="text-xs text-slate-400 uppercase font-bold">Temperature</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-3xl font-black text-amber-400" id="kpi-temp">--</span>
          <span class="text-sm text-slate-400">°C</span>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
        <span class="text-xs text-slate-400 uppercase font-bold">Humidity</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-3xl font-black text-cyan-400" id="kpi-hum">--</span>
          <span class="text-sm text-slate-400">%</span>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
        <span class="text-xs text-slate-400 uppercase font-bold">Air Quality (MQ135)</span>
        <div class="mt-2 flex items-baseline justify-between">
          <span class="text-3xl font-black text-emerald-400" id="kpi-gas">--</span>
          <span class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300" id="gas-badge">Normal</span>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow">
        <span class="text-xs text-slate-400 uppercase font-bold">Security Status</span>
        <div class="mt-2">
          <span class="text-lg font-bold px-3 py-1 rounded inline-block" id="kpi-status">SECURE</span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow flex flex-col">
        <div class="flex justify-between items-center mb-3">
          <h2 class="font-bold text-slate-200">Live GPS Location</h2>
          <a id="gmaps-link" href="#" target="_blank" class="text-xs text-blue-400 hover:underline">Open in Google Maps ↗</a>
        </div>
        <div id="map" class="h-80 w-full rounded-lg border border-slate-800"></div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow flex flex-col">
        <h2 class="font-bold text-slate-200 mb-3">Environmental Trends</h2>
        <div class="relative h-80 w-full">
          <canvas id="envChart"></canvas>
        </div>
      </div>
    </div>
  </main>

  <script>
    const map = L.map('map').setView([12.9716, 77.5946], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    let marker = L.marker([12.9716, 77.5946]).addTo(map).bindPopup("Device Position");
    let trail = L.polyline([], {color: '#10b981', weight: 4}).addTo(map);

    const ctx = document.getElementById('envChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Temp (°C)', data: [], borderColor: '#fbbf24', tension: 0.3 },
          { label: 'Humidity (%)', data: [], borderColor: '#22d3ee', tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: '#1e293b' } },
          y: { grid: { color: '#1e293b' } }
        }
      }
    });

    async function updateDashboard() {
      try {
        const res = await fetch('/api/data/latest');
        const d = await res.json();
        if (!d || !d.timestamp) return;

        document.getElementById('last-update').innerText = 'Last Sync: ' + d.timestamp;
        document.getElementById('kpi-dist').innerText = d.distance.toFixed(1);
        document.getElementById('kpi-temp').innerText = d.temp.toFixed(1);
        document.getElementById('kpi-hum').innerText = d.hum.toFixed(1);
        document.getElementById('kpi-gas').innerText = Math.round(d.gas);

        const statusEl = document.getElementById('kpi-status');
        const banner = document.getElementById('alert-banner');
        if (d.alert === 1) {
          statusEl.innerText = "BREACH DETECTED";
          statusEl.className = "text-lg font-bold px-3 py-1 rounded bg-rose-950 text-rose-300 border border-rose-800";
          banner.classList.remove('hidden');
          document.getElementById('alert-detail').innerText = `Object at ${d.distance.toFixed(1)} cm!`;
        } else {
          statusEl.innerText = "ARMED / SECURE";
          statusEl.className = "text-lg font-bold px-3 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800";
          banner.classList.add('hidden');
        }

        if (d.lat && d.lon && (d.lat !== 0 || d.lon !== 0)) {
          marker.setLatLng([d.lat, d.lon]);
          map.panTo([d.lat, d.lon]);
          trail.addLatLng([d.lat, d.lon]);
          document.getElementById('gmaps-link').href = `https://maps.google.com/?q=${d.lat},${d.lon}`;
        }

        const histRes = await fetch('/api/data/history');
        const hist = await histRes.json();
        chart.data.labels = hist.map(r => r.timestamp.split(' ')[1]);
        chart.data.datasets[0].data = hist.map(r => r.temp);
        chart.data.datasets[1].data = hist.map(r => r.hum);
        chart.update();

      } catch (err) {
        console.error("Sync error:", err);
      }
    }

    setInterval(updateDashboard, 2500);
    updateDashboard();
  </script>
</body>
</html>
    """

if __name__ == "__main__":
    print("Starting Sentinel Web Dashboard on http://localhost:8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
