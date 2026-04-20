import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientToServer, ServerToClient, SpecialistId } from "../types";
import { PlaybackQueue } from "../audio/playbackQueue";

export type CallState = "idle" | "connecting" | "live" | "thinking" | "ending";

export type TranscriptEntry = { who: "user" | "assistant"; text: string };

const SILENCE_MS = 900;
const SPEECH_THRESHOLD = 0.02; // RMS of Int16 normalized to [-1, 1]

export function useVoiceCall() {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [specialistId, setSpecialistId] = useState<SpecialistId | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [listeningLevel, setListeningLevel] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);
  const lastSpeechAt = useRef(0);
  const hadSpeech = useRef(false);
  const pendingAssistant = useRef("");

  const send = useCallback((m: ClientToServer) => {
    wsRef.current?.send(JSON.stringify(m));
  }, []);

  const start = useCallback(async (id: SpecialistId) => {
    setError(null);
    setState("connecting");
    setSpecialistId(id);
    setTranscript([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: 48000 });
      ctxRef.current = ctx;
      await ctx.audioWorklet.addModule("/mic-worklet.js");
      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, "mic-worklet", { processorOptions: { targetRate: 16000 } });
      source.connect(worklet);
      workletRef.current = worklet;

      const queue = new PlaybackQueue(ctx);
      queueRef.current = queue;

      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        send({ type: "start_call", specialistId: id });
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          const msg = JSON.parse(ev.data) as ServerToClient;
          handleServerMessage(msg);
        } else {
          queueRef.current?.enqueue(new Uint8Array(ev.data as ArrayBuffer));
        }
      };

      ws.onerror = () => setError("WebSocket error");
      ws.onclose = () => {
        setState("idle");
      };

      worklet.port.onmessage = (ev) => {
        const pcm = ev.data as Int16Array;
        const rms = computeRms(pcm);
        setListeningLevel(rms);
        if (rms > SPEECH_THRESHOLD) {
          lastSpeechAt.current = Date.now();
          hadSpeech.current = true;
        } else if (hadSpeech.current && Date.now() - lastSpeechAt.current > SILENCE_MS) {
          hadSpeech.current = false;
          send({ type: "user_speech_end" });
          setState((s) => (s === "live" ? "thinking" : s));
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pcm.buffer);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState("idle");
    }

    function handleServerMessage(msg: ServerToClient) {
      switch (msg.type) {
        case "ready":
          setState("live");
          break;
        case "partial_transcript":
          if (msg.isFinal && msg.text.trim()) {
            setTranscript((t) => [...t, { who: "user", text: msg.text }]);
          }
          break;
        case "assistant_text":
          if (msg.done) {
            if (pendingAssistant.current.trim()) {
              const finalText = pendingAssistant.current.trim();
              setTranscript((t) => [...t, { who: "assistant", text: finalText }]);
            }
            pendingAssistant.current = "";
          } else {
            pendingAssistant.current += msg.delta;
            setState((s) => (s === "thinking" ? "live" : s));
          }
          break;
        case "tts_meta":
          queueRef.current?.setSampleRate(msg.sampleRate);
          break;
        case "tts_end":
          setState((s) => (s === "thinking" ? "live" : s));
          break;
        case "error":
          setError(`${msg.code}: ${msg.message}`);
          break;
        case "call_ended":
          break;
      }
    }
  }, [send]);

  const end = useCallback(() => {
    setState("ending");
    try { wsRef.current?.send(JSON.stringify({ type: "end_call" })); } catch {}
    wsRef.current?.close();
    workletRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    wsRef.current = null;
    workletRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    queueRef.current = null;
    setSpecialistId(null);
    setState("idle");
  }, []);

  useEffect(() => () => end(), [end]);

  return { state, error, specialistId, transcript, listeningLevel, start, end };
}

function computeRms(pcm: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) {
    const v = pcm[i]! / 0x8000;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}
