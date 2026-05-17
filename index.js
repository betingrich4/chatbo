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
const stickers = require("./stickers");

const OWNER_NUMBER = (process.env.OWNER_NUMBER || "254740007567").replace(/\D/g, "");
const OWNER_JID = `${OWNER_NUMBER}@s.whatsapp.net`;
const DATA_DIR = process.env.DATA_DIR || ".";
const AUTH_DIR = path.join(DATA_DIR, "auth_info");
const AUTO_VIEW_STATUS = (process.env.AUTO_VIEW_STATUS || "true") === "true";
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

const logger = pino({ level: "warn" });

const app = express();
let connectionStatus = "starting";
let currentQR = null;
let sock = null;
let reconnectAttempts = 0;

app.get("/", (_req, res) => {
  if (connectionStatus === "open") {
    res.send(`<!DOCTYPE html><html><head><title>Marisel</title><style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#075e54,#128c7e);color:white}.c{text-align:center;padding:2rem;background:rgba(0,0,0,0.7);border-radius:20px}.k{font-size:5rem;color:#25d366}</style></head><body><div class="c"><div class="k">✓</div><h2>Connected</h2><p>Marisel is live</p></div></body></html>`);
  } else if (currentQR) {
    qrcode.toDataURL(currentQR, (_e, u) => {
      res.send(`<!DOCTYPE html><html><head><title>Scan QR</title><style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#075e54,#128c7e);color:white}.c{text-align:center;padding:2rem;background:rgba(0,0,0,0.7);border-radius:20px}.q{background:white;padding:1rem;border-radius:16px;display:inline-block;margin:1rem 0}.q img{width:250px;height:250px}button{background:#25d366;border:none;color:white;padding:10px 20px;border-radius:8px;cursor:pointer}</style></head><body><div class="c"><h1>📱 Scan QR</h1><div class="q"><img src="${u}"></div><p>WhatsApp > Linked Devices > Link a Device</p><button onclick="location.reload()">⟳ Refresh</button></div></body></html>`);
    });
  } else {
    res.send(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"><style>body{display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#075e54}.s{width:50px;height:50px;border:4px solid rgba(255,255,255,0.3);border-top-color:#25d366;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="s"></div></body></html>`);
  }
});
app.get("/health", (_req, res) => res.json({ status: "running", connection: connectionStatus, stickers: stickers.listStickers().length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[http] Listening on ${PORT}`));

// Reminder loop
setInterval(async () => {
  if (!sock || connectionStatus !== "open") return;
  try {
    const due = db.dueReminders(Date.now());
    for (const r of due) {
      await sock.sendMessage(r.jid, { text: `⏰ reminder: ${r.text}` });
      db.doneReminder(r.id);
    }
  } catch (e) { console.error("[reminder]", e.message); }
}, 30000);

function extractText(msg) {
  const m = msg.message;
  if (!m) return "";
  return m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || "";
}

// Send reply that quotes original message (the WhatsApp slide-to-reply highlight)
async function sendReply(jid, content, originalMsg) {
  const opts = originalMsg ? { quoted: originalMsg } : undefined;
  if (typeof content === "string") {
    return sock.sendMessage(jid, { text: content }, opts);
  }
  if (content.image) {
    return sock.sendMessage(jid, { image: { url: content.image }, caption: content.caption || "" }, opts);
  }
  if (content.sticker) {
    return sock.sendMessage(jid, { sticker: fs.readFileSync(content.sticker) }, opts);
  }
}

// ------ Training command parser (run inside self-chat) ------
function tryTrainingCommand(text) {
  const t = text.trim();

  // sticker rule:   sticker: <trigger> => <sticker name or filename>
  let m = t.match(/^sticker\s*:\s*(.+?)\s*(?:=>|→|->)\s*(.+)$/i);
  if (m) { db.addRule(m[1], m[2], "sticker"); return `🩻 sticker rule saved: "${m[1].toLowerCase()}" → sticker ${m[2]}`; }

  // text rule: if someone says X respond Y    OR    X => Y
  m = t.match(/^if\s+(?:someone|they|user)?\s*says?\s+["']?(.+?)["']?\s+(?:reply|respond|answer)\s+(?:with\s+)?["']?(.+?)["']?$/i);
  if (m) { db.addRule(m[1], m[2], "text"); return `✅ rule saved: "${m[1].toLowerCase()}" → "${m[2]}"`; }

  m = t.match(/^["']?(.+?)["']?\s*(?:=>|→|->)\s*["']?(.+?)["']?$/);
  if (m && m[1].length < 80) { db.addRule(m[1], m[2], "text"); return `✅ rule saved: "${m[1].toLowerCase()}" → "${m[2]}"`; }

  return null;
}

async function handleSelfChat(jid, text, msg) {
  const lower = text.toLowerCase().trim();

  if (lower === "help" || lower === "marisel help") {
    return sendReply(jid, [
      "📖 *Marisel commands (self-chat training)*",
      "",
      "• `if someone says sasa respond poa sana` — train reply",
      "• `<trigger> => <reply>` — short form rule",
      "• `sticker: <trigger> => <sticker filename>` — sticker rule",
      "• `show training` — list persona notes",
      "• `show rules` — list trained rules",
      "• `remove rule N` — delete a rule",
      "• `clear rules` — wipe rules",
      "• `clear training` — wipe persona",
      "• `stickers` — list available stickers",
      "• `marisel pause` / `marisel resume` — (used in other chats)",
      "",
      "Any other text = saved as persona note.",
    ].join("\n"), msg);
  }

  if (lower === "show training") {
    const notes = db.allPersonaWithIds();
    if (!notes.length) return sendReply(jid, "📚 no training data yet.", msg);
    const out = notes.map((n, i) => `${i + 1}. ${n.note.length > 80 ? n.note.slice(0, 80) + "…" : n.note}`).join("\n");
    return sendReply(jid, `📚 *Training (${notes.length})*\n\n${out}`, msg);
  }
  if (lower === "clear training") { db.clearPersona(); return sendReply(jid, "🗑️ training cleared.", msg); }
  const rm = lower.match(/^remove training (\d+)$/);
  if (rm) {
    const notes = db.allPersonaWithIds(); const i = parseInt(rm[1]) - 1;
    if (notes[i]) { db.removePersonaById(notes[i].id); return sendReply(jid, `✅ removed #${rm[1]}`, msg); }
    return sendReply(jid, `❌ not found`, msg);
  }

  if (lower === "show rules") {
    const rules = db.allRules();
    if (!rules.length) return sendReply(jid, "📋 no rules yet.", msg);
    return sendReply(jid, `📋 *Rules*\n${rules.map((r, i) => `${i + 1}. [${r.kind}] "${r.trigger}" → ${r.reply}`).join("\n")}`, msg);
  }
  if (lower === "clear rules") { db.clearRules(); return sendReply(jid, "🗑️ rules cleared.", msg); }
  const rmR = lower.match(/^remove rule (\d+)$/);
  if (rmR) {
    const rules = db.allRules(); const i = parseInt(rmR[1]) - 1;
    if (rules[i]) { db.removeRule(rules[i].id); return sendReply(jid, `✅ removed rule #${rmR[1]}`, msg); }
    return sendReply(jid, `❌ not found`, msg);
  }

  if (lower === "stickers") {
    const list = stickers.listStickers();
    return sendReply(jid, list.length ? `🎴 *${list.length} stickers:*\n${list.join("\n")}` : "no stickers in src/sticker/", msg);
  }

  // Try parsing as a rule
  const r = tryTrainingCommand(text);
  if (r) return sendReply(jid, r, msg);

  // Default: persona note
  db.addPersona(text);
  return sendReply(jid, `✅ learned (${db.countPersona()} notes)`, msg);
}

async function handleMessage(m) {
  try {
    if (!m.message) return;
    const jid = m.key.remoteJid;
    if (!jid) return;

    // ====== Auto-view statuses ======
    if (jid === "status@broadcast") {
      if (AUTO_VIEW_STATUS && !m.key.fromMe) {
        try {
          if (!db.isStatusViewed(m.key.id)) {
            await sock.readMessages([m.key]);
            db.markStatusViewed(m.key.id, m.key.participant || "");
          }
        } catch (e) { /* ignore */ }
      }
      return;
    }

    if (jid.endsWith("@g.us")) return;

    const text = extractText(m).trim();
    if (!text) return;

    const isSelfChat = m.key.fromMe && jid === OWNER_JID;
    const isFromOwner = m.key.fromMe || jid === OWNER_JID;

    if (isSelfChat) { await handleSelfChat(jid, text, m); return; }

    if (isFromOwner && text.toLowerCase() === "marisel pause") { db.pause(jid); await sendReply(jid, "Paused", m); return; }
    if (isFromOwner && text.toLowerCase() === "marisel resume") { db.unpause(jid); await sendReply(jid, "Resumed", m); return; }

    if (m.key.fromMe) return;
    if (db.isPaused(jid)) return;

    db.upsertUser(jid, m.pushName || "");
    db.addMsg(jid, "user", text);

    try { await sock.sendPresenceUpdate("composing", jid); } catch {}

    const reply = await route(jid, text, isFromOwner, "english", m.pushName || "");

    if (reply) {
      await sendReply(jid, reply, m);
      const log = typeof reply === "string" ? reply : reply.image ? "[image]" : reply.sticker ? "[sticker]" : "[media]";
      db.addMsg(jid, "marisel", log);
    }

    try { await sock.sendPresenceUpdate("paused", jid); } catch {}
  } catch (e) {
    console.error("[msg]", e.message);
  }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version, logger, auth: state,
    printQRInTerminal: false,
    browser: ["Marisel", "Chrome", "1.0"],
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) { currentQR = qr; connectionStatus = "qr"; console.log("[wa] QR ready - open the web URL"); }
    if (connection === "open") {
      connectionStatus = "open"; currentQR = null; reconnectAttempts = 0;
      console.log("[wa] Connected as", sock.user?.id);
      console.log("[wa] Owner JID:", OWNER_JID);
      console.log("[wa] Stickers loaded:", stickers.listStickers().length);
      try { footballMonitor(sock, OWNER_JID); } catch {}
    }
    if (connection === "close") {
      connectionStatus = "closed";
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR);
      }
      const wait = [5000, 10000, 20000, 40000, 60000][Math.min(reconnectAttempts, 4)];
      reconnectAttempts++;
      console.log(`[wa] reconnecting in ${wait / 1000}s`);
      setTimeout(start, wait);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) await handleMessage(m);
  });
}

start().catch((e) => { console.error("[start]", e); process.exit(1); });
