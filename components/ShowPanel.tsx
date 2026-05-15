"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Radio } from "lucide-react";
import type { Station } from "@/lib/types";
import { matchProvider, type ShowInfo, type Track } from "@/lib/providers";

interface Props {
  station: Station;
}

interface Data {
  show: ShowInfo | null;
  tracks: Track[];
  loading: boolean;
}

export default function ShowPanel({ station }: Props) {
  // Derive the provider from props rather than mirroring it into state,
  // which keeps us out of "set-state inside effect" territory and means
  // we render nothing for unsupported stations without bouncing through
  // an intermediate state.
  const matched = useMemo(() => matchProvider(station), [station]);

  const [data, setData] = useState<Data>({ show: null, tracks: [], loading: true });

  useEffect(() => {
    if (!matched) return;

    let cancelled = false;
    const ac = new AbortController();

    async function refresh() {
      try {
        const [show, tracks] = await Promise.all([
          matched!.provider.fetchShow(matched!.match, ac.signal),
          matched!.provider.fetchTracklist(matched!.match, ac.signal),
        ]);
        if (cancelled) return;
        setData({ show, tracks, loading: false });
      } catch {
        if (!cancelled) setData((d) => ({ ...d, loading: false }));
      }
    }

    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(id);
    };
  }, [matched]);

  if (!matched) return null;

  return (
    <div
      className="absolute top-20 right-4 z-10 w-80 max-w-[calc(100%-2rem)] rounded-xl border overflow-hidden"
      style={{
        background: "rgba(26,25,23,0.92)",
        borderColor: "#3a3835",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="px-3 py-2 border-b flex items-center gap-2"
        style={{ borderColor: "#3a3835" }}
      >
        <Radio size={12} className="text-[#d4a844]" />
        <span className="text-[10px] uppercase tracking-widest font-mono text-[#a09890]">
          on air · {matched.provider.id}
        </span>
      </div>

      <div className="p-3">
        {data.loading ? (
          <div className="text-[11px] text-[#6a6460] font-mono">loading…</div>
        ) : data.show ? (
          <ShowBlock show={data.show} />
        ) : (
          <div className="text-[11px] text-[#6a6460]">couldn&apos;t reach this station&apos;s schedule API.</div>
        )}

        {data.tracks.length > 0 ? (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "#3a3835" }}>
            <div className="text-[10px] uppercase tracking-widest font-mono text-[#6a6460] mb-1.5">
              recent plays
            </div>
            <ul className="flex flex-col gap-1">
              {data.tracks.map((t, i) => (
                <li key={`${t.artist}-${t.title}-${i}`} className="text-[11px] truncate">
                  <span className="text-[#d4a844]">{t.artist}</span>
                  <span className="text-[#6a6460]"> · </span>
                  <span className="text-[#f0ede8]">{t.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ShowBlock({ show }: { show: ShowInfo }) {
  return (
    <div className="flex items-start gap-3">
      {show.imageUrl ? (
        // Plain img: the image origin is per-station and they're small.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={show.imageUrl}
          alt=""
          className="w-12 h-12 rounded flex-shrink-0 object-cover"
          style={{ background: "#252320" }}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-[#f0ede8] leading-tight">
          {show.title}
        </div>
        {show.location ? (
          <div className="text-[10px] font-mono text-[#6a6460] mt-0.5 uppercase tracking-wider">
            {show.location}
            {show.startedAt && show.endsAt ? (
              <span className="text-[#3a3835]">
                {"  · "}
                {formatTimeRange(show.startedAt, show.endsAt)}
              </span>
            ) : null}
          </div>
        ) : null}
        {show.description ? (
          <div className="text-[11px] text-[#a09890] mt-1.5 leading-snug line-clamp-3">
            {show.description}
          </div>
        ) : null}
        {show.showUrl ? (
          <a
            href={show.showUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-[#a09890] hover:text-[#d4a844] mt-1.5"
          >
            <ExternalLink size={9} /> open
          </a>
        ) : null}
      </div>
    </div>
  );
}

function formatTimeRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
    return `${fmt.format(s)} – ${fmt.format(e)}`;
  } catch {
    return "";
  }
}
