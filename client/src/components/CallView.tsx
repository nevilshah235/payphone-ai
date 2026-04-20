import { useEffect, useRef } from "react";
import type { SpecialistCard } from "../types";
import type { CallState, TranscriptEntry } from "../hooks/useVoiceCall";

type Props = {
  specialist: SpecialistCard;
  state: CallState;
  transcript: TranscriptEntry[];
  listeningLevel: number;
  error: string | null;
  onEnd: () => void;
};

export function CallView({ specialist, state, transcript, listeningLevel, error, onEnd }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  return (
    <div className={`flex h-full flex-col ${specialist.theme.bg}`}>
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-5">
        <div>
          <div className={`text-xs uppercase tracking-wider ${specialist.theme.accent}`}>{specialist.tagline}</div>
          <div className="mt-1 text-2xl font-semibold">{specialist.name}</div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-sm text-neutral-300">${specialist.ratePerSecondUsd.toFixed(2)}/sec</div>
          <StatePill state={state} />
          <button
            onClick={onEnd}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            End call
          </button>
        </div>
      </header>
      <div ref={logRef} className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {transcript.length === 0 && (
            <div className="text-center text-neutral-400">Say something — {specialist.name} is listening.</div>
          )}
          {transcript.map((t, i) => (
            <div
              key={i}
              className={`rounded-xl px-4 py-3 ${t.who === "user" ? "bg-white/10 text-neutral-100" : "bg-white/5 " + specialist.theme.accent}`}
            >
              <div className="mb-1 text-xs uppercase tracking-wider opacity-60">
                {t.who === "user" ? "You" : specialist.name}
              </div>
              <div className="text-base leading-relaxed">{t.text}</div>
            </div>
          ))}
        </div>
      </div>
      {error && <div className="bg-red-900/60 px-8 py-2 text-sm">{error}</div>}
      <footer className="border-t border-white/10 px-8 py-4">
        <LevelMeter level={listeningLevel} />
      </footer>
    </div>
  );
}

function StatePill({ state }: { state: CallState }) {
  const color =
    state === "live"
      ? "bg-emerald-500"
      : state === "thinking"
      ? "bg-sky-400"
      : state === "connecting"
      ? "bg-yellow-500"
      : "bg-neutral-500";
  const label = state === "thinking" ? "thinking…" : state;
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-300">
      <span className={`h-2 w-2 rounded-full ${color} ${state === "live" || state === "thinking" ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}

function LevelMeter({ level }: { level: number }) {
  const pct = Math.min(1, level * 6);
  return (
    <div className="flex items-center gap-3 text-xs text-neutral-400">
      <span>mic</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
