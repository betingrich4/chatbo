const path = require("path");
const fs = require("fs");
const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const db = require("./db");
const { route } = require("./ai");
const footballMonitor = require("./football");

const OWNER_NUMBER = (process.env.OWNER_NUMBER || "254740007567").replace(/\D/g, "");
const OWNER_JID = `${OWNER_NUMBER}@s.whatsapp.net`;
const DATA_DIR = process.env.DATA_DIR || ".";
const AUTH_DIR = path.join(DATA_DIR, "auth_info");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const logger = pino({ level: "warn" });

// ---------- Express health server ----------
const app = express();
let connectionStatus = "starting";
app.get("/", (_req, res) => res.send("Marisel running"));
app.get("/health", (_req, res) =>
  res.json({ status: "Marisel running", connection: connectionStatus })
);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[http] listening on ${PORT}`));

// ---------- WhatsApp ----------
let sock = null;
let reconnectAttempts = 0;

function nextBackoff() {
  const steps = [5000, 10000, 20000, 40000, 60000];
  return steps[Math.min(reconnectAttempts, steps.length - 1)];
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

async function sendToOwner(text) {
  if (!sock) return;
  if (db.isPaused(OWNER_JID)) return; // respect pause for owner alerts too
  try {
    await sock.sendMessage(OWNER_JID, { text });
  } catch (e) {
    console.error("[owner-send]", e.message);
  }
}

async function handleMessage(m) {
  try {
    if (!m.message) return;
    const jid = m.key.remoteJid;
    if (!jid) return;

    // GROUPS: ignore completely
    if (jid.endsWith("@g.us")) return;
    // status broadcast
    if (jid === "status@broadcast") return;

    const text = extractText(m).trim();
    if (!text) return;

    const senderJid = m.key.fromMe ? OWNER_JID : jid;
    const isFromOwner = m.key.fromMe || senderJid === OWNER_JID;
    const lower = text.toLowerCase().trim();

    // --- Owner pause/resume (only owner, only affects current chat jid) ---
    if (isFromOwner && lower === "marisel pause") {
      db.pause(jid);
      await sock.sendMessage(jid, { text: "Paused" });
      return;
    }
    if (isFromOwner && lower === "marisel resume") {
      db.unpause(jid);
      await sock.sendMessage(jid, { text: "Resumed" });
      return;
    }

    // --- Training: owner messaging own number (note to self) ---
    if (m.key.fromMe && jid === OWNER_JID) {
      db.addPersona(text);
      await sock.sendMessage(jid, { text: "Learned" });
      return;
    }

    // Ignore other fromMe messages (owner talking to others manually)
    if (m.key.fromMe) return;

    // If this chat is paused -> total silence
    if (db.isPaused(jid)) return;

    // store user message + upsert user
    const pushName = m.pushName || "";
    db.upsertUser(jid, pushName);
    db.addMsg(jid, "user", text);

    // typing indicator
    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch {}

    const reply = await route(jid, text);
    if (!reply) return;

    if (typeof reply === "string") {
      await sock.sendMessage(jid, { text: reply });
      db.addMsg(jid, "marisel", reply);
    } else if (reply.image) {
      await sock.sendMessage(jid, {
        image: { url: reply.image },
        caption: reply.caption || "",
      });
      db.addMsg(jid, "marisel", `[image] ${reply.caption || ""}`);
    }

    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {}
  } catch (e) {
    console.error("[msg]", e);
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ["Marisel", "Chrome", "1.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      connectionStatus = "qr";
      console.log("\n=== Scan this QR with WhatsApp (Linked Devices) ===\n");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "open") {
      connectionStatus = "open";
      reconnectAttempts = 0;
      console.log("[wa] connected as", sock.user?.id);
    }
    if (connection === "close") {
      connectionStatus = "closed";
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log("[wa] disconnected", code, loggedOut ? "(logged out)" : "");
      if (loggedOut) {
        // need fresh QR — clear auth so next start prompts QR
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true });
        } catch {}
      }
      const wait = nextBackoff();
      reconnectAttempts++;
      console.log(`[wa] reconnecting in ${wait}ms`);
      setTimeout(() => start().catch((e) => console.error(e)), wait);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      handleMessage(m);
    }
  });
}

// Live football monitor
footballMonitor.start(sendToOwner);

start().catch((e) => {
  console.error("[boot]", e);
  setTimeout(() => start().catch(() => {}), 5000);
});

process.on("unhandledRejection", (e) => console.error("[unhandled]", e));
process.on("uncaughtException", (e) => console.error("[uncaught]", e));
