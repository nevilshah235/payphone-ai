import { fetch, FormData } from "undici";
import { config } from "./config.js";

export type TtsMeta = { sampleRate: number; encoding: "pcm16" };

export type TtsOptions = {
  text: string;
  /** Pocket-TTS built-in voice name (e.g. "paul"), or http/https/hf URL. */
  voice?: string;
  /** Fires once, before the first audio chunk, with the parsed sample rate. */
  onMeta?: (meta: TtsMeta) => void;
};

/**
 * Streams PCM16 mono bytes from a local Pocket-TTS server.
 *
 * Pocket-TTS serves `POST /tts` (multipart/form-data) and returns chunked
 * `audio/wav`. We detect the 44-byte RIFF header on the first bytes, parse
 * the sample rate from offset 24, strip the header, and yield the rest as
 * raw PCM16 samples.
 */
export async function* streamTts(opts: TtsOptions): AsyncGenerator<Uint8Array, void, void> {
  const form = new FormData();
  form.append("text", opts.text);
  if (opts.voice) form.append("voice_url", opts.voice);

  const url = joinUrl(config.POCKETTTS_URL, "/tts");
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Pocket-TTS ${res.status}: ${body.slice(0, 300)}`);
  }

  let detected = false;
  let sampleRate = 24000; // Mimi default; overwritten by WAV header
  let header: Uint8Array | null = null;

  for await (const raw of res.body as AsyncIterable<Buffer | Uint8Array>) {
    const chunk = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    if (!detected) {
      header = header ? concat(header, chunk) : chunk;
      if (header.length < 44) continue;
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      const isRiff =
        header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
        header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45;
      if (isRiff) {
        sampleRate = view.getUint32(24, true);
        const remainder = header.slice(44);
        header = null;
        detected = true;
        opts.onMeta?.({ sampleRate, encoding: "pcm16" });
        if (remainder.length) yield remainder;
        continue;
      }
      // Not a WAV wrapper — emit buffered bytes as raw PCM
      detected = true;
      opts.onMeta?.({ sampleRate, encoding: "pcm16" });
      const flushed = header;
      header = null;
      yield flushed;
      continue;
    }
    yield chunk;
  }
  if (!detected) opts.onMeta?.({ sampleRate, encoding: "pcm16" });
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return b + p;
}
