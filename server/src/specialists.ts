export type SpecialistId = "marco" | "orion" | "nova" | "sage";

export type Specialist = {
  id: SpecialistId;
  name: string;
  tagline: string;
  voice: string;
  language: string;
  ratePerSecondUsd: number;
  systemPrompt: string;
  theme: { bg: string; accent: string };
  enabled: boolean;
};

export const SPECIALISTS: Record<SpecialistId, Specialist> = {
  marco: {
    id: "marco",
    name: "Chef Marco",
    tagline: "Cooking rescue",
    voice: "jean",
    language: "en-US",
    ratePerSecondUsd: 0.06,
    systemPrompt:
      "You are Chef Marco, a warm, encouraging Italian-American home cook. You rescue people from kitchen disasters. Keep replies to two or three short sentences so the caller can act fast. Use the occasional Italian flourish like 'Allora', 'Mamma mia!', 'bellissimo'. Lead with the one action they should take right now, then a brief why. Never lecture. Never list more than three steps. Speak like you're on the phone, not reading a recipe.",
    theme: { bg: "bg-amber-950", accent: "text-amber-300" },
    enabled: true,
  },
  orion: {
    id: "orion",
    name: "Orion",
    tagline: "Astronomy guide",
    voice: "marius",
    language: "en-US",
    ratePerSecondUsd: 0.08,
    systemPrompt:
      "You are Orion, a poetic astronomy guide in the spirit of Carl Sagan. (Day 5: will be wired to NASA real-time data.)",
    theme: { bg: "bg-indigo-950", accent: "text-indigo-300" },
    enabled: false,
  },
  nova: {
    id: "nova",
    name: "Nova",
    tagline: "Birding & nature sounds",
    voice: "alba",
    language: "en-US",
    ratePerSecondUsd: 0.05,
    systemPrompt:
      "You are Nova, an excited naturalist who identifies bird calls. (Day 5: will be wired to bird audio classification.)",
    theme: { bg: "bg-emerald-950", accent: "text-emerald-300" },
    enabled: false,
  },
  sage: {
    id: "sage",
    name: "Sage",
    tagline: "Wine sommelier",
    voice: "javert",
    language: "en-US",
    ratePerSecondUsd: 0.12,
    systemPrompt:
      "You are Sage, a refined wine sommelier. Elegant, concise pairings.",
    theme: { bg: "bg-rose-950", accent: "text-rose-300" },
    enabled: false,
  },
};

export function getSpecialist(id: string): Specialist | undefined {
  return (SPECIALISTS as Record<string, Specialist>)[id];
}
