"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, X, ExternalLink, Volume2, Star } from "lucide-react";
import type { Station } from "@/lib/types";
import { reportPlay } from "@/lib/api";
import { useNowPlaying } from "@/lib/now-playing";

interface Props {
  station: Station | null;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (uuid: string) => void;
  onPlayStart?: (uuid: string) => void;
}

type PlayerStatus = "idle" | "loading" | "playing" | "error";

export default function Player({
  station,
  onClose,
  isFavorite,
  onToggleFavorite,
  onPlayStart,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);

  const nowPlaying = useNowPlaying(station?.url_resolved ?? null, status === "playing");

  // When a new station arrives, replace the audio source and start playing.
  useEffect(() => {
    if (!station) return;
    const audio = audioRef.current;
    if (!audio) return;

    setStatus("loading");
    setError(null);
    audio.src = station.url_resolved || station.url;
    audio.volume = volume;
    audio.play().then(
      () => {
        setStatus("playing");
        reportPlay(station.stationuuid);
        onPlayStart?.(station.stationuuid);
      },
      (err) => {
        setStatus("error");
        setError(humanError(err));
      },
    );
    return () => {
      audio.pause();
    };
    // We deliberately don't depend on `volume`; that's handled separately
    // below so changing volume mid-stream doesn't re-start playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  if (!station) {
    return <audio ref={audioRef} style={{ display: "none" }} />;
  }

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setStatus("loading");
      audio.play().then(
        () => setStatus("playing"),
        (err) => {
          setStatus("error");
          setError(humanError(err));
        },
      );
    } else {
      audio.pause();
      setStatus("idle");
    }
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-3xl w-[92%]">
      <div
        className="rounded-xl border px-4 py-3 flex items-center gap-3"
        style={{
          background: "rgba(26,25,23,0.92)",
          borderColor: "#3a3835",
          backdropFilter: "blur(10px)",
        }}
      >
        <audio
          // No `crossOrigin` attribute on purpose. Setting it would force
          // a CORS preflight that most icecast/shoutcast servers don't
          // satisfy, so the stream would fail to play. The trade-off is
          // we can't read PCM samples through Web Audio for a real
          // frequency-bar visualizer; the pulsing bars below are pure CSS.
          ref={audioRef}
          preload="none"
          onPlaying={() => setStatus("playing")}
          onPause={() => setStatus("idle")}
          onError={() => {
            setStatus("error");
            setError("Stream failed. Some stations geoblock, require https, or are offline.");
          }}
        />
        <button
          type="button"
          onClick={toggle}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "#d4a844", color: "#0f0e0d" }}
          aria-label={status === "playing" ? "Pause" : "Play"}
        >
          {status === "playing" ? <Pause size={18} fill="#0f0e0d" /> : <Play size={18} fill="#0f0e0d" />}
        </button>

        <Pulse playing={status === "playing"} />

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#f0ede8] truncate">
            {station.name.trim() || "(unnamed)"}
          </div>
          {nowPlaying.title ? (
            <div className="text-[11px] text-[#d4a844] truncate font-mono">
              ♪ {nowPlaying.title}
            </div>
          ) : null}
          <div className="text-[11px] text-[#a09890] font-mono truncate">
            {station.country}
            {station.bitrate ? <span className="text-[#6a6460]"> · {station.bitrate} kbps</span> : null}
            {status === "loading" ? <span className="text-[#d4a844]"> · connecting…</span> : null}
            {status === "error" ? <span className="text-[#c45a3a]"> · {error ?? "error"}</span> : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggleFavorite(station.stationuuid)}
          aria-label={isFavorite ? "Unstar" : "Star"}
          title={isFavorite ? "Unstar" : "Star"}
          className="text-[#a09890] hover:text-[#d4a844] flex-shrink-0"
        >
          <Star size={16} fill={isFavorite ? "#d4a844" : "none"} stroke={isFavorite ? "#d4a844" : "currentColor"} />
        </button>
        <div className="hidden md:flex items-center gap-2 text-[#a09890]">
          <Volume2 size={14} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20"
          />
        </div>
        {station.homepage ? (
          <a
            href={station.homepage}
            target="_blank"
            rel="noreferrer"
            className="text-[#a09890] hover:text-[#d4a844]"
            aria-label="Station homepage"
            title="Station homepage"
          >
            <ExternalLink size={16} />
          </a>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close player"
          className="text-[#a09890] hover:text-[#f0ede8]"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

// Three pulse bars next to the play button. They animate while playing
// using staggered CSS keyframes; this is honest decoration, NOT actual
// frequency-bar audio analysis (the audio element doesn't expose samples
// in cross-origin mode and we'd rather have playback than visualization).
function Pulse({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-5 w-6 flex-shrink-0">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1 rounded-sm"
          style={{
            background: playing ? "#d4a844" : "#3a3835",
            height: playing ? undefined : "30%",
            animation: playing ? `pulse-bar 0.9s ${i * 0.12}s ease-in-out infinite` : "none",
            transformOrigin: "bottom",
          }}
        />
      ))}
      <style jsx>{`
        @keyframes pulse-bar {
          0%, 100% { height: 25%; }
          50% { height: 95%; }
        }
      `}</style>
    </div>
  );
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.toLowerCase().includes("not allowed")) {
    return "Browser blocked autoplay. Click play again.";
  }
  if (msg.toLowerCase().includes("network")) {
    return "Stream unreachable.";
  }
  return msg.slice(0, 80);
}
