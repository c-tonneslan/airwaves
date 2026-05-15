"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, X, ExternalLink, Volume2 } from "lucide-react";
import type { Station } from "@/lib/types";
import { reportPlay } from "@/lib/api";

interface Props {
  station: Station | null;
  onClose: () => void;
}

type PlayerStatus = "idle" | "loading" | "playing" | "error";

export default function Player({ station, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);

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
      },
      (err) => {
        setStatus("error");
        setError(humanError(err));
      },
    );
    return () => {
      audio.pause();
    };
  }, [station, volume]);

  // Don't recreate the audio element when volume changes; just mutate it.
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
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-3xl w-[92%]"
    >
      <div
        className="rounded-xl border px-4 py-3 flex items-center gap-3"
        style={{
          background: "rgba(26,25,23,0.92)",
          borderColor: "#3a3835",
          backdropFilter: "blur(10px)",
        }}
      >
        <audio
          ref={audioRef}
          preload="none"
          crossOrigin="anonymous"
          onPlaying={() => setStatus("playing")}
          onPause={() => setStatus("idle")}
          onError={() => {
            setStatus("error");
            setError("Stream failed. Some stations geoblock or require https.");
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
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#f0ede8] truncate">
            {station.name}
          </div>
          <div className="text-[11px] text-[#a09890] font-mono truncate">
            {station.country}
            {station.bitrate ? <span className="text-[#6a6460]"> · {station.bitrate} kbps</span> : null}
            {status === "loading" ? <span className="text-[#d4a844]"> · connecting…</span> : null}
            {status === "error" ? <span className="text-[#c45a3a]"> · {error ?? "error"}</span> : null}
          </div>
        </div>
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
