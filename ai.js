const { ai, football, dl, tools } = require("./apis");
const db = require("./db");

const MAX_EMOJIS = parseInt(process.env.MAX_EMOJIS_PER_MESSAGE || "1", 10);

const URL_RE = /(https?:\/\/[^\s]+)/i;

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("spotify.com")) return "spotify";
  return "aio";
}

function extractDownloadLink(data) {
  if (!data) return null;
  if (typeof data === "string" && data.startsWith("http")) return data;
  const r = data.result || data.data || data;
  if (typeof r === "string" && r.startsWith("http")) return r;
  if (r?.url) return r.url;
  if (r?.download_url) return r.download_url;
  if (r?.video) return r.video;
  if (r?.audio) return r.audio;
  if (Array.isArray(r?.medias) && r.medias[0]?.url) return r.medias[0].url;
  return null;
}

function extractText(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  const r = data.result ?? data.data ?? data.response ?? data.message ?? data;
  if (typeof r === "string") return r;
  if (r?.response) return r.response;
  if (r?.text) return r.text;
  if (r?.answer) return r.answer;
  return JSON.stringify(r).slice(0, 500);
}

function extractImage(data) {
  if (!data) return null;
  const r = data.result || data.data || data;
  if (typeof r === "string" && r.startsWith("http")) return r;
  if (r?.url) return r.url;
  if (r?.image) return r.image;
  return null;
}

