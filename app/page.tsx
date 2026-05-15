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

  // Filter state lives here so the globe and sidebar see the same view.
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [tag, setTag] = useState("");

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

  // First, project every (capped) station into a globe dot, with country
  // centroids as a fallback for stations that lack explicit coordinates.
  // We compute these once per stations load.
  const allDots = useMemo<StationDot[]>(() => {
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
        if (!centroid) continue;
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

  // Index lookups so the filter step doesn't go quadratic.
  const stationByUuid = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of stations) m.set(s.stationuuid, s);
    return m;
  }, [stations]);

  // Apply the same filters to the dots that the sidebar uses for its list.
  // When a country is picked, only that country's dots show on the globe.
  const dots = useMemo(() => {
    if (!country && !tag && !query.trim()) return allDots;
    const q = query.trim().toLowerCase();
    return allDots.filter((d) => {
      const s = stationByUuid.get(d.uuid);
      if (!s) return false;
      if (country && s.country !== country) return false;
      if (tag) {
        const stationTags = s.tags.split(",").map((t) => t.trim().toLowerCase());
        if (!stationTags.includes(tag)) return false;
      }
      if (q) {
        const hay = `${s.name} ${s.country} ${s.tags}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allDots, country, tag, query, stationByUuid]);

  // Country selection → globe focus. We use the country code of any station
  // with that name to look up our centroid table; if we don't know the
  // country, we fall back to averaging that country's dots.
  const focus = useMemo(() => {
    if (!country) return null;
    const sample = stations.find((s) => s.country === country);
    if (sample) {
      const centroid = centroidFor(sample.countrycode);
      if (centroid) {
        // Tighter zoom for small countries, looser for huge ones.
        const big = ["US", "RU", "CN", "CA", "BR", "AU"].includes(sample.countrycode.toUpperCase());
        return { lat: centroid[0], lng: centroid[1], altitude: big ? 1.5 : 0.8 };
      }
    }
    // Fall back to centroid of the country's dots.
    const matching = dots.filter((d) => d.country === country);
    if (matching.length === 0) return null;
    const lat = matching.reduce((s, d) => s + d.lat, 0) / matching.length;
    const lng = matching.reduce((s, d) => s + d.lng, 0) / matching.length;
    return { lat, lng, altitude: 1.0 };
  }, [country, stations, dots]);

  const onSelect = (uuid: string) => {
    setSelectedUuid(uuid);
    const s = stations.find((s) => s.stationuuid === uuid);
    if (s) setPlaying(s);
  };

  return (
    <div className="fixed inset-0 grid" style={{ gridTemplateColumns: "1fr 360px" }}>
      <div className="relative">
        <StationsGlobe dots={dots} selectedUuid={selectedUuid} onSelect={onSelect} focus={focus} />

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

      <Sidebar
        stations={stations}
        selectedUuid={selectedUuid}
        onSelect={onSelect}
        query={query}
        onQueryChange={setQuery}
        country={country}
        onCountryChange={setCountry}
        tag={tag}
        onTagChange={setTag}
      />
    </div>
  );
}
