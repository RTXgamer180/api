require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { Server } = require("socket.io");
const mineflayer = require("mineflayer");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ORIGIN = process.env.PUBLIC_ORIGIN || "http://localhost:8080";
const ALLOWED = new Set((process.env.ALLOWED_SERVERS || "127.0.0.1:25565")
  .split(",").map(x => x.trim().toLowerCase()).filter(Boolean));
const MAX_BOTS = Math.max(1, Math.min(2, Number(process.env.MAX_BOTS_PER_SESSION || 1)));
const CONNECT_TIMEOUT = Number(process.env.BOT_CONNECT_TIMEOUT_MS || 20000);

const app = express();
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: ORIGIN, methods: ["GET", "POST"] }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "JJ Bot Control" }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN, methods: ["GET", "POST"] }, maxHttpBufferSize: 1e5 });

const sessions = new Map();
const activeBots = new Map();
const usernamePattern = /^[A-Za-z0-9_]{3,16}$/;
const directions = new Set(["forward", "left", "right", "stop"]);

function parseServer(value) {
  if (typeof value !== "string" || value.length > 255) throw new Error("Invalid server address.");
  const match = value.trim().match(/^([a-zA-Z0-9.-]+):(\d{1,5})$/);
  if (!match) throw new Error("Use host:port format.");
  const host = match[1].toLowerCase();
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new Error("Invalid port.");
  const canonical = `${host}:${port}`;
  if (!ALLOWED.has(canonical)) throw new Error("That server is not on this backend's permission allowlist.");
  return { host, port, canonical };
}
function publicBot(bot) {
  return { botId: bot.id, username: bot.username, server: bot.server, status: bot.status };
}
function emitStatus(owner, bot, status, message) {
  bot.status = status;
  io.to(owner).emit("bot:status", { botId: bot.id, status, message });
}
function removeBot(owner, botId, reason = "Bot disconnected.") {
  const bot = activeBots.get(botId);
  if (!bot || bot.owner !== owner) return;
  activeBots.delete(botId);
  try { bot.client?.quit(reason.slice(0, 80)); } catch {}
  io.to(owner).emit("bot:removed", { botId });
}
function cleanupSession(socketId) {
  const ids = [...activeBots.values()].filter(b => b.owner === socketId).map(b => b.id);
  ids.forEach(id => removeBot(socketId, id, "Dashboard session ended."));
  sessions.delete(socketId);
}
function getOwnedBot(socket, botId) {
  const bot = activeBots.get(botId);
  if (!bot || bot.owner !== socket.id) throw new Error("Bot session not found.");
  return bot;
}

