"use client";

import { useMemo } from "react";
import { Search, X, Star, Clock } from "lucide-react";
import type { Station } from "@/lib/types";

interface Props {
  stations: Station[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  country: string;
  onCountryChange: (c: string) => void;
  tag: string;
  onTagChange: (t: string) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  favorites: Set<string>;
  onToggleFavorite: (uuid: string) => void;
  recents: string[];
}

export type ViewMode = "all" | "starred" | "recent";

export default function Sidebar({
  stations,
  selectedUuid,
  onSelect,
  query,
  onQueryChange,
  country,
  onCountryChange,
  tag,
  onTagChange,
  view,
  onViewChange,
  favorites,
  onToggleFavorite,
  recents,
}: Props) {
  const stationsByUuid = useMemo(() => {
    const m = new Map<string, Station>();
    for (const s of stations) m.set(s.stationuuid, s);
    return m;
  }, [stations]);

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stations) {
      if (!s.country) continue;
      counts.set(s.country, (counts.get(s.country) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([c]) => c);
  }, [stations]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stations) {
      for (const raw of s.tags.split(",")) {
        const t = raw.trim().toLowerCase();
        if (!t) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .filter(([, n]) => n >= 5)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([t]) => t);
  }, [stations]);

  // Compute the list of stations to render based on the active view and
  // the text/country/tag filters. Starred and recent views ignore the
  // popularity sort and use the user's own ordering instead.
  const filtered = useMemo(() => {
    let base: Station[];
    if (view === "starred") {
      base = Array.from(favorites)
        .map((id) => stationsByUuid.get(id))
        .filter((s): s is Station => Boolean(s));
    } else if (view === "recent") {
      base = recents
        .map((id) => stationsByUuid.get(id))
        .filter((s): s is Station => Boolean(s));
    } else {
      base = stations;
    }

    const q = query.trim().toLowerCase();
    let list = base;
    if (country) list = list.filter((s) => s.country === country);
    if (tag) {
      list = list.filter((s) =>
        s.tags.split(",").map((t) => t.trim().toLowerCase()).includes(tag),
      );
    }
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.country.toLowerCase().includes(q) ||
          s.tags.toLowerCase().includes(q),
      );
    }
    return list.slice(0, 500);
  }, [stations, view, favorites, recents, stationsByUuid, query, country, tag]);

  const hasFilter = country !== "" || tag !== "" || query !== "";

  return (
    <aside
      className="flex flex-col h-full overflow-hidden border-l"
      style={{ borderColor: "#3a3835", background: "rgba(26,25,23,0.92)", backdropFilter: "blur(10px)" }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: "#3a3835" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold tracking-widest text-[#d4a844] text-sm">airwaves</span>
          <span className="text-xs text-[#6a6460]">
            {filtered.length.toLocaleString()}
            {view !== "all" || hasFilter ? (
              <span className="text-[#a09890]"> of {stations.length.toLocaleString()}</span>
            ) : null}
            {" "}
            stations
          </span>
        </div>
        <div className="flex gap-1 mt-2.5">
          <ViewTab active={view === "all"} onClick={() => onViewChange("all")} label="all" />
          <ViewTab
            active={view === "starred"}
            onClick={() => onViewChange("starred")}
            label={`starred ${favorites.size > 0 ? `· ${favorites.size}` : ""}`}
            icon={<Star size={11} fill={view === "starred" ? "#d4a844" : "none"} />}
          />
          <ViewTab
            active={view === "recent"}
            onClick={() => onViewChange("recent")}
            label={`recent ${recents.length > 0 ? `· ${recents.length}` : ""}`}
            icon={<Clock size={11} />}
          />
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5 border-b" style={{ borderColor: "#3a3835" }}>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a6460]" />
          <input
            placeholder="search stations, country, tag"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#252320] border text-[#f0ede8] text-xs focus:outline-none focus:border-[#d4a844]"
            style={{ borderColor: "#3a3835" }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-[#252320] border text-[#f0ede8] text-xs"
            style={{ borderColor: country ? "#d4a844" : "#3a3835" }}
            title="Filter by country (zooms the globe)"
          >
            <option value="">all countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-[#252320] border text-[#f0ede8] text-xs"
            style={{ borderColor: tag ? "#d4a844" : "#3a3835" }}
          >
            <option value="">all genres</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {hasFilter && (
          <button
            type="button"
            onClick={() => {
              onQueryChange("");
              onCountryChange("");
              onTagChange("");
            }}
            className="self-start flex items-center gap-1 text-[10px] text-[#a09890] hover:text-[#d4a844]"
          >
            <X size={10} /> clear filters
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-[#6a6460] text-xs">
            {view === "starred"
              ? "no starred stations yet. click the star on a station to add it."
              : view === "recent"
                ? "no recent stations yet. pick one to start."
                : "no stations match those filters."}
          </div>
        ) : (
          <ul>
            {filtered.map((s) => (
              <li
                key={s.stationuuid}
                onClick={() => onSelect(s.stationuuid)}
                className={`px-4 py-2 cursor-pointer transition-colors border-b group ${
                  s.stationuuid === selectedUuid ? "bg-[#252320]" : "hover:bg-[#1f1d1b]"
                }`}
                style={{ borderColor: "#252320" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-semibold truncate flex-1"
                    style={{ color: s.stationuuid === selectedUuid ? "#d4a844" : "#f0ede8" }}
                  >
                    {s.name.trim() || "(unnamed)"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(s.stationuuid);
                    }}
                    aria-label={favorites.has(s.stationuuid) ? "Unstar" : "Star"}
                    className={`flex-shrink-0 ${
                      favorites.has(s.stationuuid)
                        ? "text-[#d4a844]"
                        : "text-[#3a3835] opacity-0 group-hover:opacity-100 hover:text-[#a09890]"
                    } transition-opacity`}
                  >
                    <Star size={12} fill={favorites.has(s.stationuuid) ? "#d4a844" : "none"} />
                  </button>
                </div>
                <div className="text-[10px] text-[#a09890] font-mono truncate">
                  {s.country}
                  {s.tags ? <span className="text-[#6a6460]"> · {s.tags.split(",").slice(0, 3).join(", ")}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function ViewTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider transition-colors ${
        active ? "bg-[#d4a844] text-[#0f0e0d]" : "bg-[#252320] text-[#a09890] hover:text-[#f0ede8]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
