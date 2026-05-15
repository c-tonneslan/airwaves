"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobeMethods } from "react-globe.gl";
import type { StationDot } from "@/lib/types";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

interface Props {
  dots: StationDot[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  focus?: { lat: number; lng: number; altitude?: number } | null;
}

interface CountryFeature {
  type: "Feature";
  properties: { NAME?: string; ADMIN?: string };
  geometry: object;
}

interface CountryFC {
  features: CountryFeature[];
}

const COUNTRY_CAP = "rgba(212,168,68,0.03)";
const COUNTRY_STROKE = "rgba(212,168,68,0.22)";

export default function StationsGlobe({ dots, selectedUuid, onSelect, focus }: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  // Camera altitude. Stays in sync with controls so we can scale markers
  // when the camera zooms in (smaller dots so they don't cover everything
  // at close range) and out (slightly larger so they're not pinpricks).
  const [altitude, setAltitude] = useState(2.0);

  // Resize observer keeps the globe sized to its container.
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

  // Load country outlines once on the client. We render them as nearly
  // invisible polygon caps (just for the stroke), which gives crisp
  // vector borders that don't pixelate as you zoom in.
  useEffect(() => {
    let cancelled = false;
    fetch("/countries.geojson")
      .then((r) => r.json() as Promise<CountryFC>)
      .then((d) => {
        if (!cancelled) setCountries(d.features);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Configure the orbit controls once: relaxed zoom range so users can
  // get much closer than globe.gl's default, slow auto-rotate until the
  // user interacts.
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const controls = g.controls() as unknown as {
      autoRotate: boolean;
      autoRotateSpeed: number;
      minDistance: number;
      maxDistance: number;
      zoomSpeed: number;
      rotateSpeed: number;
      addEventListener?: (ev: string, fn: () => void) => void;
    };
    controls.autoRotate = !interacted;
    controls.autoRotateSpeed = 0.25;
    // Default is around 200; bring it down so the camera can essentially
    // sit right above the ground. The Earth has unit radius 100 in the
    // globe.gl coordinate system, so a distance of 101 means "1 unit
    // above the surface."
    controls.minDistance = 105;
    controls.maxDistance = 800;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.8;

    const onStart = () => setInteracted(true);
    controls.addEventListener?.("start", onStart);
  }, [interacted]);

  // Track camera altitude (distance over surface) so we can scale markers
  // and cull when zoomed in/out. globe.gl exposes pointOfView() for
  // reads as well as writes.
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const tick = () => {
      const pov = g.pointOfView();
      // pov.altitude is in radii-of-earth units (1.0 == one earth radius
      // above the surface). globe.gl docs are a little ambiguous; we just
      // use whatever value we read and treat it as a relative scale.
      if (Math.abs(pov.altitude - altitude) > 0.02) {
        setAltitude(pov.altitude);
      }
    };
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [altitude]);

  // When the parent picks a station, fly to it.
  useEffect(() => {
    const g = ref.current;
    if (!g || !selectedUuid) return;
    const target = dots.find((d) => d.uuid === selectedUuid);
    if (!target) return;
    g.pointOfView({ lat: target.lat, lng: target.lng, altitude: 0.4 }, 1200);
  }, [selectedUuid, dots]);

  // When a country focus is set from the sidebar dropdown.
  useEffect(() => {
    const g = ref.current;
    if (!g || !focus) return;
    setInteracted(true);
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 1.0 }, 1200);
  }, [focus]);

  // Marker scaling functions. Closer camera → smaller dots so they don't
  // crowd; farther camera → slightly larger so they remain hit-targets.
  const pointAltitude = useMemo(
    () => () => 0.003,
    [],
  );
  const pointRadius = useCallback(
    (d: object) => {
      const dot = d as StationDot;
      // base radius shrinks as the camera approaches the ground
      const zoomScale = Math.max(0.25, Math.min(1.0, altitude / 1.5));
      const base = (0.12 + dot.weight * 0.35) * zoomScale;
      return dot.uuid === selectedUuid ? base * 2.0 : base;
    },
    [altitude, selectedUuid],
  );
  const pointColor = useCallback(
    (d: object) => {
      const dot = d as StationDot;
      if (dot.uuid === selectedUuid) return "#f0ede8";
      return interpolateGold(dot.weight);
    },
    [selectedUuid],
  );
  const pointLabel = useMemo(
    () => (d: object) => {
      const dot = d as StationDot;
      return `<div style="font-family:Space Mono,monospace;background:#0f0e0d;border:1px solid #3a3835;color:#f0ede8;padding:6px 10px;border-radius:6px;font-size:11px;box-shadow:0 4px 12px rgba(0,0,0,0.5)">
        <div style="color:#d4a844;font-weight:700;">${escapeHtml(dot.name)}</div>
        <div style="color:#a09890;font-size:10px;">${escapeHtml(dot.country)}</div>
      </div>`;
    },
    [],
  );

  // Polygon styling is static; memoize to avoid re-renders.
  const polygonCapColor = useMemo(() => () => COUNTRY_CAP, []);
  const polygonSideColor = useMemo(() => () => "rgba(0,0,0,0)", []);
  const polygonStrokeColor = useMemo(() => () => COUNTRY_STROKE, []);
  const polygonAltitude = useMemo(() => () => 0.0025, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <Globe
        ref={ref}
        width={dim.w}
        height={dim.h}
        backgroundColor="rgba(15, 14, 13, 1)"
        showAtmosphere
        atmosphereColor="#d4a844"
        atmosphereAltitude={0.15}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        // Country outlines: vector, crisp at any zoom level. The cap is
        // basically invisible (3% alpha) but lets globe.gl's stroke
        // pipeline render the borders.
        polygonsData={countries}
        polygonCapColor={polygonCapColor}
        polygonSideColor={polygonSideColor}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={polygonAltitude}
        // Station markers as 3D spheres.
        pointsData={dots}
        pointLat={(d) => (d as StationDot).lat}
        pointLng={(d) => (d as StationDot).lng}
        pointAltitude={pointAltitude}
        pointRadius={pointRadius}
        pointColor={pointColor}
        pointResolution={3}
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

function interpolateGold(weight: number): string {
  const w = Math.max(0, Math.min(1, weight));
  const r = Math.round(120 + (212 - 120) * w);
  const g = Math.round(80 + (168 - 80) * w);
  const b = Math.round(40 + (68 - 40) * w);
  return `rgb(${r},${g},${b})`;
}
