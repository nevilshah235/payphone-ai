import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { SPECIALISTS } from "./specialists.js";
import { CallSession } from "./ws/callSession.js";
import { initAsr } from "./asr.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, specialists: Object.values(SPECIALISTS).map((s) => ({ id: s.id, enabled: s.enabled })) });
});

app.get("/api/specialists", (_req, res) => {
  res.json(
    Object.values(SPECIALISTS).map((s) => ({
      id: s.id,
      name: s.name,
      tagline: s.tagline,
      ratePerSecondUsd: s.ratePerSecondUsd,
      theme: s.theme,
      enabled: s.enabled,
    }))
  );
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  logger.info({ ip: req.socket.remoteAddress }, "ws connection opened");
  new CallSession(ws);
});

try {
  initAsr();
} catch (err) {
  logger.error({ err }, "ASR init failed; server will boot but calls will error until model is installed");
}

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "server listening");
});
