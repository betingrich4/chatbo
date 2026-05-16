const path = require("path");
const fs = require("fs");
const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode");
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

// ---------- Express server with QR display ----------
const app = express();
let connectionStatus = "starting";
let currentQR = null;
let qrResolvers = [];

// Serve HTML page with QR code
app.get("/", (_req, res) => {
  if (connectionStatus === "open") {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Marisel - Connected</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #075e54, #128c7e);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(0,0,0,0.7);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          .status { font-size: 1.5rem; margin-bottom: 1rem; }
          .checkmark {
            font-size: 5rem;
            color: #25d366;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="checkmark">✓</div>
          <div class="status">✅ Connected to WhatsApp!</div>
          <p>Your bot is running and ready.</p>
          <small>Device: ${sock?.user?.id || "Unknown"}</small>
        </div>
      </body>
      </html>
    `);
  } else if (currentQR) {
    // Generate QR as dataURL and send HTML
    qrcode.toDataURL(currentQR, (err, qrDataUrl) => {
      if (err) {
        res.status(500).send("Error generating QR");
        return;
      }
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Marisel - Scan QR</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #075e54, #128c7e);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: rgba(0,0,0,0.7);
              border-radius: 20px;
              backdrop-filter: blur(10px);
              max-width: 90%;
            }
            h1 { margin-bottom: 0.5rem; font-size: 1.8rem; }
            .qr-container {
              background: white;
              padding: 1rem;
              border-radius: 16px;
              display: inline-block;
              margin: 1rem 0;
            }
            .qr-container img {
              width: 250px;
              height: 250px;
              display: block;
            }
            .status {
              font-size: 1rem;
              margin: 1rem 0;
              opacity: 0.9;
            }
            .instructions {
              font-size: 0.9rem;
              background: rgba(0,0,0,0.5);
              padding: 1rem;
              border-radius: 12px;
              margin-top: 1rem;
            }
            button {
              background: #25d366;
              border: none;
              color: white;
              padding: 10px 20px;
              border-radius: 8px;
              font-size: 1rem;
              cursor: pointer;
              margin-top: 1rem;
            }
            button:hover {
              background: #128c7e;
            }
            .auto-refresh {
              font-size: 0.8rem;
              margin-top: 0.5rem;
              opacity: 0.7;
            }
          </style>
          <script>
            let refreshTimer;
            function startAutoRefresh() {
              refreshTimer = setTimeout(() => {
                fetch('/qr/status')
                  .then(res => res.json())
                  .then(data => {
                    if (data.connected) {
                      location.reload();
                    } else if (data.qrChanged) {
                      location.reload();
                    } else {
                      startAutoRefresh();
                    }
                  })
                  .catch(() => startAutoRefresh());
              }, 3000);
            }
            startAutoRefresh();
          </script>
        </head>
        <body>
          <div class="container">
            <h1>📱 Scan to Connect</h1>
            <div class="qr-container">
              <img src="${qrDataUrl}" alt="QR Code">
            </div>
            <div class="status">🔄 Waiting for connection...</div>
            <div class="instructions">
              <strong>How to connect:</strong><br>
              1. Open WhatsApp on your phone<br>
              2. Tap <strong>Settings</strong> → <strong>Linked Devices</strong><br>
              3. Tap <strong>Link a Device</strong><br>
              4. Scan this QR code
            </div>
            <button onclick="location.reload()">⟳ Refresh QR</button>
            <div class="auto-refresh">Auto-refreshing when QR updates...</div>
          </div>
        </body>
        </html>
      `);
    });
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Marisel - Waiting</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #075e54, #128c7e);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(0,0,0,0.7);
            border-radius: 20px;
            backdrop-filter: blur(10px);
          }
          .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255,255,255,0.3);
            border-top-color: #25d366;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 1rem auto;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
        <meta http-equiv="refresh" content="3">
      </head>
      <body>
        <div class="container">
          <div class="spinner"></div>
          <div>⏳ Initializing QR code...</div>
          <small>This page will refresh automatically</small>
        </div>
      </body>
      </html>
    `);
  }
});

// API endpoint to check QR/connection status
app.get("/qr/status", (_req, res) => {
  res.json({
    connected: connectionStatus === "open",
    qrPresent: !!currentQR,
    qrChanged: false // For simplicity
  });
});

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
  if (db.isPaused(OWNER_JID)) return;
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
    if (jid.endsWith("@g.us")) return;
    if (jid === "status@broadcast") return;

    const text = extractText(m).trim();
    if (!text) return;

    const senderJid = m.key.fromMe ? OWNER_JID : jid;
    const isFromOwner = m.key.fromMe || senderJid === OWNER_JID;
    const lower = text.toLowerCase().trim();

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

    if (m.key.fromMe && jid === OWNER_JID) {
      db.addPersona(text);
      await sock.sendMessage(jid, { text: "Learned" });
      return;
    }

    if (m.key.fromMe) return;
    if (db.isPaused(jid)) return;

    const pushName = m.pushName || "";
    db.upsertUser(jid, pushName);
    db.addMsg(jid, "user", text);

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
    printQRInTerminal: false, // Don't print QR in terminal
    browser: ["Marisel", "Chrome", "1.0"],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      currentQR = qr;
      connectionStatus = "qr";
      console.log("[wa] QR code generated — view at http://localhost:" + PORT);
    }
    if (connection === "open") {
      connectionStatus = "open";
      currentQR = null;
      reconnectAttempts = 0;
      console.log("[wa] connected as", sock.user?.id);
    }
    if (connection === "close") {
      connectionStatus = "closed";
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log("[wa] disconnected", code, loggedOut ? "(logged out)" : "");
      if (loggedOut) {
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
