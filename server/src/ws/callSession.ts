import type { WebSocket } from "ws";
import { logger } from "../logger.js";
import { getSpecialist, type Specialist } from "../specialists.js";
import { VoicePipeline } from "../pipelines/voicePipeline.js";
import { streamTts } from "../tts.js";
import type { ClientToServer, ServerToClient } from "../types.js";

const SAMPLE_RATE = 16000;
const MAX_UTTERANCE_SECONDS = 30;

export class CallSession {
  private pipeline: VoicePipeline | null = null;
  private specialist: Specialist | null = null;
  private audioChunks: Uint8Array[] = [];
  private audioBytes = 0;

  constructor(private ws: WebSocket) {
    ws.on("message", (data, isBinary) => this.onMessage(data, isBinary));
    ws.on("close", () => this.teardown());
    ws.on("error", (err) => logger.error({ err }, "ws error"));
  }

  private send(msg: ServerToClient) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private sendBinary(chunk: Uint8Array) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(chunk, { binary: true });
  }

  private async onMessage(raw: unknown, isBinary: boolean) {
    if (isBinary) {
      const buf = raw instanceof Buffer ? new Uint8Array(raw) : raw instanceof ArrayBuffer ? new Uint8Array(raw) : null;
      if (!buf) return;
      // cap at ~30s of audio to avoid memory blowup
      if (this.audioBytes + buf.length > SAMPLE_RATE * 2 * MAX_UTTERANCE_SECONDS) {
        logger.warn("audio buffer full, dropping chunk");
        return;
      }
      this.audioChunks.push(buf);
      this.audioBytes += buf.length;
      return;
    }
    let msg: ClientToServer;
    try {
      msg = JSON.parse(raw instanceof Buffer ? raw.toString() : String(raw));
    } catch {
      this.send({ type: "error", code: "bad_json", message: "invalid JSON" });
      return;
    }
    switch (msg.type) {
      case "start_call":
        await this.startCall(msg.specialistId);
        break;
      case "user_speech_end":
        await this.flushUtterance();
        break;
      case "end_call":
        this.send({ type: "call_ended" });
        this.teardown();
        break;
    }
  }

  private async startCall(specialistId: string) {
    const specialist = getSpecialist(specialistId);
    if (!specialist) {
      this.send({ type: "error", code: "unknown_specialist", message: `No specialist ${specialistId}` });
      return;
    }
    if (!specialist.enabled) {
      this.send({ type: "error", code: "specialist_disabled", message: `${specialist.name} is not yet available` });
      return;
    }
    this.specialist = specialist;
    this.pipeline = new VoicePipeline(specialist, {
      onPartialTranscript: (text, isFinal) => this.send({ type: "partial_transcript", text, isFinal }),
      onAssistantDelta: (delta, done) => this.send({ type: "assistant_text", delta, done }),
      onTtsMeta: (meta) => this.send({ type: "tts_meta", sampleRate: meta.sampleRate }),
      onTtsChunk: (chunk) => this.sendBinary(chunk),
      onTtsEnd: () => this.send({ type: "tts_end" }),
      onError: (code, message) => this.send({ type: "error", code, message }),
    });
    this.send({
      type: "ready",
      specialistId: specialist.id,
      name: specialist.name,
      ratePerSecondUsd: specialist.ratePerSecondUsd,
    });
    // greet
    try {
      for await (const chunk of streamTts({
        text: this.pipeline.greeting(),
        voice: specialist.voice,
        onMeta: (meta) => this.send({ type: "tts_meta", sampleRate: meta.sampleRate }),
      })) {
        this.sendBinary(chunk);
      }
      this.send({ type: "tts_end" });
    } catch (err) {
      logger.error({ err }, "greeting tts failed");
      this.send({ type: "error", code: "tts_error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  private async flushUtterance() {
    if (!this.pipeline || this.audioChunks.length === 0) return;
    const total = new Uint8Array(this.audioBytes);
    let off = 0;
    for (const c of this.audioChunks) {
      total.set(c, off);
      off += c.length;
    }
    this.audioChunks = [];
    this.audioBytes = 0;
    await this.pipeline.processUtterance(total);
  }

  private teardown() {
    this.pipeline = null;
    this.specialist = null;
    this.audioChunks = [];
    this.audioBytes = 0;
    if (this.ws.readyState === this.ws.OPEN) this.ws.close();
  }
}
