"use client";

import { useEffect, useMemo, useState } from "react";
import StationsGlobe from "@/components/Globe";
import Sidebar, { type ViewMode } from "@/components/Sidebar";
import Player from "@/components/Player";
import ShowPanel from "@/components/ShowPanel";
import { fetchTopStations } from "@/lib/api";
import { centroidFor, jitter } from "@/lib/centroids";
import { useFavorites, useRecents } from "@/lib/persistent";
import { buildSimilarityIndex, findSimilar } from "@/lib/similarity";
import { semanticSearch } from "@/lib/semantic";
import type { Station, StationDot } from "@/lib/types";

// Pull initial filter and station state out of the URL on first render so
// shared links land the user where they expect. Done as a function (not a
// useEffect) so we never paint the wrong state once and then snap.
function initialFromURL() {
  if (typeof window === "undefined") {
    return { country: "", tag: "", query: "", selected: null as string | null, view: "all" as ViewMode };
  }
  const sp = new URLSearchParams(window.location.search);
  const view = sp.get("view") as ViewMode | null;
  const validViews: ViewMode[] = ["all", "starred", "recent", "similar", "vibe"];
  return {
    country: sp.get("country") ?? "",
    tag: sp.get("tag") ?? "",
    query: sp.get("q") ?? "",
    selected: sp.get("s"),
    view: view && validViews.includes(view) ? view : ("all" as ViewMode),
  };
}

