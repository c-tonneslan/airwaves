"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GlobeMethods } from "react-globe.gl";
import type { StationDot } from "@/lib/types";
import { terminatorPath, subsolarPoint } from "@/lib/terminator";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

interface Props {
  dots: StationDot[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  focus?: { lat: number; lng: number; altitude?: number } | null;
  focusCountryCode?: string | null;
  heatmap?: boolean;
}

interface CountryFeature {
  type: "Feature";
  properties: { NAME?: string; ADMIN?: string; ISO_A2?: string };
  geometry: object;
}

interface CountryFC {
  features: CountryFeature[];
}

interface City {
  name: string;
  lat: number;
  lng: number;
  rank: number;
  pop: number;
}

const COUNTRY_CAP = "rgba(212,168,68,0.03)";
const COUNTRY_STROKE = "rgba(212,168,68,0.22)";

// Altitude thresholds for what shows up. Below the lower number, we
// reveal denser city labels; above the upper one we hide labels entirely.
const CITY_HIDE_ALT = 1.4;
const CITY_DENSE_ALT = 0.45;

export default function StationsGlobe({
  dots,
  selectedUuid,
  onSelect,
  focus,
  focusCountryCode,
  heatmap = false,
}: Props) {
  const ref = useRef<GlobeMethods | undefined>(undefined);
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [interacted, setInteracted] = useState(false);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [altitude, setAltitude] = useState(2.0);
  const [solarTick, setSolarTick] = useState(() => Date.now());

  // Refresh the terminator every 60 seconds; the line moves ~0.25° west
  // per minute so 60s is fine-grained enough to look "live" without
  // forcing extra renders.
  useEffect(() => {
    const id = window.setInterval(() => setSolarTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const terminator = useMemo(() => {
    const pts = terminatorPath(new Date(solarTick), 240);
    return [{ coords: pts.map(([lat, lng]) => [lat, lng, 0.004] as [number, number, number]) }];
  }, [solarTick]);

  const sun = useMemo(() => subsolarPoint(new Date(solarTick)), [solarTick]);

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

  // Load country outlines and cities once on the client.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/countries.geojson").then((r) => r.json() as Promise<CountryFC>),
      fetch("/cities.json").then((r) => r.json() as Promise<City[]>),
    ])
      .then(([world, cs]) => {
        if (cancelled) return;
        setCountries(world.features);
        setCities(cs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Orbit controls: deep zoom, gentle autorotate.
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
    controls.minDistance = 105;
    controls.maxDistance = 800;
    controls.zoomSpeed = 0.9;
    controls.rotateSpeed = 0.8;
    const onStart = () => setInteracted(true);
    controls.addEventListener?.("start", onStart);
  }, [interacted]);

  // Poll camera altitude so label/marker scaling can react to zoom.
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const tick = () => {
      const pov = g.pointOfView();
      if (Math.abs(pov.altitude - altitude) > 0.02) {
        setAltitude(pov.altitude);
      }
    };
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [altitude]);

  // Fly to selected station.
  useEffect(() => {
    const g = ref.current;
    if (!g || !selectedUuid) return;
    const target = dots.find((d) => d.uuid === selectedUuid);
    if (!target) return;
    g.pointOfView({ lat: target.lat, lng: target.lng, altitude: 0.4 }, 1200);
  }, [selectedUuid, dots]);

  // Fly to country focus.
  useEffect(() => {
    const g = ref.current;
    if (!g || !focus) return;
    setInteracted(true);
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: focus.altitude ?? 1.0 }, 1200);
  }, [focus]);

  // --- Marker scaling ---

