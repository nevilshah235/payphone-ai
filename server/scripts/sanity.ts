#!/usr/bin/env tsx
/**
 * Day 1 latency sanity check:
 *   - LLM: NVIDIA Llama 3.3 70B (hosted)
 *   - TTS: Pocket-TTS running locally on POCKETTTS_URL
 *   - ASR: Moonshine via sherpa-onnx-node (local, offline)
 *
 * Loads .env from the project root regardless of CWD. Run via
 * `npm run sanity` at the repo root, which delegates to server/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { fetch, FormData } from "undici";
import OpenAI from "openai";
// @ts-expect-error — types from sherpa-onnx-node may lag
import sherpa from "sherpa-onnx-node";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

type Result = {
  name: string;
  ok: boolean;
  ttfbMs?: number;
  totalMs?: number;
  bytes?: number;
  note?: string;
  error?: string;
  thresholdMs?: number;
  thresholdBreached?: boolean;
};

const {
  NVIDIA_API_KEY,
  NVIDIA_LLM_ENDPOINT = "https://integrate.api.nvidia.com/v1",
  NVIDIA_LLM_MODEL = "meta/llama-3.3-70b-instruct",
  POCKETTTS_URL = "http://127.0.0.1:8000",
} = process.env;
const MOONSHINE_MODEL_DIR =
  process.env.MOONSHINE_MODEL_DIR ?? path.join(PROJECT_ROOT, "models/sherpa-onnx-moonshine-tiny-en-int8");

if (!NVIDIA_API_KEY) {
  console.error("✖ NVIDIA_API_KEY is required (for the LLM). Fill in .env from .env.example.");
  process.exit(1);
}

const results: Result[] = [];

async function checkLlm(): Promise<Result> {
  const client = new OpenAI({ apiKey: NVIDIA_API_KEY, baseURL: NVIDIA_LLM_ENDPOINT });
  const t0 = Date.now();
  let ttftMs = 0;
  let tokens = 0;
  try {
    const stream = await client.chat.completions.create({
      model: NVIDIA_LLM_MODEL,
      messages: [
        { role: "system", content: "You are a terse chef." },
        { role: "user", content: "One-sentence rescue tip for burned onions." },
      ],
      max_tokens: 60,
      temperature: 0.3,
      stream: true,
    });
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        if (!ttftMs) ttftMs = Date.now() - t0;
        tokens += 1;
      }
    }
    return {
      name: "LLM (Llama 3.3 70B)",
      ok: true,
      ttfbMs: ttftMs,
      totalMs: Date.now() - t0,
      bytes: tokens,
      note: `${tokens} token deltas`,
      thresholdMs: 1500,
      thresholdBreached: ttftMs > 1500,
    };
  } catch (err) {
    return { name: "LLM (Llama 3.3 70B)", ok: false, error: String(err) };
  }
}

async function checkTts(): Promise<Result> {
  const form = new FormData();
  form.append("text", "Expert Line latency check.");
  form.append("voice_url", "jean");
  const url = joinUrl(POCKETTTS_URL, "/tts");
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      return {
        name: "TTS (Pocket-TTS)",
        ok: false,
        error: `${res.status} ${body.slice(0, 200)}. Is 'pocket-tts serve' running on ${POCKETTTS_URL}?`,
      };
    }
    let ttfbMs = 0;
    let bytes = 0;
    for await (const chunk of res.body as AsyncIterable<Buffer | Uint8Array>) {
      if (!ttfbMs) ttfbMs = Date.now() - t0;
      bytes += chunk.byteLength;
    }
    return {
      name: "TTS (Pocket-TTS)",
      ok: true,
      ttfbMs,
      totalMs: Date.now() - t0,
      bytes,
      thresholdMs: 1000,
      thresholdBreached: ttfbMs > 1000,
    };
  } catch (err) {
    return {
      name: "TTS (Pocket-TTS)",
      ok: false,
      error: `${String(err)}. Is 'pocket-tts serve' running on ${POCKETTTS_URL}?`,
    };
  }
}

async function checkAsr(): Promise<Result> {
  const dir = path.resolve(MOONSHINE_MODEL_DIR);
  if (!fs.existsSync(dir)) {
    return {
      name: "ASR (Moonshine)",
      ok: false,
      error: `Model dir not found: ${dir}. Run ./scripts/setup-models.sh first.`,
    };
  }
  try {
    const loadT0 = Date.now();
    const recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: 16000, featureDim: 80 },
      modelConfig: {
        moonshine: {
          preprocessor: path.join(dir, "preprocess.onnx"),
          encoder: path.join(dir, "encode.int8.onnx"),
          uncachedDecoder: path.join(dir, "uncached_decode.int8.onnx"),
          cachedDecoder: path.join(dir, "cached_decode.int8.onnx"),
        },
        tokens: path.join(dir, "tokens.txt"),
        numThreads: 2,
        provider: "cpu",
        debug: 0,
      },
    });
    const loadMs = Date.now() - loadT0;

    // 3 seconds of a sine wave as placeholder audio
    const samples = new Float32Array(16000 * 3);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.3;
    const t0 = Date.now();
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples });
    recognizer.decode(stream);
    const result = recognizer.getResult(stream);
    const total = Date.now() - t0;
    stream.free?.();
    return {
      name: "ASR (Moonshine)",
      ok: true,
      ttfbMs: total,
      totalMs: total,
      note: `model-load=${loadMs}ms; decoded 3s of audio; got "${(result.text ?? "").slice(0, 40)}"`,
      thresholdMs: 500,
      thresholdBreached: total > 500,
    };
  } catch (err) {
    return { name: "ASR (Moonshine)", ok: false, error: String(err) };
  }
}

async function rateLimitSmoke() {
  console.log("\n▸ Rate-limit smoke (20 rapid LLM calls)…");
  const client = new OpenAI({ apiKey: NVIDIA_API_KEY, baseURL: NVIDIA_LLM_ENDPOINT });
  let ok = 0;
  let rateLimited = 0;
  let other = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 20 }, async () => {
      try {
        await client.chat.completions.create({
          model: NVIDIA_LLM_MODEL,
          messages: [{ role: "user", content: "Say hi." }],
          max_tokens: 4,
        });
        ok++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/429|rate/i.test(msg)) rateLimited++;
        else other++;
      }
    })
  );
  const total = Date.now() - t0;
  console.log(`  ok=${ok}  429=${rateLimited}  other-errors=${other}  elapsed=${total}ms`);
  if (rateLimited > 0) {
    console.log("  ⚠ Rate-limit hit — per spec risk log, have a fallback account or slow down calls.");
  }
}

function joinUrl(base: string, p: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const pp = p.startsWith("/") ? p : `/${p}`;
  return b + pp;
}

function row(r: Result): string {
  const status = r.ok ? (r.thresholdBreached ? "⚠" : "✔") : "✖";
  const ttfb = r.ttfbMs != null ? `${r.ttfbMs}ms` : "—";
  const total = r.totalMs != null ? `${r.totalMs}ms` : "—";
  const threshold = r.thresholdMs != null ? `< ${r.thresholdMs}ms` : "";
  const note = r.error ? `ERROR: ${r.error.slice(0, 180)}` : r.note ?? "";
  return `  ${status}  ${r.name.padEnd(24)}  ttfb=${ttfb.padEnd(7)}  total=${total.padEnd(7)}  ${threshold.padEnd(9)}  ${note}`;
}

async function main() {
  console.log("▸ Expert Line latency sanity check\n");
  console.log(`  LLM:  ${NVIDIA_LLM_ENDPOINT} (${NVIDIA_LLM_MODEL})`);
  console.log(`  TTS:  ${POCKETTTS_URL} (local pocket-tts)`);
  console.log(`  ASR:  ${MOONSHINE_MODEL_DIR} (local Moonshine)\n`);

  const [llm, tts, asr] = await Promise.all([checkLlm(), checkTts(), checkAsr()]);
  results.push(llm, tts, asr);

  console.log("▸ Results\n");
  results.forEach((r) => console.log(row(r)));

  if (process.env.SANITY_BURST === "1") {
    await rateLimitSmoke();
  } else {
    console.log("\n(Skipping rate-limit smoke. Set SANITY_BURST=1 to run it — note it burns NVIDIA quota.)");
  }

  const out = path.join("/tmp", "expertline-latency.json");
  fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`\n  Report saved: ${out}`);

  const anyBreach = results.some((r) => r.thresholdBreached || !r.ok);
  if (anyBreach) {
    console.log("\n⚠ One or more checks failed or exceeded thresholds. Review before proceeding.");
    process.exit(2);
  }
  console.log("\n✔ All checks within thresholds. Clear to proceed with Marco end-to-end.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
