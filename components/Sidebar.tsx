"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Station } from "@/lib/types";

interface Props {
  stations: Station[];
  selectedUuid: string | null;
  onSelect: (uuid: string) => void;
}

export default function Sidebar({ stations, selectedUuid, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [tag, setTag] = useState("");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = stations;
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
    return list.slice(0, 500); // cap the rendered list for performance
  }, [stations, query, country, tag]);

  return (
    <aside
      className="flex flex-col h-full overflow-hidden border-l"
      style={{ borderColor: "#3a3835", background: "rgba(26,25,23,0.92)", backdropFilter: "blur(10px)" }}
    >
      <div className="px-4 py-3 border-b" style={{ borderColor: "#3a3835" }}>
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold tracking-widest text-[#d4a844] text-sm">airwaves</span>
          <span className="text-xs text-[#6a6460]">
            {stations.length.toLocaleString()} stations
          </span>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5 border-b" style={{ borderColor: "#3a3835" }}>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6a6460]" />
          <input
            placeholder="search stations, country, tag"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-md bg-[#252320] border text-[#f0ede8] text-xs focus:outline-none focus:border-[#d4a844]"
            style={{ borderColor: "#3a3835" }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-[#252320] border text-[#f0ede8] text-xs"
            style={{ borderColor: "#3a3835" }}
          >
            <option value="">all countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="px-2 py-1.5 rounded-md bg-[#252320] border text-[#f0ede8] text-xs"
            style={{ borderColor: "#3a3835" }}
          >
            <option value="">all genres</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-[#6a6460] text-xs">no stations match those filters.</div>
        ) : (
          <ul>
            {filtered.map((s) => (
              <li
                key={s.stationuuid}
                onClick={() => onSelect(s.stationuuid)}
                className={`px-4 py-2 cursor-pointer transition-colors border-b ${
                  s.stationuuid === selectedUuid ? "bg-[#252320]" : "hover:bg-[#1f1d1b]"
                }`}
                style={{ borderColor: "#252320" }}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: s.stationuuid === selectedUuid ? "#d4a844" : "#f0ede8" }}
                  >
                    {s.name.trim() || "(unnamed)"}
                  </span>
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
