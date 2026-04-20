import { logger } from "../logger.js";
import { streamChat, type ChatMessage } from "../nvidia/llm.js";
import { transcribe } from "../asr.js";
import { streamTts } from "../tts.js";
import type { Specialist } from "../specialists.js";

export type PipelineCallbacks = {
  onPartialTranscript: (text: string, isFinal: boolean) => void;
  onAssistantDelta: (delta: string, done: boolean) => void;
  onTtsMeta: (meta: { sampleRate: number }) => void;
  onTtsChunk: (chunk: Uint8Array) => void;
  onTtsEnd: () => void;
  onError: (code: string, message: string) => void;
};

const SENTENCE_BOUNDARY = /([.!?…]+)(\s|$)/;

export class VoicePipeline {
  private history: ChatMessage[] = [];
  private busy = false;

  constructor(
    private specialist: Specialist,
    private cb: PipelineCallbacks
  ) {
    this.history.push({ role: "system", content: specialist.systemPrompt });
  }

  /**
   * Process one full user utterance (PCM16 16kHz mono buffer).
   * Runs ASR → LLM → TTS in sequence, streaming TTS chunks as sentences complete.
   */
  async processUtterance(pcm16: Uint8Array): Promise<void> {
    if (this.busy) {
      logger.warn("pipeline busy, dropping utterance");
      return;
    }
    if (pcm16.length < 16000 * 2 * 0.2) {
      // < 200ms audio; likely noise
      logger.debug({ bytes: pcm16.length }, "utterance too short, ignoring");
      return;
    }
    this.busy = true;
    try {
      // 1. ASR (local Moonshine)
      const t0 = Date.now();
      const transcript = await transcribe(pcm16);
      logger.info({ ms: Date.now() - t0, transcript }, "asr done");
      if (!transcript) return;
      this.cb.onPartialTranscript(transcript, true);
      this.history.push({ role: "user", content: transcript });

      // 2. LLM + 3. TTS streamed sentence-by-sentence
      let buffered = "";
      let full = "";
      const ttsQueue: Promise<void>[] = [];

      const t1 = Date.now();
      let firstTokenAt = 0;
      for await (const delta of streamChat(this.history, { maxTokens: 180, temperature: 0.5 })) {
        if (!firstTokenAt) {
          firstTokenAt = Date.now();
          logger.info({ ms: firstTokenAt - t1 }, "llm first token");
        }
        buffered += delta;
        full += delta;
        this.cb.onAssistantDelta(delta, false);
        const m = buffered.match(SENTENCE_BOUNDARY);
        if (m && m.index !== undefined) {
          const end = m.index + m[0].length;
          const sentence = buffered.slice(0, end).trim();
          buffered = buffered.slice(end);
          if (sentence.length > 0) {
            ttsQueue.push(this.speak(sentence));
          }
        }
      }
      if (buffered.trim().length > 0) ttsQueue.push(this.speak(buffered.trim()));
      this.cb.onAssistantDelta("", true);
      this.history.push({ role: "assistant", content: full });
      await Promise.all(ttsQueue);
      this.cb.onTtsEnd();
      logger.info({ ms: Date.now() - t0, reply: full }, "turn complete");
    } catch (err) {
      logger.error({ err }, "pipeline error");
      this.cb.onError("pipeline_error", err instanceof Error ? err.message : String(err));
    } finally {
      this.busy = false;
    }
  }

  private async speak(text: string): Promise<void> {
    logger.debug({ text }, "tts sentence");
    try {
      for await (const chunk of streamTts({
        text,
        voice: this.specialist.voice,
        onMeta: (meta) => this.cb.onTtsMeta(meta),
      })) {
        this.cb.onTtsChunk(chunk);
      }
    } catch (err) {
      logger.error({ err, text }, "tts sentence failed");
      this.cb.onError("tts_error", err instanceof Error ? err.message : String(err));
    }
  }

  greeting(): string {
    switch (this.specialist.id) {
      case "marco":
        return "Ciao! Chef Marco here. What's cooking?";
      case "orion":
        return "Orion here, ready to wander the night sky with you.";
      case "nova":
        return "Nova here! Got a bird call for me?";
      case "sage":
        return "Sage, at your service. What are we pairing today?";
    }
  }
}
