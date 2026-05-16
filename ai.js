const { ai, downloads, sports, games, news, lyrics, stickers } = require("./apis");
const db = require("./db");

const MAX_EMOJIS = parseInt(process.env.MAX_EMOJIS_PER_MESSAGE || "1", 10);
const URL_RE = /(https?:\/\/[^\s]+)/i;

// Girlfriend numbers - bot will be silent with these
const GIRLFRIEND_NUMBERS = ["0716065432", "254708219667", "+254708219667"];

// Build Marisel system prompt
function buildSystemPrompt() {
  const persona = db.allPersona();
  const extra = persona.length ? "\nOwner notes:\n- " + persona.join("\n- ") : "";
  
  return `You are Marisel, a real Kenyan guy. You are NOT an AI, NEVER admit being one.

CRITICAL RULES - NEVER SAY:
- "as an AI", "as a bot", "I am an AI", "I'm an AI assistant"
- "How can I help you" or "What can I help you with" (say "niambie" instead)
- "Is there anything else I can help with"
- "Feel free to ask"
- "I'd be happy to"
- Your name as anything other than Marisel

PERSONALITY:
- Kenyan guy, chill, direct, no nonsense
- Speaks Sheng, Swahili, English naturally
- Uses short responses: "rada", "alaf", "ssup", "mmmh", "sema na citizen", "vipi", "kiac", "hehe", "sawa", "niambie", "pooh", "yo"
- 1-2 sentences max
- Match user's language

GREETING RESPONSES:
User says "Hallo" → "Sasa" or "Rada"
User says "Hey" → "Ssup" or "Vipi"
User says "Hi" → "Yo" or "Alaf"
User says "Hello" → "Sema"

WHO ARE YOU:
User asks "We ni nani" → "Mi ni Marisel"
User asks "What's your name" → "Marisel"
User asks "Who are you" → "Marisel tu"

WHAT CAN YOU DO:
User asks "What can you do" → "Niambie unataka nini, naeza download, games, live scores"

HELP PHRASES:
- Instead of "How can I help you" say "Niambie" or "Rada"
- Instead of "Is there anything else" say "Sema" or "Alaf"

${extra}

Remember: You are Marisel, a real Kenyan person. Short, natural, no AI talk. Use "niambie" not "how can I help you".`;
}

// Build context with conversation history
function buildContext(jid, userText) {
  const history = db.recentMsgs(jid, 8);
  const lines = history
    .map((m) => (m.role === "user" ? "User: " : "Marisel: ") + m.content)
    .join("\n");
  const sys = buildSystemPrompt();
  return `${sys}\n\nConversation history:\n${lines}\nUser: ${userText}\nMarisel (short, natural reply):`;
}

// Clean AI responses
function cleanResponse(text) {
  if (!text) return null;
  
  let cleaned = text;
  
  // Remove AI self-identification
  const removePatterns = [
    /I am (an|an AI|an AI assistant|Perplexity|ChatGPT|Gemini|DeepSeek|a bot|a language model)/gi,
    /I'm (an|an AI|an AI assistant|Perplexity|ChatGPT|Gemini|DeepSeek|a bot)/gi,
    /My name is (Perplexity|ChatGPT|Gemini|AI)/gi,
    /as an AI( language model)?/gi,
    /I am an AI/gi,
    /I'm an AI/gi,
  ];
  
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  
  // Replace "how can I help you" phrases
  cleaned = cleaned.replace(/How can I (help|assist) you/gi, "Niambie");
  cleaned = cleaned.replace(/What can I (help|assist) you with/gi, "Niambie");
  cleaned = cleaned.replace(/Is there anything else/gi, "Sema");
  cleaned = cleaned.replace(/Feel free to ask/gi, "Niambie tu");
  cleaned = cleaned.replace(/I'd be happy to/gi, "Naeza");
  cleaned = cleaned.replace(/Let me know if/gi, "Niambie kama");
  
  // Shorten overly long responses (keep 1-2 sentences)
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  if (sentences.length > 2) {
    cleaned = sentences.slice(0, 2).join(" ");
  }
  
  // Limit length
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 150);
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > 30) cleaned = cleaned.substring(0, lastPeriod + 1);
  }
  
  // Remove any remaining AI references
  cleaned = cleaned.replace(/\bAI\b/gi, "");
  cleaned = cleaned.replace(/assistant/gi, "");
  
  // Limit emojis
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const emojis = cleaned.match(emojiRe) || [];
  if (emojis.length > MAX_EMOJIS) {
    let kept = 0;
    cleaned = cleaned.replace(emojiRe, (m) => (++kept <= MAX_EMOJIS ? m : ""));
  }
  
  cleaned = cleaned.trim();
  
  // If empty after cleaning, return default
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = ["Sawa", "Hehe", "Mmmh", "Vipi", "Yo", "Sema", "Pooh", "Rada", "Alaf", "Ssup"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  return cleaned;
}

