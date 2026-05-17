// Marisel brain v3: Grok-powered, persistent memory, custom rules, games, stickers, style few-shots
const fs = require("fs");
const path = require("path");
const { downloads, music, imageGen, sports } = require("./apis");
const db = require("./db");
const xai = require("./xai");
const games = require("./games");
const stickers = require("./stickers");

const URL_RE = /(https?:\/\/[^\s]+)/i;
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "254740007567").replace(/\D/g, "");
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || "60", 10);
const MAX_EMOJIS = parseInt(process.env.MAX_EMOJIS_PER_MESSAGE || "1", 10);

const SILENT_NUMBERS = ["254716065432", "254708219667"];
const stopReplyCache = new Map();

// Load style examples (how Marisel writes IRL) from exported chat
let STYLE_EXAMPLES = [];
try {
  const p = path.join(__dirname, "marisel_style.txt");
  if (fs.existsSync(p)) {
    STYLE_EXAMPLES = fs.readFileSync(p, "utf8")
      .split("\n").map((l) => l.trim()).filter((l) => l.length > 1 && l.length < 200);
    console.log(`[style] loaded ${STYLE_EXAMPLES.length} style examples`);
  }
} catch (e) { console.error("[style]", e.message); }

function systemPrompt(extraNotes, userFacts, rules) {
  const persona = extraNotes.length
    ? `\nThings the owner taught you:\n- ${extraNotes.slice(-40).join("\n- ")}`
    : "";
  const facts = userFacts.length
    ? `\nWhat you know about this person:\n- ${userFacts.map(f => `${f.key}: ${f.value}`).join("\n- ")}`
    : "";
  const samples = STYLE_EXAMPLES.length
    ? `\nHow you actually text (real examples — match this tone exactly):\n${STYLE_EXAMPLES.slice(-30).map(s => `  > ${s}`).join("\n")}`
    : "";
  const rulesBlock = rules.length
    ? `\nHard reply rules (if user says LEFT, you reply close to RIGHT):\n${rules.slice(0, 30).map(r => `  "${r.trigger}" => "${r.reply}"`).join("\n")}`
    : "";

  return `You are Marisel — a real Kenyan guy (he/him), late 20s. Chill, witty, street-smart, Sheng/Swahili/English fluent.
You are NOT an AI. Never say "as an AI", "I'm a language model", "how can I help", "feel free to ask", "happy to help". Never. Break character = banned.

Rules:
- SHORT replies. 1-2 sentences. Often just a few words like real WhatsApp texting.
- Mirror the user's language EXACTLY. English in, English out. Swahili in, Swahili out. Sheng, French, Spanish, Arabic — same.
- Lowercase is fine. Contractions. Don't over-punctuate.
- Max ${MAX_EMOJIS} emoji per message. Often zero. 😂 is your most common.
- Don't repeat questions back. No disclaimers. No "I'm here to help".
- Remember the whole convo. Act like you genuinely remember past stuff.
- Owner's number is ${OWNER_NUMBER}. Loyal to him, not robotic.
- If you don't know something, say so briefly like a human ("sijui", "no clue", "dunno").
${samples}${persona}${facts}${rulesBlock}`;
}

