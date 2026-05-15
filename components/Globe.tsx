"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobeMethods } from "react-globe.gl";
import type { StationDot } from "@/lib/types";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

interface Props {
  dots: StationDot[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
}

export default function StationsGlobe({ dots, selectedUuid, onSelect }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [interacted, setInteracted] = useState(false);

  // Resize observer keeps the globe sized to its container so the layout
  // can shrink/grow without forcing a page reload.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDim({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Slow auto-rotation until the user grabs the globe.
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const controls = g.controls() as unknown as {
      autoRotate: boolean;
      autoRotateSpeed: number;
      addEventListener?: (ev: string, fn: () => void) => void;
    };
    controls.autoRotate = !interacted;
    controls.autoRotateSpeed = 0.35;
    const onStart = () => setInteracted(true);
    controls.addEventListener?.("start", onStart);
    return () => {
      // best-effort cleanup
    };
  }, [interacted]);

  // When the parent picks a station, fly to it.
  useEffect(() => {
    const g = ref.current;
    if (!g || !selectedUuid) return;
    const target = dots.find((d) => d.uuid === selectedUuid);
    if (!target) return;
    g.pointOfView({ lat: target.lat, lng: target.lng, altitude: 1.6 }, 1200);
  }, [selectedUuid, dots]);

  const pointAltitude = useMemo(
    () => (d: object) => 0.005 + (d as StationDot).weight * 0.06,
    [],
  );
  const pointRadius = useMemo(
    () => (d: object) => {
      const dot = d as StationDot;
      const base = 0.18 + dot.weight * 0.45;
      return dot.uuid === selectedUuid ? base * 1.7 : base;
    },
    [selectedUuid],
  );
  const pointColor = useMemo(
    () => (d: object) => {
      const dot = d as StationDot;
      if (dot.uuid === selectedUuid) return "#f0ede8";
      return interpolateGold(dot.weight);
    },
    [selectedUuid],
  );
  const pointLabel = useMemo(
    () => (d: object) => {
      const dot = d as StationDot;
      return `<div style="font-family:Space Mono,monospace;background:#0f0e0d;border:1px solid #3a3835;color:#f0ede8;padding:6px 10px;border-radius:6px;font-size:11px;">
        <div style="color:#d4a844;font-weight:700;">${escapeHtml(dot.name)}</div>
        <div style="color:#a09890;font-size:10px;">${escapeHtml(dot.country)}</div>
      </div>`;
    },
    [],
  );

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <Globe
        ref={ref}
        width={dim.w}
        height={dim.h}
        backgroundColor="rgba(15, 14, 13, 1)"
        showAtmosphere
        atmosphereColor="#d4a844"
        atmosphereAltitude={0.18}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        pointsData={dots}
        pointLat={(d) => (d as StationDot).lat}
        pointLng={(d) => (d as StationDot).lng}
        pointAltitude={pointAltitude}
        pointRadius={pointRadius}
        pointColor={pointColor}
        pointResolution={4}
        pointLabel={pointLabel}
        onPointClick={(d) => onSelect((d as StationDot).uuid)}
        animateIn
      />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// interpolateGold returns a warm color, going from dim copper for low-weight
// stations to bright gold for very popular ones.
function interpolateGold(weight: number): string {
  const w = Math.max(0, Math.min(1, weight));
  const r = Math.round(120 + (212 - 120) * w);
  const g = Math.round(80 + (168 - 80) * w);
  const b = Math.round(40 + (68 - 40) * w);
  return `rgb(${r},${g},${b})`;
}
