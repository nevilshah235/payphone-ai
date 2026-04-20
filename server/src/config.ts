import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Load .env from the repo root regardless of CWD (server is launched from /server).
const HERE = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(HERE, "../../.env") });

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.string().default("info"),

  // LLM (NVIDIA-hosted)
  NVIDIA_API_KEY: z.string().min(1, "NVIDIA_API_KEY is required (LLM)"),
  NVIDIA_LLM_ENDPOINT: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_LLM_MODEL: z.string().default("meta/llama-3.3-70b-instruct"),

  // TTS (local pocket-tts server)
  POCKETTTS_URL: z.string().url().default("http://127.0.0.1:8000"),

  // ASR (local Moonshine via sherpa-onnx-node)
  MOONSHINE_MODEL_DIR: z
    .string()
    .default(path.resolve(HERE, "../../models/sherpa-onnx-moonshine-tiny-en-int8")),
});

export const config = schema.parse(process.env);
export type Config = typeof config;
