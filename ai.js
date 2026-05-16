const { ai, downloads, sports, games, news, stickers } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;

// Girlfriend numbers - bot will be silent
const GIRLFRIEND_NUMBERS = ["0716065432", "254708219667", "+254708219667"];

// Fast, simple system prompt
function buildPrompt(userText, history) {
  const hist = history.slice(-6).map(m => 
    `${m.role === "user" ? "U" : "M"}: ${m.content}`
  ).join("\n");
  
  return `Wewe ni Marisel, Mkenya. Jibu fupi, kiasili, kwa Kiswahili au Sheng. Usijitambulishe kama AI.

Historia:
${hist}

U: ${userText}
M:`;
}

// Clean AI response - remove AI talk
function cleanResponse(text) {
  if (!text) return null;
  
  let cleaned = text;
  
  // Remove AI phrases
  const remove = [
    /I am (an|an AI|Perplexity|ChatGPT|assistant)/gi,
    /I'm (an|an AI|assistant)/gi,
    /as an AI/gi,
    /How can I help/gi,
    /What can I help/gi,
    /Is there anything/gi,
    /Feel free/gi,
  ];
  
  for (const re of remove) {
    cleaned = cleaned.replace(re, "");
  }
  
  // Limit length
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200);
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > 50) cleaned = cleaned.substring(0, lastPeriod + 1);
  }
  
  cleaned = cleaned.trim();
  
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = ["Sawa", "Hehe", "Mmmh", "Vipi", "Yo", "Pooh", "Rada"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  return cleaned;
}

// Fast quick responses (no API)
function quickReply(text) {
  const lower = text.toLowerCase().trim();
  
  // Greetings in Kiswahili
  if (lower === "hallo" || lower === "hello" || lower === "hi" || lower === "hey") {
    const replies = ["Sasa", "Vipi", "Rada", "Ssup", "Yo", "Alaf"];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  
  if (lower === "sasa" || lower === "vipi" || lower === "niaje") {
    return "Poa";
  }
  
  if (lower === "habari" || lower === "mambo") {
    return "Nzuri";
  }
  
  // Short
  if (lower.length < 4) {
    const short = ["mmmh", "hehe", "sawa", "rada", "alaf"];
    return short[Math.floor(Math.random() * short.length)];
  }
  
  // Thank you
  if (lower.includes("asante") || lower.includes("thank")) {
    return "Karibu";
  }
  
  // Who are you
  if (lower.includes("wewe ni nani") || lower.includes("who are you")) {
    return "Mi ni Marisel";
  }
  
  // What's your name
  if (lower.includes("jina lako") || lower.includes("your name")) {
    return "Marisel";
  }
  
  // What can you do
  if (lower.includes("unaweza nini") || lower.includes("what can you do")) {
    return "Niambie. Naeza download, games, live scores za EPL, na chat tu.";
  }
  
  return null;
}

// Games
async function handleGame(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("dice") || lower.includes("roll")) {
    const sides = lower.includes("20") ? 20 : lower.includes("12") ? 12 : 6;
    const result = await games.rollDice(sides);
    return `🎲 ${result.result || result.value || result}`;
  }
  
  if (lower.includes("coin") || lower.includes("flip")) {
    const result = await games.flipCoin();
    return `🪙 ${result.result || result}`;
  }
  
  if (lower.includes("joke") || lower.includes("utani")) {
    const result = await games.joke();
    if (result.joke) return result.joke;
    if (result.setup) return `${result.setup}\n${result.delivery || ""}`;
    return "Hakuna joke sasa";
  }
  
  if (lower.includes("truth") || lower.includes("ukweli")) {
    const result = await games.truth();
    return result.question || result.result || result;
  }
  
  if (lower.includes("dare") || lower.includes("changamoto")) {
    const result = await games.dare();
    return result.challenge || result.result || result;
  }
  
  return null;
}

// Sports
async function handleSports(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("live score") || lower.includes("scores")) {
    const result = await sports.liveScores();
    if (Array.isArray(result) && result.length) {
      const scores = result.slice(0, 5).map(m => 
        `${m.home || m.homeTeam} ${m.homeScore || 0}-${m.awayScore || 0} ${m.away || m.awayTeam}`
      ).join("\n");
      return scores;
    }
    return "Hakuna live scores sasa";
  }
  
  if (lower.includes("standings") || lower.includes("table")) {
    const result = await sports.soccerStandings();
    if (Array.isArray(result) && result.length) {
      const table = result.slice(0, 10).map((t, i) => 
        `${i+1}. ${t.name || t.team} (${t.points || 0})`
      ).join("\n");
      return table;
    }
    return "Standings not available";
  }
  
  return null;
}

// Downloads
async function handleDownload(text) {
  const urlMatch = text.match(URL_RE);
  if (!urlMatch) return null;
  const url = urlMatch[1];
  const lower = text.toLowerCase();
  
  try {
    if (lower.includes("mp3") || lower.includes("audio")) {
      const result = await downloads.youtubeMp3(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link) return link;
    }
    
    if (lower.includes("instagram") || url.includes("instagram.com")) {
      const result = await downloads.instagram(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link) return link;
    }
    
    if (url.includes("facebook.com")) {
      const result = await downloads.facebook(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link) return link;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Main chat - FAST with one API call
async function handleChat(jid, text) {
  // Quick replies first
  const quick = quickReply(text);
  if (quick) return quick;
  
  // Games (fast)
  try {
    const game = await handleGame(text);
    if (game) return game;
  } catch (err) {}
  
  // Sports (fast)
  try {
    const sportsResult = await handleSports(text);
    if (sportsResult) return sportsResult;
  } catch (err) {}
  
  // Downloads
  try {
    const download = await handleDownload(text);
    if (download) return download;
  } catch (err) {}
  
  // AI chat - single fast call
  try {
    const history = db.recentMsgs(jid, 6);
    const prompt = buildPrompt(text, history);
    
    // Try GPT-3 first (fastest)
    let response = await ai.chat(prompt);
    
    // If fails, try fallback
    if (!response || response.length < 2) {
      response = await ai.chatFast(text);
    }
    
    const cleaned = cleanResponse(response);
    return cleaned;
    
  } catch (err) {
    console.error("[chat] Error:", err.message);
    // Fast fallbacks - no delay
    const fallbacks = ["Sema tena", "Niambie", "Mmmh", "Rada"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

async function route(jid, text) {
  if (!text) return null;
  
  // Silent for girlfriends
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) {
    return null;
  }
  
  return await handleChat(jid, text);
}

module.exports = { route };
