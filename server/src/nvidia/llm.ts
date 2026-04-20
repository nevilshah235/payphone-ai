import OpenAI from "openai";
import { config } from "../config.js";

export const llm = new OpenAI({
  apiKey: config.NVIDIA_API_KEY,
  baseURL: config.NVIDIA_LLM_ENDPOINT,
});

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function* streamChat(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number; maxTokens?: number } = {}
): AsyncGenerator<string, void, void> {
  const stream = await llm.chat.completions.create({
    model: opts.model ?? config.NVIDIA_LLM_MODEL,
    messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 256,
    stream: true,
  });
  for await (const part of stream) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
