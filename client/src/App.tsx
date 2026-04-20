import { useEffect, useState } from "react";
import type { SpecialistCard } from "./types";
import { SpecialistGrid } from "./components/SpecialistGrid";
import { CallView } from "./components/CallView";
import { useVoiceCall } from "./hooks/useVoiceCall";

export default function App() {
  const [specialists, setSpecialists] = useState<SpecialistCard[]>([]);
  const call = useVoiceCall();

  useEffect(() => {
    fetch("/api/specialists")
      .then((r) => r.json())
      .then(setSpecialists)
      .catch(() => setSpecialists([]));
  }, []);

  const current = specialists.find((s) => s.id === call.specialistId) ?? null;

  if (current && call.state !== "idle") {
    return (
      <CallView
        specialist={current}
        state={call.state}
        transcript={call.transcript}
        listeningLevel={call.listeningLevel}
        error={call.error}
        onEnd={call.end}
      />
    );
  }

  return (
    <div className="min-h-full">
      <SpecialistGrid specialists={specialists} onSelect={call.start} />
      {call.error && (
        <div className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-lg bg-red-900/80 px-4 py-2 text-sm">
          {call.error}
        </div>
      )}
    </div>
  );
}