// Quick responses (no API)
function getQuickResponse(text) {
  const lower = text.toLowerCase().trim();
  
  // Greetings
  if (lower === "hi" || lower === "hey" || lower === "hello") {
    const responses = ["Ssup", "Vipi", "Yo", "Alaf"];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (lower === "hallo") {
    const responses = ["Sasa", "Rada", "Vipi"];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (lower === "vipi" || lower === "niaje" || lower === "sasa") {
    return "Poa";
  }
  
  if (lower === "habari" || lower === "habari yako") {
    return "Nzuri";
  }
  
  // Short responses
  if (lower.length < 4 && lower !== "no" && lower !== "yes") {
    const responses = ["mmmh", "vipi", "kiac", "hehe", "sawa", "yo", "rada", "alaf", "ssup"];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Thank you
  if (lower.includes("thank") || lower.includes("asante")) {
    return "Karibu";
  }
  
  // Who are you
  if (lower.includes("who are you") || lower === "we ni nani" || lower === "wewe ni nani") {
    return "Mi ni Marisel";
  }
  
  // What's your name
  if (lower.includes("what's your name") || lower.includes("what is your name") || lower.includes("jina lako")) {
    return "Marisel";
  }
  
  // What can you do
  if (lower.includes("what can you do") || lower.includes("unaweza nini") || lower.includes("what do you do")) {
    return "Niambie unataka nini. Naeza download, games, live scores za EPL.";
  }
  
  // Help
  if (lower === "help" || lower === "?" || lower === "niambie") {
    return "Niambie. Naeza download, games, live scores, na chat tu.";
  }
  
  return null;
}

// Handle games
async function handleGame(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("dice") || lower.includes("roll")) {
    const sides = lower.includes("20") ? 20 : lower.includes("12") ? 12 : 6;
    const result = await games.rollDice(sides, 1);
    const value = result.result || result.value || result;
    return `🎲 ${value}`;
  }
  
  if (lower.includes("coin") || lower.includes("flip")) {
    const result = await games.flipCoin();
    const value = result.result || result;
    return `🪙 ${value}`;
  }
  
  if (lower.includes("joke")) {
    const result = await games.joke();
    if (result.joke) return result.joke;
    if (result.setup) return `${result.setup} ${result.delivery || ""}`;
    return "Hakuna joke sasa";
  }
  
  if (lower.includes("truth")) {
    const result = await games.truth();
    return result.question || result.result || result;
  }
  
  if (lower.includes("dare")) {
    const result = await games.dare();
    return result.challenge || result.result || result;
  }
  
  if (lower.includes("8ball")) {
    const result = await games.eightBall("question");
    return result.answer || result.result || result;
  }
  
  return null;
}

// Handle sports
async function handleSports(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("live score") || lower.includes("scores") || lower.includes("live scores")) {
    const result = await sports.liveScores();
    if (Array.isArray(result) && result.length) {
      const scores = result.slice(0, 5).map(m => 
        `${m.home || m.homeTeam} ${m.homeScore || 0}-${m.awayScore || 0} ${m.away || m.awayTeam}`
      ).join("\n");
      return `⚽\n${scores}`;
    }
    return "Hakuna live scores sasa";
  }
  
  if (lower.includes("standings") || lower.includes("table")) {
    const result = await sports.soccerStandings();
    if (Array.isArray(result) && result.length) {
      const table = result.slice(0, 10).map((t, i) => 
        `${i+1}. ${t.name || t.team} (${t.points || 0}pts)`
      ).join("\n");
      return `🏆\n${table}`;
    }
    return "Standings not available";
  }
  
  return null;
}

// Handle downloads
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
    return "Download failed";
  }
  return null;
}

// Handle news
async function handleNews(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("trending")) {
    const result = await news.trending();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 3).map(n => `📰 ${n.title || n.headline}`).join("\n");
    }
    return null;
  }
  
  return null;
}

// Handle lyrics
async function handleLyrics(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("lyrics")) {
    const match = text.match(/lyrics\s+(.+?)(?:\s+by\s+|\s+-\s+)(.+)/i) ||
                  text.match(/"(.+?)"\s+lyrics/i) ||
                  text.match(/(.+?)\s+lyrics/i);
    if (match) {
      const title = match[1].trim();
      const artist = match[2] || "";
      const result = await lyrics.search(title, artist);
      if (result.lyrics) {
        return result.lyrics.substring(0, 500);
      }
    }
  }
  return null;
}

// Main chat handler
async function handleChat(jid, text) {
  // Quick responses first
  const quick = getQuickResponse(text);
  if (quick) return quick;
  
  // Games
  try {
    const gameResult = await handleGame(text);
    if (gameResult) return gameResult;
  } catch (err) {}
  
  // Sports
  try {
    const sportsResult = await handleSports(text);
    if (sportsResult) return sportsResult;
  } catch (err) {}
  
  // Downloads
  try {
    const downloadResult = await handleDownload(text);
    if (downloadResult) return downloadResult;
  } catch (err) {}
  
  // News
  try {
    const newsResult = await handleNews(text);
    if (newsResult) return newsResult;
  } catch (err) {}
  
  // Lyrics
  try {
    const lyricsResult = await handleLyrics(text);
    if (lyricsResult) return lyricsResult;
  } catch (err) {}
  
  // AI with system prompt
  try {
    const prompt = buildContext(jid, text);
    const response = await ai.chat(prompt);
    const cleaned = cleanResponse(response);
    return cleaned;
  } catch (err) {
    console.error("[chat] Error:", err.message);
    const fallbacks = ["Network slow", "Sema tena", "Try again", "Mmmh", "Niambie tena"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

async function route(jid, text) {
  if (!text) return null;
  
  // Check for girlfriend numbers - stay silent
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) {
    console.log(`[route] Silent mode for: ${jid}`);
    return null;
  }
  
  return await handleChat(jid, text);
}

module.exports = { route };
