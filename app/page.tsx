"use client";

import { useEffect, useMemo, useState } from "react";
import StationsGlobe from "@/components/Globe";
import Sidebar from "@/components/Sidebar";
import Player from "@/components/Player";
import { fetchTopStations } from "@/lib/api";
import { centroidFor, jitter } from "@/lib/centroids";
import type { Station, StationDot } from "@/lib/types";

export default function HomePage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [playing, setPlaying] = useState<Station | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTopStations(5000)
      .then((data) => {
        if (cancelled) return;
        setStations(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute the dots once. We cap at 2,500 to keep the globe smooth.
  // Stations without explicit coordinates get placed at their country
  // centroid with a small jitter so a popular country isn't a single
  // brick of overlapping dots.
  const dots = useMemo<StationDot[]>(() => {
    const max = Math.min(stations.length, 2500);
    const head = stations.slice(0, max);
    const maxClicks = head.reduce((m, s) => Math.max(m, s.clickcount || 0), 1);
    const out: StationDot[] = [];
    for (const s of head) {
      let lat: number;
      let lng: number;
      if (s.geo_lat != null && s.geo_long != null) {
        lat = s.geo_lat;
        lng = s.geo_long;
      } else {
        const centroid = centroidFor(s.countrycode);
        if (!centroid) continue; // unknown country, drop the station
        const jittered = jitter(centroid, s.stationuuid, 2.5);
        lat = jittered[0];
        lng = jittered[1];
      }
      out.push({
        lat,
        lng,
        uuid: s.stationuuid,
        name: s.name.trim() || "(unnamed)",
        country: s.country,
        weight: Math.min(1, Math.log(1 + s.clickcount) / Math.log(1 + maxClicks)),
      });
    }
    return out;
  }, [stations]);

  const onSelect = (uuid: string) => {
    setSelectedUuid(uuid);
    const s = stations.find((s) => s.stationuuid === uuid);
    if (s) setPlaying(s);
  };

  return (
    <div className="fixed inset-0 grid" style={{ gridTemplateColumns: "1fr 360px" }}>
      <div className="relative">
        <StationsGlobe dots={dots} selectedUuid={selectedUuid} onSelect={onSelect} />

        {loading && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#a09890] text-sm font-mono pointer-events-none">
            loading stations…
          </div>
        )}
        {loadError && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#c45a3a] text-sm font-mono">
            couldn&apos;t reach Radio Browser: {loadError}
          </div>
        )}

        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <div className="text-xs text-[#6a6460] font-mono">
            drag to rotate · scroll to zoom · click any glow to tune in
          </div>
        </div>

        <a
          href="https://github.com/c-tonneslan/airwaves"
          target="_blank"
          rel="noreferrer"
          className="absolute top-4 right-4 z-10 text-xs text-[#a09890] hover:text-[#d4a844] font-mono"
        >
          source
        </a>

        <Player
          station={playing}
          onClose={() => {
            setPlaying(null);
            setSelectedUuid(null);
          }}
        />
      </div>

      <Sidebar stations={stations} selectedUuid={selectedUuid} onSelect={onSelect} />
    </div>
  );
}
