const path = require("path");
const fs = require("fs");
const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode");
const axios = require("axios");
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

// Express server
const app = express();
let connectionStatus = "starting";
let currentQR = null;
let sock = null;
let reconnectAttempts = 0;
let lastLanguage = "english";

app.get("/", (_req, res) => {
  if (connectionStatus === "open") {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Marisel - Connected</title>
      <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#075e54,#128c7e);color:white}.container{text-align:center;padding:2rem;background:rgba(0,0,0,0.7);border-radius:20px}.checkmark{font-size:5rem;color:#25d366}</style>
      </head>
      <body><div class="container"><div class="checkmark">✓</div><h2>✅ Connected to WhatsApp!</h2><p>Marisel is running</p></div></body></html>
    `);
  } else if (currentQR) {
    qrcode.toDataURL(currentQR, (err, qrDataUrl) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Marisel - Scan QR</title>
        <style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#075e54,#128c7e);color:white}.container{text-align:center;padding:2rem;background:rgba(0,0,0,0.7);border-radius:20px}.qr-container{background:white;padding:1rem;border-radius:16px;display:inline-block;margin:1rem 0}.qr-container img{width:250px;height:250px}button{background:#25d366;border:none;color:white;padding:10px 20px;border-radius:8px;cursor:pointer}</style>
        </head>
        <body><div class="container"><h1>📱 Scan QR Code</h1><div class="qr-container"><img src="${qrDataUrl}"></div><p>WhatsApp > Settings > Linked Devices > Link a Device</p><button onclick="location.reload()">⟳ Refresh</button></div></body></html>
      `);
    });
  } else {
    res.send(`<!DOCTYPE html><html><head><title>Marisel - Starting</title><meta http-equiv="refresh" content="3"><style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#075e54,#128c7e);color:white}.spinner{width:50px;height:50px;border:4px solid rgba(255,255,255,0.3);border-top-color:#25d366;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="spinner"></div></body></html>`);
  }
});

app.get("/health", (_req, res) => res.json({ status: "running", connection: connectionStatus }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[http] Listening on ${PORT}`));

// WhatsApp functions
function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";
}

async function sendToOwner(text) {
  if (!sock) return;
  try {
    await sock.sendMessage(OWNER_JID, { text });
  } catch (e) {}
}

async function handleMessage(m) {
  try {
    if (!m.message) return;
    const jid = m.key.remoteJid;
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return;
    
    const text = extractText(m).trim();
    if (!text) return;
    
    const isFromOwner = m.key.fromMe || jid === OWNER_JID;
    
    // Training mode - owner messaging self
    if (m.key.fromMe && jid === OWNER_JID) {
      const lower = text.toLowerCase().trim();
      
      if (lower === "show training") {
        const notes = db.allPersonaWithIds();
        if (notes.length === 0) {
          await sock.sendMessage(jid, { text: "No training data yet." });
        } else {
          let msg = "📚 *Training Data:*\n\n";
          for (let i = 0; i < notes.length; i++) {
            msg += `${i+1}. ${notes[i].note.substring(0, 100)}${notes[i].note.length > 100 ? "..." : ""}\n`;
          }
          await sock.sendMessage(jid, { text: msg });
        }
        return;
      }
      
      if (lower === "clear training") {
        db.clearPersona();
        await sock.sendMessage(jid, { text: "Training data cleared." });
        return;
      }
      
      const removeMatch = lower.match(/remove training (\d+)/);
      if (removeMatch) {
        const notes = db.allPersonaWithIds();
        const index = parseInt(removeMatch[1]) - 1;
        if (notes[index]) {
          db.removePersonaById(notes[index].id);
          await sock.sendMessage(jid, { text: `Removed training entry ${removeMatch[1]}` });
        } else {
          await sock.sendMessage(jid, { text: "Invalid entry number" });
        }
        return;
      }
      
      db.addPersona(text);
      await sock.sendMessage(jid, { text: "✅ Learned" });
      return;
    }
    
    // Owner commands
    if (isFromOwner && text.toLowerCase() === "marisel pause") {
      db.pause(jid);
      await sock.sendMessage(jid, { text: "Paused" });
      return;
    }
    if (isFromOwner && text.toLowerCase() === "marisel resume") {
      db.unpause(jid);
      await sock.sendMessage(jid, { text: "Resumed" });
      return;
    }
    
    if (m.key.fromMe) return;
    if (db.isPaused(jid)) return;
    
    db.upsertUser(jid, m.pushName || "");
    db.addMsg(jid, "user", text);
    
    try {
      await sock.sendPresenceUpdate("composing", jid);
    } catch {}
    
    const reply = await route(jid, text, isFromOwner, lastLanguage);
    
    if (reply) {
      if (typeof reply === "string") {
        await sock.sendMessage(jid, { text: reply });
        db.addMsg(jid, "marisel", reply);
      } else if (reply.image) {
        await sock.sendMessage(jid, { image: { url: reply.image }, caption: reply.caption || "" });
        db.addMsg(jid, "marisel", "[image]");
      }
      
      // Track last language used
      const lowerText = text.toLowerCase();
      const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo'];
      lastLanguage = swahiliWords.some(w => lowerText.includes(w)) ? "swahili" : "english";
    }
    
    try {
      await sock.sendPresenceUpdate("paused", jid);
    } catch {}
  } catch (e) {
    console.error("[msg]", e.message);
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
  });
  
  sock.ev.on("creds.update", saveCreds);
  
  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      currentQR = qr;
      connectionStatus = "qr";
      console.log("[wa] QR ready - open browser");
    }
    if (connection === "open") {
      connectionStatus = "open";
      currentQR = null;
      reconnectAttempts = 0;
      console.log("[wa] Connected as", sock.user?.id);
    }
    if (connection === "close") {
      connectionStatus = "closed";
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR);
      }
      const wait = [5000, 10000, 20000, 40000][Math.min(reconnectAttempts, 3)];
      reconnectAttempts++;
      setTimeout(() => start(), wait);
    }
  });
  
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      if (m.key.remoteJid === "status@broadcast") {
        await sock.readMessages([m.key]);
        continue;
      }
      await handleMessage(m);
    }
  });
}

start().catch(console.error);

process.on("unhandledRejection", (e) => console.error("[unhandled]", e));
process.on("uncaughtException", (e) => console.error("[uncaught]", e));