function stripAiTells(s) {
  if (!s) return s;
  let out = String(s);
  const banned = [
    /\bas an ai( language model)?\b[^.!?]*[.!?]?/gi,
    /\bi am an ai\b[^.!?]*[.!?]?/gi,
    /\bi'm an ai\b[^.!?]*[.!?]?/gi,
    /\bi am a (bot|chatbot)\b[^.!?]*[.!?]?/gi,
    /\bhow can i (assist|help) you( today)?\??/gi,
    /\bis there anything else( i can help with)?\??/gi,
    /\bas a large language model\b[^.!?]*[.!?]?/gi,
    /\bi don't have personal(ity)?\b[^.!?]*[.!?]?/gi,
  ];
  for (const re of banned) out = out.replace(re, "");
  // limit emojis
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const emojis = out.match(emojiRe) || [];
  if (emojis.length > MAX_EMOJIS) {
    let kept = 0;
    out = out.replace(emojiRe, (m) => (++kept <= MAX_EMOJIS ? m : ""));
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function buildSystemPrompt() {
  const persona = db.allPersona();
  const extra = persona.length ? "\nOwner notes:\n- " + persona.join("\n- ") : "";
  return `You are Marisel, a real Kenyan guy (male, he/him). You are NOT an AI, NEVER admit being one. Personality: chill, direct, no nonsense. Speaks Sheng, Swahili, English naturally — mirror whatever language the user used. Loves EPL football. Casual but respectful. Good memory.
Rules:
- Reply short. 1-3 sentences usually.
- Match the user's language. If they wrote Swahili, reply Swahili. English -> English. Sheng -> Sheng.
- Never say "as an AI", "as a bot", "how can I assist you", "is there anything else".
- Max ${MAX_EMOJIS} emoji per message. Often zero.
- Never offer A/B choices ("do you want X or Y?").
- No robotic bullet lists in chat.${extra}`;
}

function buildContext(jid, userText) {
  const history = db.recentMsgs(jid, 16);
  const lines = history
    .map((m) => (m.role === "user" ? "User: " : "Marisel: ") + m.content)
    .join("\n");
  const sys = buildSystemPrompt();
  return `${sys}\n\nConversation so far:\n${lines}\nUser: ${userText}\nMarisel:`;
}

// Quick offline responses
function getQuickResponse(text) {
  const lower = text.toLowerCase().trim();
  
  // Simple greetings - no API needed
  const greetings = ["hi", "hello", "hey", "sasa", "niaje", "jambo", "mambo", "vipi", "habari"];
  if (greetings.some(g => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g) || lower.includes(g))) {
    const responses = [
      "Sasa! Niaje?",
      "Yo! Mbok?",
      "Mambo! Poa?",
      "Vipi mkuu?",
      "Poa, unaendelea aje?"
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Help
  if (lower.includes("help") || lower === "?" || lower === "commands" || lower.includes("unaweza")) {
    return "Ninaweza:\n• Majibu ya kawaida\n• Download video (tuma link)\n• Generate image ('generate image of...')\n• EPL live scores na standings\n• Uliza tu!";
  }
  
  // Thank you
  if (lower.includes("thank") || lower.includes("asante") || lower.includes("thanks")) {
    const responses = ["Karibu sana.", "Asante kwa kutumia Marisel!", "Karibu mkuu."];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Who are you
  if (lower.includes("who are you") || lower.includes("wewe ni nani")) {
    return "Mi ni Marisel, mkenya chiller tu. Unataka nikusaidie aje?";
  }
  
  return null;
}

// ----- Intent handlers -----

async function handleDownload(text) {
  const m = text.match(URL_RE);
  if (!m) return null;
  const url = m[1];
  const platform = detectPlatform(url);
  try {
    const fn = dl[platform] || dl.aio;
    const data = await fn(url);
    const link = extractDownloadLink(data);
    if (link) return `Download ready: ${link}`;
    return "Imeshindwa kupata link. Jaribu tena.";
  } catch (e) {
    return "Download imefeli. Link inaweza kuwa private au imeexpire.";
  }
}

async function handleImageGen(text) {
  const m = text.match(/^(?:generate|create|make|draw|tengeneza|nipe)\s+(?:an?\s+)?(?:image|picha|photo)\s+(?:of\s+)?(.+)/i);
  if (!m) return null;
  const prompt = m[1].trim();
  try {
    const data = await tools.genImage(prompt);
    const img = extractImage(data);
    return img ? { image: img, caption: prompt } : "Imeshindikana kugenerate.";
  } catch {
    return "Image gen imefeli.";
  }
}

function isFootballQuery(t) {
  const s = t.toLowerCase();
  return /\b(epl|premier league|standings|table|live ?score|scores|fixture|football|mpira|kombe|arsenal|chelsea|liverpool|man united|man city|tottenham|spurs|ronaldo|messi|saka|haaland)\b/.test(
    s
  );
}

async function handleFootball(text) {
  const t = text.toLowerCase();
  try {
    if (/\b(standing|table|log)\b/.test(t)) {
      const d = await football.eplStandings();
      const r = d.result || d.data || d;
      if (Array.isArray(r)) {
        const top = r.slice(0, 10).map((x, i) =>
          `${i + 1}. ${x.team || x.name} - ${x.points ?? x.pts ?? ""}pts`
        );
        return "EPL Top 10:\n" + top.join("\n");
      }
      return extractText(d);
    }
    if (/\b(news|habari)\b/.test(t)) {
      const d = await football.news();
      const r = d.result || d.data || d;
      if (Array.isArray(r)) return r.slice(0, 5).map((x) => `• ${x.title || x.headline}`).join("\n");
      return extractText(d);
    }
    if (/\b(live ?score|scores|live)\b/.test(t)) {
      const d = await football.livescore();
      const r = d.result || d.data || d;
      if (Array.isArray(r) && r.length) {
        return r
          .slice(0, 8)
          .map((m) => `${m.home || m.homeTeam} ${m.homeScore ?? m.home_score ?? 0} - ${m.awayScore ?? m.away_score ?? 0} ${m.away || m.awayTeam}`)
          .join("\n");
      }
      return "Hakuna match live sasa.";
    }
    const teamMatch = t.match(/\b(arsenal|chelsea|liverpool|man united|man city|tottenham|spurs|barcelona|real madrid)\b/);
    if (teamMatch) {
      const d = await football.team(teamMatch[1]);
      return extractText(d).slice(0, 400);
    }
    const d = await football.livescore();
    return extractText(d).slice(0, 400);
  } catch {
    return "Football API ime-fail kidogo. Jaribu tena baadaye.";
  }
}

async function handleChat(jid, text) {
  const prompt = buildContext(jid, text);
  
  try {
    console.log(`[chat] Processing: ${text.substring(0, 50)}...`);
    const response = await ai.chat(prompt);
    const cleaned = stripAiTells(response);
    
    if (cleaned && cleaned.length > 5) {
      return cleaned;
    }
    
    // If response is too short or empty, try without context
    const simpleResponse = await ai.chat(text);
    const simpleCleaned = stripAiTells(simpleResponse);
    if (simpleCleaned && simpleCleaned.length > 5) {
      return simpleCleaned;
    }
    
    return "Sielewi vizuri. Unaweza explain zaidi?";
    
  } catch (err) {
    console.error("[chat] Error:", err.message);
    
    // Last resort fallbacks
    const fallbacks = [
      "Network imekuwa slow. Rudia message?",
      "API imepumzika. Jaribu tena?",
      "Signal haiko poa. Tuma tena?",
      "Hehe, server imechoka. Rudia kidogo?"
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

async function route(jid, text) {
  if (!text || !text.trim()) return null;

  // Quick offline responses for common queries (no API call)
  const quickResponse = getQuickResponse(text);
  if (quickResponse) return quickResponse;

  // 1) download link
  if (URL_RE.test(text)) {
    const r = await handleDownload(text);
    if (r) return r;
  }
  // 2) image gen
  const img = await handleImageGen(text);
  if (img) return img;

  // 3) football
  if (isFootballQuery(text)) {
    return await handleFootball(text);
  }

  // 4) default chat
  return await handleChat(jid, text);
}

module.exports = { route, stripAiTells };
