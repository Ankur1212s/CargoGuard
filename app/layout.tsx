import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CargoGuard | Military-Grade Cargo & Tactical Vehicle Tracking System",
  description: "24/7 Military-grade remote cargo vehicle tracking, perimeter tamper surveillance, and telemetry monitoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