  const pointAltitude = useMemo(() => () => 0.003, []);
  const pointRadius = useCallback(
    (d: object) => {
      const dot = d as StationDot;
      const zoomScale = Math.max(0.25, Math.min(1.0, altitude / 1.5));
      const base = (0.12 + dot.weight * 0.35) * zoomScale;
      // The selected station gets its own HTML pin overlay (below), so
      // we hide its 3D sphere to avoid the duplication.
      if (dot.uuid === selectedUuid) return 0;
      return base;
    },
    [altitude, selectedUuid],
  );
  const pointColor = useCallback(
    (d: object) => interpolateGold((d as StationDot).weight),
    [],
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

  // --- Country polygons ---

  const focusedISO = (focusCountryCode || "").toUpperCase();
  const polygonCapColor = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      if (focusedISO && f.properties.ISO_A2?.toUpperCase() === focusedISO) {
        return "rgba(212,168,68,0.18)";
      }
      return COUNTRY_CAP;
    },
    [focusedISO],
  );
  const polygonSideColor = useMemo(() => () => "rgba(0,0,0,0)", []);
  const polygonStrokeColor = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      if (focusedISO && f.properties.ISO_A2?.toUpperCase() === focusedISO) {
        return "rgba(212,168,68,0.85)";
      }
      return COUNTRY_STROKE;
    },
    [focusedISO],
  );
  const polygonAltitude = useCallback(
    (d: object) => {
      const f = d as CountryFeature;
      if (focusedISO && f.properties.ISO_A2?.toUpperCase() === focusedISO) {
        return 0.012; // lift the focused country slightly for emphasis
      }
      return 0.0025;
    },
    [focusedISO],
  );

  // --- City labels ---

  // Cull the city list to keep label rendering snappy. At wide zoom we
  // show nothing (the texture handles the impression of cities); when
  // you fly in we reveal increasingly granular names.
  const visibleCities = useMemo<City[]>(() => {
    if (altitude > CITY_HIDE_ALT || cities.length === 0) return [];
    // rank 0 is the biggest cities; rank 9 is the smallest. Map altitude
    // to a cutoff so close zoom shows everything and a wider zoom only
    // shows the global mega-cities.
    const t = Math.max(0, Math.min(1, (CITY_HIDE_ALT - altitude) / (CITY_HIDE_ALT - CITY_DENSE_ALT)));
    const maxRank = Math.round(1 + t * 8);
    return cities.filter((c) => c.rank <= maxRank);
  }, [altitude, cities]);

  // --- HTML pin for the currently selected station ---

  const selectedStation = useMemo(
    () => (selectedUuid ? dots.find((d) => d.uuid === selectedUuid) : undefined),
    [selectedUuid, dots],
  );
  const htmlElementsData = useMemo(
    () => (selectedStation ? [selectedStation] : []),
    [selectedStation],
  );
  const htmlElement = useCallback((d: object): HTMLElement => {
    const dot = d as StationDot;
    const el = document.createElement("div");
    el.style.cssText = `
      pointer-events: none;
      position: relative;
      transform: translate(-50%, -100%);
      font-family: Space Mono, monospace;
    `;
    el.innerHTML = `
      <div style="
        background:#0f0e0d;
        border:1px solid #d4a844;
        color:#d4a844;
        padding:4px 10px;
        border-radius:999px;
        font-size:11px;
        font-weight:700;
        white-space:nowrap;
        box-shadow:0 4px 16px rgba(0,0,0,0.6), 0 0 0 4px rgba(212,168,68,0.12);
      ">
        ● ${escapeHtml(dot.name)}
      </div>
      <div style="
        width:0; height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:8px solid #d4a844;
        margin:0 auto;
        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.4));
      "></div>
    `;
    return el;
  }, []);

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
        // Higher-resolution night-side Earth (NASA Black Marble 2012,
        // 3600x1800), self-hosted so we're not relying on a third-party CDN.
        globeImageUrl="/earth-night.jpg"
        // Country outlines
        polygonsData={countries}
        polygonCapColor={polygonCapColor}
        polygonSideColor={polygonSideColor}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={polygonAltitude}
        // Station dots (the selected one is rendered separately as an
        // HTML pin, so it doesn't show up in this layer). Hidden when
        // the heatmap is on.
        pointsData={heatmap ? [] : dots}
        pointLat={(d) => (d as StationDot).lat}
        pointLng={(d) => (d as StationDot).lng}
        pointAltitude={pointAltitude}
        pointRadius={pointRadius}
        pointColor={pointColor}
        pointResolution={3}
        pointLabel={pointLabel}
        onPointClick={(d) => onSelect((d as StationDot).uuid)}
        // Heatmap mode: aggregate stations into hex bins and visualise
        // station density. globe.gl handles the hex grid math; we just
        // give it the dots and a bin resolution.
        hexBinPointsData={heatmap ? dots : []}
        hexBinPointLat={(d) => (d as StationDot).lat}
        hexBinPointLng={(d) => (d as StationDot).lng}
        hexBinPointWeight={() => 1}
        hexBinResolution={4}
        hexBinMerge={false}
        hexAltitude={(d) => {
          const points = (d as { points: StationDot[] }).points;
          return 0.005 + Math.min(0.18, Math.log10(points.length + 1) * 0.06);
        }}
        hexTopColor={(d) => {
          const n = (d as { points: StationDot[] }).points.length;
          const t = Math.min(1, Math.log10(n + 1) / Math.log10(60));
          const alpha = 0.45 + 0.5 * t;
          return `rgba(212,168,68,${alpha.toFixed(3)})`;
        }}
        hexSideColor={() => "rgba(212,168,68,0.25)"}
        hexLabel={(d) => {
          const points = (d as { points: StationDot[] }).points;
          return `<div style="font-family:Space Mono,monospace;background:#0f0e0d;border:1px solid #3a3835;color:#f0ede8;padding:6px 10px;border-radius:6px;font-size:11px;">
            <div style="color:#d4a844;font-weight:700;">${points.length} stations</div>
            <div style="color:#a09890;font-size:10px;">${escapeHtml(points[0]?.country ?? "")}</div>
          </div>`;
        }}
        // City labels (revealed progressively as the camera zooms in).
        labelsData={visibleCities}
        labelLat={(d) => (d as City).lat}
        labelLng={(d) => (d as City).lng}
        labelText={(d) => (d as City).name}
        labelSize={() => 0.18 + (1.5 - Math.min(altitude, 1.5)) * 0.18}
        labelDotRadius={0.05}
        labelColor={() => "rgba(240,237,232,0.78)"}
        labelResolution={2}
        labelAltitude={0.01}
        // HTML pin for the selected station, plus a small "☀" marker
        // at the subsolar point.
        htmlElementsData={[...htmlElementsData, { _sun: true, lat: sun.lat, lng: sun.lng }]}
        htmlLat={(d) => (d as { lat: number }).lat}
        htmlLng={(d) => (d as { lng: number }).lng}
        htmlAltitude={(d) => ((d as { _sun?: boolean })._sun ? 0.015 : 0.04)}
        htmlElement={(d) => {
          if ((d as { _sun?: boolean })._sun) return sunElement();
          return htmlElement(d);
        }}
        // Terminator line (day/night divider).
        pathsData={terminator}
        pathPoints={(d) => (d as { coords: [number, number, number][] }).coords}
        pathPointLat={(p) => (p as [number, number, number])[0]}
        pathPointLng={(p) => (p as [number, number, number])[1]}
        pathPointAlt={(p) => (p as [number, number, number])[2]}
        pathColor={() => ["rgba(212,168,68,0.0)", "rgba(212,168,68,0.55)"]}
        pathStroke={0.6}
        pathDashLength={0.01}
        pathDashGap={0.005}
        pathDashAnimateTime={12_000}
        animateIn
      />
    </div>
  );
}

function sunElement(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `
    pointer-events: none;
    transform: translate(-50%, -50%);
    width: 14px; height: 14px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fff7d6, #f7c948 55%, transparent 70%);
    box-shadow: 0 0 18px 6px rgba(247,201,72,0.45);
  `;
  return el;
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
