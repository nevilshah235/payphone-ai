import type { SpecialistCard } from "../types";

type Props = {
  specialists: SpecialistCard[];
  onSelect: (id: SpecialistCard["id"]) => void;
};

export function SpecialistGrid({ specialists, onSelect }: Props) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12 text-center">
        <h1 className="text-5xl font-bold tracking-tight">Expert Line</h1>
        <p className="mt-3 text-neutral-400">Talk to a specialist. Pay per second in USDC.</p>
      </header>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {specialists.map((s) => (
          <button
            key={s.id}
            disabled={!s.enabled}
            onClick={() => s.enabled && onSelect(s.id)}
            className={`group relative rounded-2xl border border-neutral-800 ${s.theme.bg} p-6 text-left transition hover:scale-[1.02] hover:border-neutral-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100`}
          >
            <div className={`mb-3 text-sm font-medium ${s.theme.accent}`}>{s.tagline}</div>
            <div className="text-2xl font-semibold">{s.name}</div>
            <div className="mt-6 text-sm text-neutral-400">${s.ratePerSecondUsd.toFixed(2)} / second</div>
            {!s.enabled && (
              <div className="absolute right-4 top-4 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                Coming Day 2
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
