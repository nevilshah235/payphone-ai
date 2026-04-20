export type SpecialistId = "marco" | "orion" | "nova" | "sage";

export type SpecialistCard = {
  id: SpecialistId;
  name: string;
  tagline: string;
  ratePerSecondUsd: number;
  theme: { bg: string; accent: string };
  enabled: boolean;
};

export type ClientToServer =
  | { type: "start_call"; specialistId: SpecialistId }
  | { type: "user_speech_end" }
  | { type: "end_call" };

export type ServerToClient =
  | { type: "ready"; specialistId: SpecialistId; name: string; ratePerSecondUsd: number }
  | { type: "partial_transcript"; text: string; isFinal: boolean }
  | { type: "assistant_text"; delta: string; done: boolean }
  | { type: "tts_meta"; sampleRate: number }
  | { type: "tts_end" }
  | { type: "error"; code: string; message: string }
  | { type: "call_ended" };