io.on("connection", socket => {
  sessions.set(socket.id, { createdAt: Date.now(), lastCreate: 0 });
  socket.join(socket.id);

  socket.on("session:sync", () => {
    const list = [...activeBots.values()].filter(b => b.owner === socket.id).map(publicBot);
    socket.emit("session:state", list);
  });

  socket.on("bot:create", async data => {
    try {
      const session = sessions.get(socket.id);
      if (!session) throw new Error("Session expired. Refresh the page.");
      if (Date.now() - session.lastCreate < 5000) throw new Error("Please wait before creating another bot.");
      session.lastCreate = Date.now();
      const ownedCount = [...activeBots.values()].filter(b => b.owner === socket.id).length;
      if (ownedCount >= MAX_BOTS) throw new Error(`Limit: ${MAX_BOTS} bot per browser session.`);
      if (data?.auth !== "offline") throw new Error("Only private offline-mode test servers are enabled in this starter.");
      const target = parseServer(data.server);
      const username = String(data.username || "").trim();
      if (!usernamePattern.test(username)) throw new Error("Username must be 3–16 letters, numbers or underscores.");
      if ([...activeBots.values()].some(b => b.username.toLowerCase() === username.toLowerCase()))
        throw new Error("That username is already in use. Generate another one.");

      const id = crypto.randomUUID();
      const record = { id, owner: socket.id, username, server: target.canonical, status: "connecting", client: null };
      activeBots.set(id, record);
      socket.emit("bot:created", publicBot(record));

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        if (activeBots.has(id)) {
          emitStatus(socket.id, record, "error", "Connection timed out.");
          removeBot(socket.id, id, "Connection timeout.");
        }
      }, CONNECT_TIMEOUT);

      try {
        const client = mineflayer.createBot({
          host: target.host,
          port: target.port,
          username,
          auth: "offline",
          hideErrors: false
        });
        record.client = client;
        client.once("login", () => {
          clearTimeout(timer);
          if (!activeBots.has(id)) return client.quit();
          emitStatus(socket.id, record, "connected", "Connected to the permitted test server.");
        });
        client.on("spawn", () => {
          if (!activeBots.has(id)) return;
          const p = client.entity?.position;
          io.to(socket.id).emit("bot:status", {
            botId: id, status: "connected",
            stats: {
              position: p ? { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) } : null,
              health: client.health, food: client.food
            }
          });
        });
        client.on("health", () => {
          if (!activeBots.has(id)) return;
          const p = client.entity?.position;
          io.to(socket.id).emit("bot:status", {
            botId: id, status: record.status,
            stats: { position: p ? { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) } : null, health: client.health, food: client.food }
          });
        });
        client.on("kicked", reason => {
          if (!activeBots.has(id)) return;
          emitStatus(socket.id, record, "kicked", "Server kicked the bot.");
          removeBot(socket.id, id, "Kicked.");
        });
        client.on("error", err => {
          if (!activeBots.has(id)) return;
          clearTimeout(timer);
          emitStatus(socket.id, record, "error", "Connection error: " + String(err.message || err).slice(0, 120));
          removeBot(socket.id, id, "Connection error.");
        });
        client.on("end", () => {
          clearTimeout(timer);
          if (activeBots.has(id)) removeBot(socket.id, id, "Connection ended.");
        });
      } catch (err) {
        clearTimeout(timer);
        if (!timedOut) {
          emitStatus(socket.id, record, "error", "Could not start bot: " + String(err.message).slice(0, 100));
          removeBot(socket.id, id, "Startup error.");
        }
      }
    } catch (err) {
      socket.emit("bot:error", { message: err.message || "Could not create bot." });
    }
  });

  socket.on("bot:control", ({ botId, action } = {}) => {
    try {
      const bot = getOwnedBot(socket, botId);
      if (!bot.client || bot.status !== "connected") throw new Error("Bot is not connected yet.");
      if (action === "jump") {
        bot.client.setControlState("jump", true);
        setTimeout(() => { if (activeBots.has(botId)) bot.client.setControlState("jump", false); }, 250);
      } else if (directions.has(action)) {
        ["forward", "back", "left", "right", "jump", "sprint"].forEach(k => bot.client.setControlState(k, false));
        if (action !== "stop") bot.client.setControlState(action, true);
      } else throw new Error("Unsupported control.");
    } catch (err) { socket.emit("bot:error", { message: err.message }); }
  });

  socket.on("bot:chat", ({ botId, message } = {}) => {
    try {
      const bot = getOwnedBot(socket, botId);
      if (!bot.client || bot.status !== "connected") throw new Error("Bot is not connected.");
      const msg = String(message || "").trim();
      if (!msg || msg.length > 160) throw new Error("Chat message must be 1–160 characters.");
      bot.client.chat(msg);
      socket.emit("bot:log", { botId, message: `${bot.username}: ${msg}` });
    } catch (err) { socket.emit("bot:error", { message: err.message }); }
  });

  socket.on("bot:disconnect", ({ botId } = {}) => {
    try { getOwnedBot(socket, botId); removeBot(socket.id, botId, "Disconnected by owner."); }
    catch (err) { socket.emit("bot:error", { message: err.message }); }
  });

  socket.on("disconnect", () => cleanupSession(socket.id));
});

server.listen(PORT, () => {
  console.log(`JJ Bot Control backend listening on port ${PORT}`);
  console.log(`Allowed servers: ${[...ALLOWED].join(", ") || "(none)"}`);
});