export default function HomePage() {
  // Compute the initial URL state once and keep it in a ref so it doesn't
  // recompute on every render. (Reading window.location.search is cheap,
  // but the lint rule is happier when initial state isn't a function call.)
  const init = useMemo(() => initialFromURL(), []);

  const [stations, setStations] = useState<Station[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedUuid, setSelectedUuid] = useState<string | null>(init.selected);
  const [playing, setPlaying] = useState<Station | null>(null);

  const [query, setQuery] = useState(init.query);
  const [country, setCountry] = useState(init.country);
  const [tag, setTag] = useState(init.tag);
  const [view, setView] = useState<ViewMode>(init.view);

  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { recents, recordPlay } = useRecents();

  const [vibeResults, setVibeResults] = useState<{ uuid: string; score: number }[]>([]);
  const [vibeStatus, setVibeStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [vibeError, setVibeError] = useState<string | null>(null);

  const [heatmap, setHeatmap] = useState(false);

  const onVibeSearch = async (q: string) => {
    setVibeStatus("loading");
    setVibeError(null);
    try {
      const results = await semanticSearch(q, 30);
      setVibeResults(results);
      setVibeStatus("ready");
    } catch (err) {
      setVibeError(err instanceof Error ? err.message : "search failed");
      setVibeStatus("error");
    }
  };

  // Fetch stations once on mount. If the URL named a station, tune it in
  // the same moment we have the catalog so the player and globe focus are
  // already correct on first paint.
  useEffect(() => {
    let cancelled = false;
    fetchTopStations(5000)
      .then((data) => {
        if (cancelled) return;
        setStations(data);
        setLoading(false);
        if (init.selected) {
          const s = data.find((x) => x.stationuuid === init.selected);
          if (s) setPlaying(s);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The initial URL state is captured before mount; we don't want this
    // effect re-running if it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync URL whenever the user changes anything that should be shareable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams();
    if (country) sp.set("country", country);
    if (tag) sp.set("tag", tag);
    if (query) sp.set("q", query);
    if (selectedUuid) sp.set("s", selectedUuid);
    if (view !== "all") sp.set("view", view);
    const qs = sp.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", next);
  }, [country, tag, query, selectedUuid, view]);

  // Project every (capped) station into a globe dot, with country
  // centroids as a fallback for stations that lack explicit coords.
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

  const stationByUuid = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of stations) m.set(s.stationuuid, s);
    return m;
  }, [stations]);

  // Build the TF-IDF similarity index once per station load. The index is
  // small (a few maps keyed by UUID and tag) so this is cheap to keep in
  // memory and free of network or worker overhead.
  const similarityIndex = useMemo(
    () => (stations.length > 0 ? buildSimilarityIndex(stations) : null),
    [stations],
  );

  // Top-20 cosine-similar stations to the currently selected one.
  const similar = useMemo(() => {
    if (!similarityIndex || !selectedUuid) return [];
    return findSimilar(similarityIndex, selectedUuid, 20);
  }, [similarityIndex, selectedUuid]);

  // Derive the view to actually render. If the user is in "similar"
  // mode but cleared their selection, fall back to "all" without writing
  // state from inside an effect (React's lint rule rightly flags that).
  const effectiveView = view === "similar" && !selectedUuid ? "all" : view;

  // Globe dots respect view (starred/recent/similar/vibe) and filters.
  const dots = useMemo(() => {
    let allowedUuids: Set<string> | null = null;
    if (effectiveView === "starred") allowedUuids = favorites;
    else if (effectiveView === "recent") allowedUuids = new Set(recents);
    else if (effectiveView === "similar") {
      const set = new Set(similar.map((s) => s.uuid));
      if (selectedUuid) set.add(selectedUuid); // keep the anchor visible
      allowedUuids = set;
    } else if (effectiveView === "vibe") {
      allowedUuids = new Set(vibeResults.map((r) => r.uuid));
    }

    if (!allowedUuids && !country && !tag && !query.trim()) return allDots;
    const q = query.trim().toLowerCase();
    return allDots.filter((d) => {
      if (allowedUuids && !allowedUuids.has(d.uuid)) return false;
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
  }, [allDots, effectiveView, favorites, recents, similar, vibeResults, selectedUuid, country, tag, query, stationByUuid]);

  // Country selection drives the globe focus and the polygon highlight.
  const focus = useMemo(() => {
    if (!country) return null;
    const sample = stations.find((s) => s.country === country);
    if (sample) {
      const centroid = centroidFor(sample.countrycode);
      if (centroid) {
        const big = ["US", "RU", "CN", "CA", "BR", "AU"].includes(sample.countrycode.toUpperCase());
        return { lat: centroid[0], lng: centroid[1], altitude: big ? 1.5 : 0.8 };
      }
    }
    const matching = dots.filter((d) => d.country === country);
    if (matching.length === 0) return null;
    const lat = matching.reduce((s, d) => s + d.lat, 0) / matching.length;
    const lng = matching.reduce((s, d) => s + d.lng, 0) / matching.length;
    return { lat, lng, altitude: 1.0 };
  }, [country, stations, dots]);

  // ISO-2 country code of whatever the user has picked, so the globe can
  // brighten that one polygon. Falls back to the playing station's
  // country when nothing is filter-selected.
  const focusCountryCode = useMemo(() => {
    if (country) {
      const s = stations.find((x) => x.country === country);
      return s?.countrycode ?? null;
    }
    if (playing?.countrycode) return playing.countrycode;
    return null;
  }, [country, stations, playing]);

  const onSelect = (uuid: string) => {
    setSelectedUuid(uuid);
    const s = stations.find((s) => s.stationuuid === uuid);
    if (s) setPlaying(s);
  };

  return (
    <div className="fixed inset-0 grid" style={{ gridTemplateColumns: "1fr 360px" }}>
      <div className="relative">
        <StationsGlobe
          dots={dots}
          selectedUuid={selectedUuid}
          onSelect={onSelect}
          focus={focus}
          focusCountryCode={focusCountryCode}
          heatmap={heatmap}
        />

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

        <div className="absolute top-4 right-4 z-10 flex items-center gap-3 text-xs font-mono">
          <button
            type="button"
            onClick={() => setHeatmap((h) => !h)}
            className="px-2.5 py-1 rounded-md border transition-colors"
            style={{
              background: heatmap ? "rgba(212,168,68,0.18)" : "rgba(26,25,23,0.7)",
              borderColor: heatmap ? "#d4a844" : "#3a3835",
              color: heatmap ? "#d4a844" : "#a09890",
              backdropFilter: "blur(10px)",
            }}
            title="Toggle heatmap of station density"
          >
            {heatmap ? "● heatmap" : "○ heatmap"}
          </button>
          <a
            href="https://github.com/c-tonneslan/airwaves"
            target="_blank"
            rel="noreferrer"
            className="text-[#a09890] hover:text-[#d4a844]"
          >
            source
          </a>
        </div>

        {playing ? <ShowPanel station={playing} /> : null}

        <Player
          station={playing}
          onClose={() => {
            setPlaying(null);
            setSelectedUuid(null);
          }}
          isFavorite={playing ? isFavorite(playing.stationuuid) : false}
          onToggleFavorite={toggleFavorite}
          onPlayStart={recordPlay}
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
        view={effectiveView}
        onViewChange={setView}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        recents={recents}
        similar={similar}
        vibeResults={vibeResults}
        vibeStatus={vibeStatus}
        vibeError={vibeError}
        onVibeSearch={onVibeSearch}
      />
    </div>
  );
}