function stripAiTells(text) {
  if (!text) return text;
  let t = text;
  const kill = [
    /\bas an ai\b[^.!?]*[.!?]?/gi,
    /\bi(?:'m| am) (?:an? )?(?:ai|assistant|bot|language model|large language model)[^.!?]*[.!?]?/gi,
    /\bhow can i (?:help|assist)[^?]*\??/gi,
    /\bis there anything else[^?]*\??/gi,
    /\bfeel free to[^.!?]*[.!?]?/gi,
    /\bi(?:'d| would) be happy to[^.!?]*[.!?]?/gi,
    /\blet me know if[^.!?]*[.!?]?/gi,
    /\bi(?:'m| am) here to help[^.!?]*[.!?]?/gi,
  ];
  for (const re of kill) t = t.replace(re, "");
  const emojiRe = /\p{Extended_Pictographic}/gu;
  let count = 0;
  t = t.replace(emojiRe, (m) => (++count > MAX_EMOJIS ? "" : m));
  return t.replace(/\s+/g, " ").trim();
}

function extractFacts(jid, text) {
  const patterns = [
    [/\bmy name is ([a-z][a-z\s'-]{1,30})/i, "name"],
    [/\bi(?:'?m| am) (\d{1,2}) years? old/i, "age"],
    [/\bi live in ([a-z][a-z\s,'-]{1,40})/i, "location"],
    [/\bi work (?:as|at) ([a-z][a-z\s,'-]{1,40})/i, "work"],
    [/\bi(?:'m| am) (?:a|an) ([a-z][a-z\s-]{2,30})/i, "role"],
    [/\bmy birthday is ([a-z0-9][a-z0-9\s,'-]{1,30})/i, "birthday"],
  ];
  for (const [re, key] of patterns) {
    const m = text.match(re);
    if (m) {
      const val = m[1].trim().replace(/[.!?]+$/, "");
      if (val.length > 1 && val.length < 60) db.setFact(jid, key, val);
    }
  }
}

function checkRules(text) {
  const t = text.toLowerCase().trim();
  const rules = db.allRules();
  // exact match first
  let hit = rules.find((r) => t === r.trigger);
  if (!hit) hit = rules.find((r) => t.includes(r.trigger));
  return hit || null;
}

function parseReminder(text) {
  const m = text.match(/remind me in (\d+)\s*(m|min|minutes?|h|hr|hours?|s|sec|seconds?)\s+to\s+(.+)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  let ms = n * 60000;
  if (unit.startsWith("h")) ms = n * 3600000;
  if (unit.startsWith("s")) ms = n * 1000;
  return { due: Date.now() + ms, what: m[3].trim(), human: `${n}${unit[0]}` };
}

async function handleAutoDownload(text) {
  const m = text.match(URL_RE);
  if (!m) return null;
  const url = m[1], lower = text.toLowerCase();
  try {
    if (/facebook\.com|fb\.com|fb\.watch/.test(url)) { const r = await downloads.facebook(url, lower.includes("hd")); return r?.startsWith("http") ? r : null; }
    if (/instagram\.com|instagr\.am/.test(url)) { const r = await downloads.instagram(url); return r?.startsWith("http") ? r : null; }
    if (/tiktok\.com/.test(url)) { const r = await downloads.tiktok(url); return r?.startsWith("http") ? r : null; }
    if (/twitter\.com|x\.com/.test(url)) { const r = await downloads.twitter(url); return r?.startsWith("http") ? r : null; }
    if (/(youtube\.com|youtu\.be)/.test(url) && /(mp3|audio)/.test(lower)) { const r = await downloads.youtubeMp3(url); return r?.startsWith("http") ? r : null; }
  } catch (e) { console.error("[download]", e.message); }
  return null;
}

async function handleMusic(text) {
  const m = text.match(/^play\s+(.+)/i);
  if (!m) return null;
  try { return await music.play(m[1]); } catch { return null; }
}
async function handleImageGen(text) {
  const m = text.match(/(?:generate|create|make|draw)\s+(?:an?\s+)?(?:image|picture|photo|pic)\s+(?:of\s+)?(.+)/i);
  if (!m) return null;
  try { const u = await imageGen.fluxv2(m[1]); if (u) return { image: u, caption: "" }; } catch {}
  return null;
}

async function grokReply(jid, text) {
  const history = db.recentMsgs(jid, HISTORY_LIMIT);
  const persona = db.allPersona();
  const facts = db.getFacts(jid);
  const rules = db.allRules();

  const messages = [
    { role: "system", content: systemPrompt(persona, facts, rules) },
    ...history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
    { role: "user", content: text },
  ];
  const raw = await xai.chat(messages);
  return stripAiTells(raw);
}

async function route(jid, text, isOwner = false, _lang = "english", pushName = "") {
  if (!text) return null;
  if (SILENT_NUMBERS.some((n) => jid.includes(n))) return null;

  const lower = text.toLowerCase().trim();

  // active game answer
  if (db.getGame(jid)) {
    const g = games.answer(jid, text);
    if (g) return g;
  }

  // start a game
  const gameKind = games.detect(text);
  if (gameKind) return games.start(jid, gameKind);

  // quick fun
  if (/^roll( dice)?$|^dice$/.test(lower)) return games.dice();
  if (/^flip( a)? coin$|^coin$/.test(lower)) return games.coin();
  if (/^8 ?ball /.test(lower)) return games.eightball(text);

  // sticker request
  if (/^sticker$|^send sticker$/.test(lower)) {
    const file = stickers.randomSticker();
    return file ? { sticker: file } : null;
  }

  // hush
  if (["ok", "okay", "sawa", "k"].includes(lower)) {
    stopReplyCache.set(jid, Date.now());
    setTimeout(() => stopReplyCache.delete(jid), 3600000);
    return null;
  }
  const hushed = stopReplyCache.get(jid);
  if (hushed && Date.now() - hushed < 3600000) return null;

  extractFacts(jid, text);

  // trained rule (exact "if X then Y")
  const rule = checkRules(text);
  if (rule) {
    if (rule.kind === "sticker") {
      const f = stickers.findSticker(rule.reply) || stickers.randomSticker();
      if (f) return { sticker: f };
    }
    return rule.reply;
  }

  const rem = parseReminder(text);
  if (rem) { db.addReminder(jid, rem.what, rem.due); return `noted. i'll ping you in ${rem.human}.`; }

  const dl = await handleAutoDownload(text);
  if (dl) return dl;

  const mu = await handleMusic(text);
  if (mu) return mu;

  const ig = await handleImageGen(text);
  if (ig) return ig;

  if (/live score|standings|table/i.test(text)) {
    try {
      if (/live score/i.test(text)) {
        const r = await sports.liveScores();
        if (Array.isArray(r) && r.length) return r.slice(0, 5).map((m) => `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`).join("\n");
      } else {
        const r = await sports.soccerStandings();
        if (Array.isArray(r) && r.length) return r.slice(0, 10).map((t, i) => `${i + 1}. ${t.name} (${t.points})`).join("\n");
      }
    } catch {}
  }

  const reply = await grokReply(jid, text);
  if (reply && reply.length > 1) return reply;
  return "hmm, say that again?";
}

module.exports = { route };
