import path from "node:path";
import fs from "node:fs";
// @ts-expect-error — sherpa-onnx-node ships its own types but they may lag
import sherpa from "sherpa-onnx-node";
import { config } from "./config.js";
import { logger } from "./logger.js";

type SherpaRecognizer = {
  createStream(): SherpaStream;
  decode(stream: SherpaStream): void;
  getResult(stream: SherpaStream): { text?: string };
  free?: () => void;
};

type SherpaStream = {
  acceptWaveform(payload: { sampleRate: number; samples: Float32Array }): void;
  free?: () => void;
};

let recognizer: SherpaRecognizer | null = null;

/** Must be called once at startup. Loads the Moonshine model into memory. */
export function initAsr(): void {
  if (recognizer) return;
  const dir = path.resolve(config.MOONSHINE_MODEL_DIR);
  if (!fs.existsSync(dir)) {
    logger.warn({ dir }, "Moonshine model dir missing — run ./scripts/setup-models.sh. ASR will error on first use.");
    return;
  }
  const cfg = {
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
  };
  logger.info({ dir }, "loading Moonshine recognizer");
  recognizer = new sherpa.OfflineRecognizer(cfg) as SherpaRecognizer;
  logger.info("Moonshine recognizer ready");
}

/**
 * Transcribe a PCM16 16kHz mono buffer. Returns the final text.
 * Utterance-based — the caller decides when an utterance ends (VAD / silence detect).
 */
export async function transcribe(pcm16: Uint8Array): Promise<string> {
  if (!recognizer) {
    initAsr();
    if (!recognizer) throw new Error("Moonshine model not available; run scripts/setup-models.sh");
  }
  const samples = pcm16ToFloat32(pcm16);
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: 16000, samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  stream.free?.();
  return (result.text ?? "").trim();
}

function pcm16ToFloat32(pcm: Uint8Array): Float32Array {
  // PCM16 little-endian → Float32 in [-1, 1]
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}
