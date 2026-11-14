"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";

interface TacticalMapProps {
  lat?: number;
  lon?: number;
  unitId: string;
  isAlert: boolean;
  isOnline: boolean;
  trailCoords: [number, number][];
  locSource?: string;
}

// Default Vehicle Coordinates: Rashtriya Raksha University (RRU), Lavad, Dahegam, Gandhinagar, Gujarat
const RRU_DEFAULT_LAT = 23.154455;
const RRU_DEFAULT_LON = 72.885000;

export default function TacticalMap({
  lat,
  lon,
  unitId,
  isAlert,
  isOnline,
  trailCoords,
  locSource = "CELL_TOWER",
}: TacticalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const trailPolylineRef = useRef<L.Polyline | null>(null);
  const perimeterCircleRef = useRef<L.Circle | null>(null);
  const outerCircleRef = useRef<L.Circle | null>(null);
  const [showRings, setShowRings] = useState<boolean>(true);

  // If lat/lon are 0 or not provided, default to vehicle location at Rashtriya Raksha University, Lavad, Dahegam
  const activeLat = (lat && lat !== 0) ? lat : RRU_DEFAULT_LAT;
  const activeLon = (lon && lon !== 0) ? lon : RRU_DEFAULT_LON;

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Custom Military Tactical Marker Icon: Precision Reticle for GPS vs Cellular Tower for LBS
    const buildMarkerIcon = (alert: boolean, online: boolean, gps: boolean) => {
      if (gps) {
        const ringColor = alert ? "border-rose-500 bg-rose-500/20" : online ? "border-emerald-400 bg-emerald-500/15" : "border-amber-400 bg-amber-500/15";
        const centerColor = alert ? "bg-rose-600 border-rose-200" : online ? "bg-emerald-500 border-white" : "bg-amber-500 border-zinc-900";

        return L.divIcon({
          className: "military-marker-reticle",
          html: `
            <div class="relative flex items-center justify-center w-12 h-12 -ml-3 -mt-3 pointer-events-none">
              <div class="absolute inset-0 rounded-full border ${ringColor} ${alert ? 'animate-ping' : 'animate-pulse'}"></div>
              <div class="absolute w-8 h-8 rounded-full border border-dashed ${alert ? 'border-rose-400' : 'border-emerald-400/80'} animate-spin" style="animation-duration: 8s;"></div>
              <div class="absolute w-10 h-[1px] ${alert ? 'bg-rose-400' : 'bg-emerald-400'} opacity-75"></div>
              <div class="absolute h-10 w-[1px] ${alert ? 'bg-rose-400' : 'bg-emerald-400'} opacity-75"></div>
              <div class="w-3.5 h-3.5 rounded-full ${centerColor} border-2 relative z-20 shadow-[0_0_12px_rgba(16,185,129,0.8)]"></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
      } else {
        // Cellular Base Station Tower Icon with Radiating Radar Waves
        return L.divIcon({
          className: "cellular-tower-marker",
          html: `
            <div class="relative flex items-center justify-center w-14 h-14 -ml-4 -mt-4 pointer-events-none">
              <div class="absolute inset-0 rounded-full border border-sky-400/60 bg-sky-500/15 animate-ping" style="animation-duration: 3s;"></div>
              <div class="absolute w-9 h-9 rounded-full border border-sky-400/80 bg-sky-950/80 flex items-center justify-center text-sky-300 shadow-[0_0_15px_rgba(14,165,233,0.8)]">
                <span style="font-size: 16px;">📡</span>
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
      }
    };

    const isGps = locSource === "GPS";
    const primaryRadius = isGps ? 100 : 750;
    const outerRadius = isGps ? 300 : 1200;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [activeLat, activeLon],
        zoom: 16,
        zoomControl: false,
        attributionControl: false,
      });

      // Military-Grade Esri High-Resolution World Imagery
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: "Esri Satellite Imagery",
          maxZoom: 19,
        }
      ).addTo(map);

      // Add zoom control at bottom right to avoid blocking top tactical telemetry
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const marker = L.marker([activeLat, activeLon], {
        icon: buildMarkerIcon(isAlert, isOnline, isGps),
      }).addTo(map);

      marker.bindPopup(`
        <div style="font-family: monospace; font-size: 11px; padding: 4px; color: #18181b;">
          <div style="font-weight: bold; color: ${isAlert ? '#dc2626' : (isGps ? '#059669' : '#0284c7')}; border-bottom: 1px solid #e4e4e7; padding-bottom: 3px;">
            ${isAlert ? '🚨 CARGO BREACH / TAMPER DETECTED' : (isGps ? '🎯 PRECISION GPS PINPOINT' : '📡 4G CELL TOWER SECTOR')}
          </div>
          <div style="margin-top: 4px;"><b>VEHICLE ID:</b> ${unitId}</div>
          <div><b>MODE:</b> ${isGps ? 'Hardware NEO-6M GPS (±2.5m)' : 'Cellular Triangulation Region (±750m)'}</div>
          <div><b>LOCATION:</b> RRU Campus / Sector Mast</div>
          <div><b>LAT:</b> ${activeLat.toFixed(6)}° N</div>
          <div><b>LON:</b> ${activeLon.toFixed(6)}° E</div>
          <div><b>STATUS:</b> ${isOnline ? 'LIVE 4G LINK' : 'STANDBY MODE'}</div>
        </div>
      `);

      // Zone Radius: 100m for precision GPS vs 750m for Cellular Tower Sector Region
      const circle100 = L.circle([activeLat, activeLon], {
        radius: primaryRadius,
        color: isGps ? (isAlert ? "#f43f5e" : "#10b981") : "#0284c7",
        fillColor: isGps ? (isAlert ? "#f43f5e" : "#10b981") : "#0ea5e9",
        fillOpacity: isGps ? 0.08 : 0.14,
        weight: isGps ? 1.5 : 2,
        dashArray: isGps ? "4, 6" : "6, 8",
      }).addTo(map);

      // Outer Reconnaissance Surveillance Zone around Vehicle / Sector
      const circle300 = L.circle([activeLat, activeLon], {
        radius: outerRadius,
        color: isGps ? "#0ea5e9" : "#38bdf8",
        fillColor: isGps ? "#0ea5e9" : "#38bdf8",
        fillOpacity: 0.03,
        weight: 1,
        dashArray: "2, 8",
      }).addTo(map);

      // Vehicle Transit Trail Polyline
      const polyline = L.polyline(
        trailCoords.length > 0 ? trailCoords : [[activeLat, activeLon]],
        {
          color: isAlert ? "#f43f5e" : "#10b981",
          weight: 3,
          opacity: 0.85,
          dashArray: "3, 5",
        }
      ).addTo(map);

      markerRef.current = marker;
      trailPolylineRef.current = polyline;
      perimeterCircleRef.current = circle100;
      outerCircleRef.current = circle300;
      mapInstanceRef.current = map;
    } else {
      const map = mapInstanceRef.current;
      map.setView([activeLat, activeLon], map.getZoom(), { animate: true });

      const isGps = locSource === "GPS";
      const primaryRadius = isGps ? 100 : 750;
      const outerRadius = isGps ? 300 : 1200;

      if (markerRef.current) {
        markerRef.current.setLatLng([activeLat, activeLon]);
        markerRef.current.setIcon(buildMarkerIcon(isAlert, isOnline, isGps));
        markerRef.current.setPopupContent(`
          <div style="font-family: monospace; font-size: 11px; padding: 4px; color: #18181b;">
            <div style="font-weight: bold; color: ${isAlert ? '#dc2626' : (isGps ? '#059669' : '#0284c7')}; border-bottom: 1px solid #e4e4e7; padding-bottom: 3px;">
              ${isAlert ? '🚨 CARGO BREACH / TAMPER DETECTED' : (isGps ? '🎯 PRECISION GPS PINPOINT' : '📡 4G CELL TOWER SECTOR')}
            </div>
            <div style="margin-top: 4px;"><b>VEHICLE ID:</b> ${unitId}</div>
            <div><b>MODE:</b> ${isGps ? 'Hardware NEO-6M GPS (±2.5m)' : 'Cellular Triangulation Region (±750m)'}</div>
            <div><b>LOCATION:</b> RRU Campus / Sector Mast</div>
            <div><b>LAT:</b> ${activeLat.toFixed(6)}° N</div>
            <div><b>LON:</b> ${activeLon.toFixed(6)}° E</div>
            <div><b>STATUS:</b> ${isOnline ? 'LIVE 4G LINK' : 'STANDBY MODE'}</div>
          </div>
        `);
      }

      if (perimeterCircleRef.current) {
        perimeterCircleRef.current.setLatLng([activeLat, activeLon]);
        perimeterCircleRef.current.setRadius(primaryRadius);
        perimeterCircleRef.current.setStyle({
          color: isGps ? (isAlert ? "#f43f5e" : "#10b981") : "#0284c7",
          fillColor: isGps ? (isAlert ? "#f43f5e" : "#10b981") : "#0ea5e9",
          fillOpacity: isGps ? 0.08 : 0.14,
        });
      }

      if (outerCircleRef.current) {
        outerCircleRef.current.setLatLng([activeLat, activeLon]);
        outerCircleRef.current.setRadius(outerRadius);
      }

      if (trailPolylineRef.current && trailCoords.length > 0) {
        trailPolylineRef.current.setLatLngs(trailCoords);
        trailPolylineRef.current.setStyle({
          color: isAlert ? "#f43f5e" : "#10b981",
        });
      }
    }
  }, [activeLat, activeLon, isAlert, isOnline, locSource, trailCoords, unitId]);

  // Center on Vehicle Location
  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([activeLat, activeLon], 16, { duration: 1.2 });
    }
  };

  // Toggle Range Rings
  const handleToggleRings = () => {
    const nextState = !showRings;
    setShowRings(nextState);
    if (perimeterCircleRef.current && outerCircleRef.current && mapInstanceRef.current) {
      if (nextState) {
        perimeterCircleRef.current.addTo(mapInstanceRef.current);
        outerCircleRef.current.addTo(mapInstanceRef.current);
      } else {
        perimeterCircleRef.current.remove();
        outerCircleRef.current.remove();
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[460px] rounded-xl overflow-hidden border border-emerald-500/30 bg-[#070b12] shadow-2xl">
      {/* Tactical Corner Reticles */}
      <div className="absolute top-2 left-2 z-[999] pointer-events-none text-emerald-500/70 text-xs font-mono font-bold leading-none select-none">
        ┌─[CARGOGUARD-GPS]
      </div>
      <div className="absolute top-2 right-2 z-[999] pointer-events-none text-emerald-500/70 text-xs font-mono font-bold leading-none select-none">
        [PERIMETER: 100M-300M]─┐
      </div>
      <div className="absolute bottom-2 left-2 z-[999] pointer-events-none text-emerald-500/70 text-xs font-mono font-bold leading-none select-none">
        └─[GRID: DAHEGAM]
      </div>
      <div className="absolute bottom-2 right-2 z-[999] pointer-events-none text-emerald-500/70 text-xs font-mono font-bold leading-none select-none">
        [ESRI-SATELLITE]─┘
      </div>

      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[460px]" />

      {/* Top Left: Vehicle Location & Status Information HUD */}
      <div className="absolute top-3 left-3 z-[1000] bg-slate-950/90 backdrop-blur-md border border-emerald-500/40 rounded-lg p-2.5 text-xs font-mono shadow-2xl max-w-[280px] sm:max-w-xs">
        <div className="flex items-center justify-between border-b border-emerald-500/20 pb-1.5 mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isAlert ? "bg-rose-500 animate-ping" : isOnline ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
            <span className="font-bold text-slate-100 tracking-wider">
              {locSource === "GPS" ? "GPS SATELLITE FIX" : "CELLULAR REGION"}
            </span>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            locSource === "GPS"
              ? "bg-emerald-950 text-emerald-400 border border-emerald-500"
              : "bg-sky-950 text-sky-400 border border-sky-500"
          }`}>
            {locSource === "GPS" ? "±2.5m PINPOINT" : "±750m SECTOR"}
          </span>
        </div>
        <div className="text-[11px] space-y-0.5 text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">POSITION MODE:</span>
            <span className={`font-semibold ${locSource === "GPS" ? "text-emerald-400" : "text-sky-400"}`}>
              {locSource === "GPS" ? "NEO-6M Pinpoint GPS" : "4G Cell Triangulation"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">LOCATION:</span>
            <span className="text-emerald-400 font-semibold">Lavad, Dahegam, GJ</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">COORDINATES:</span>
            <span className="text-slate-200 font-mono">{activeLat.toFixed(5)}°N, {activeLon.toFixed(5)}°E</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">CARGO SECURITY:</span>
            <span className={isAlert ? "text-rose-400 font-bold animate-pulse" : "text-emerald-400"}>
              {isAlert ? "BREACH / TAMPER" : "SECURE / INTACT"}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-800">
            <span>TRACKED VEHICLE:</span>
            <span className="text-sky-300">{unitId}</span>
          </div>
        </div>
      </div>

      {/* Top Right: Tactical Map Controls Toolbar */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1.5 font-mono text-[11px]">
        <button
          onClick={handleRecenter}
          className="px-2.5 py-1.5 bg-slate-950/90 hover:bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 hover:border-emerald-400 rounded shadow-lg transition flex items-center gap-1.5 backdrop-blur-md"
          title="Center on Tracked Cargo Vehicle Location"
        >
          <span className="text-xs">🚚</span>
          <span>CENTER VEHICLE</span>
        </button>
        <button
          onClick={handleToggleRings}
          className={`px-2.5 py-1.5 border rounded shadow-lg transition flex items-center gap-1.5 backdrop-blur-md ${
            showRings
              ? "bg-slate-950/90 text-sky-400 border-sky-500/40 hover:bg-sky-950/70"
              : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="Toggle 100m/300m Vehicle Security Rings"
        >
          <span className="text-xs">⭕</span>
          <span>{showRings ? "RINGS: ON" : "RINGS: OFF"}</span>
        </button>
      </div>

      {/* Bottom Left: Open Direct Satellite Coordinates */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-slate-950/90 backdrop-blur-md border border-slate-800 hover:border-sky-500/50 rounded-lg px-2.5 py-1 text-xs text-sky-400 shadow-md">
        <a
          href={`https://maps.google.com/?q=${activeLat},${activeLon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 font-mono font-medium hover:text-sky-300 transition"
        >
          <span>🛰️ SATELLITE NAV ↗</span>
        </a>
      </div>
    </div>
  );
}