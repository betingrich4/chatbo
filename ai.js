const { ai, downloads, sports, games, news, lyrics, stickers, quotes } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["0716065432", "254708219667", "+254708219667"];

// Simple, fast system prompt
function buildPrompt(userText, history) {
  const hist = history.slice(-6).map(m => 
    `${m.role === "user" ? "U" : "M"}: ${m.content}`
  ).join("\n");
  
  return `Wewe ni Marisel, Mkenya. Jibu fupi sana, kiasili, kwa Kiswahili au Sheng. Usijitambulishe kama AI. Usiseme "how can I help you". Sema "niambie" badala yake.

Historia:
${hist}

U: ${userText}
M:`;
}

// Clean AI response
function cleanResponse(text) {
  if (!text) return null;
  
  let cleaned = text;
  
  // Remove AI phrases
  const removePatterns = [
    /I am (an|an AI|Perplexity|ChatGPT|assistant|bot)/gi,
    /I'm (an|an AI|assistant|bot)/gi,
    /as an AI/gi,
    /How can I help/gi,
    /What can I help/gi,
    /Is there anything/gi,
    /Feel free/gi,
    /I'd be happy/gi,
    /Let me know/gi,
  ];
  
  for (const re of removePatterns) {
    cleaned = cleaned.replace(re, "");
  }
  
  // Replace help phrases
  cleaned = cleaned.replace(/How can I (help|assist) you/gi, "Niambie");
  cleaned = cleaned.replace(/What can I (help|assist) you with/gi, "Niambie");
  
  // Limit length
  if (cleaned.length > 180) {
    cleaned = cleaned.substring(0, 180);
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > 40) cleaned = cleaned.substring(0, lastPeriod + 1);
  }
  
  cleaned = cleaned.trim();
  
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = ["Sawa", "Hehe", "Mmmh", "Vipi", "Yo", "Pooh", "Rada", "Alaf", "Ssup", "Niambie"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  return cleaned;
}

// Quick responses - no API call
function quickReply(text) {
  const lower = text.toLowerCase().trim();
  
  // Greetings
  if (lower === "hallo" || lower === "hello" || lower === "hi" || lower === "hey") {
    const replies = ["Sasa", "Vipi", "Rada", "Ssup", "Yo", "Alaf"];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  
  if (lower === "sasa" || lower === "vipi" || lower === "niaje") {
    return "Poa";
  }
  
  if (lower === "habari" || lower === "mambo" || lower === "habari gani") {
    return "Nzuri";
  }
  
  if (lower === "poa" || lower === "fresh") {
    return "Sawa";
  }
  
  // Short messages
  if (lower.length < 4 && lower !== "no" && lower !== "yes") {
    const short = ["mmmh", "hehe", "sawa", "rada", "alaf", "ssup"];
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
  if (lower.includes("jina lako") || lower.includes("your name") || lower.includes("name?")) {
    return "Marisel";
  }
  
  // What can you do
  if (lower.includes("unaweza nini") || lower.includes("what can you do")) {
    return "Niambie. Naeza download, games, live scores za EPL, na chat tu.";
  }
  
  // Help
  if (lower === "help" || lower === "?" || lower === "niambie") {
    return "Niambie unataka nini. Naeza download link, games, live scores za EPL.";
  }
  
  return null;
}

// Handle games
async function handleGame(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("dice") || lower.includes("roll") || lower.includes("kete")) {
    const sides = lower.includes("20") ? 20 : lower.includes("12") ? 12 : 6;
    const result = await games.rollDice(sides, 1);
    const value = result.result || result.value || result;
    return `🎲 ${value}`;
  }
  
  if (lower.includes("coin") || lower.includes("flip") || lower.includes("sarafu")) {
    const result = await games.flipCoin();
    const value = result.result || result;
    return `🪙 ${value}`;
  }
  
  if (lower.includes("joke") || lower.includes("utani") || lower.includes("chesi")) {
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
  
  if (lower.includes("8ball") || lower.includes("magic") || lower.includes("mpira wa ajabu")) {
    const question = text.replace(/8ball|magic|mpira wa ajabu/i, "").trim();
    const result = await games.eightBall(question || "life");
    return `🔮 ${result.answer || result.result || result}`;
  }
  
  if (lower.includes("rock") || lower.includes("paper") || lower.includes("scissors") || 
      lower.includes("rps") || lower.includes("jiwe") || lower.includes("karatasi") || lower.includes("makasi")) {
    let choice = "rock";
    if (lower.includes("paper") || lower.includes("karatasi")) choice = "paper";
    if (lower.includes("scissors") || lower.includes("makasi")) choice = "scissors";
    const result = await games.rps(choice);
    const computer = result.computer || result.opponent;
    const winner = result.result || result.winner;
    return `✊ ${choice} vs ${computer}\n${winner}`;
  }
  
  return null;
}

// Handle sports
async function handleSports(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("live score") || lower.includes("scores") || lower.includes("live scores") || lower.includes("matokeo")) {
    const result = await sports.liveScores();
    if (Array.isArray(result) && result.length) {
      const scores = result.slice(0, 5).map(m => 
        `${m.home || m.homeTeam} ${m.homeScore || 0}-${m.awayScore || 0} ${m.away || m.awayTeam}`
      ).join("\n");
      return scores;
    }
    return "Hakuna live scores sasa";
  }
  
  if (lower.includes("standings") || lower.includes("table") || lower.includes("msimamo")) {
    const result = await sports.soccerStandings();
    if (Array.isArray(result) && result.length) {
      const table = result.slice(0, 10).map((t, i) => 
        `${i+1}. ${t.name || t.team} (${t.points || 0})`
      ).join("\n");
      return `🏆 EPL\n${table}`;
    }
    return "Standings not available";
  }
  
  if (lower.includes("player") && (lower.includes("search") || lower.includes("tafuta"))) {
    const match = text.match(/(?:player|tafuta)\s+(.+)/i);
    if (match) {
      const result = await sports.playerSearch(match[1]);
      if (result.name || result.player) {
        return `👤 ${result.name || result.player}`;
      }
      return "Player not found";
    }
  }
  
  if (lower.includes("highlights")) {
    const result = await sports.sportsHighlights();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 3).map(h => `🎥 ${h.title || h.match}`).join("\n");
    }
    return "No highlights";
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
    if (lower.includes("mp3") || lower.includes("audio") || lower.includes("sauti")) {
      const result = await downloads.youtubeMp3(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (lower.includes("video")) {
      const result = await downloads.youtubeVideo(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (lower.includes("instagram") || url.includes("instagram.com")) {
      const result = await downloads.instagram(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (url.includes("facebook.com") || url.includes("fb.com")) {
      const result = await downloads.facebook(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (url.includes("tiktok.com")) {
      const result = await downloads.tiktok(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (url.includes("twitter.com") || url.includes("x.com")) {
      const result = await downloads.twitter(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    return null;
  } catch (err) {
    return null;
  }
}

// Handle news
async function handleNews(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("trending") || lower.includes("trend")) {
    const result = await news.trending();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 3).map(n => `📰 ${n.title || n.headline}`).join("\n");
    }
    return null;
  }
  
  if (lower.includes("bbc")) {
    const result = await news.bbc();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 3).map(n => `📺 ${n.title || n.headline}`).join("\n");
    }
    return null;
  }
  
  if (lower.includes("sports news")) {
    const result = await news.sports();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 3).map(n => `⚽ ${n.title || n.headline}`).join("\n");
    }
    return null;
  }
  
  return null;
}

// Handle quotes
async function handleQuote(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("quote") || lower.includes("nukuu") || lower.includes("wisdom")) {
    const result = await quotes.random();
    if (result.quote || result.text) {
      return `💬 "${result.quote || result.text}" - ${result.author || "Unknown"}`;
    }
    return null;
  }
  
  if (lower.includes("inspire") || lower.includes("motivation")) {
    const result = await quotes.inspirational();
    if (result.quote || result.text) {
      return `💪 "${result.quote || result.text}" - ${result.author || "Unknown"}`;
    }
    return null;
  }
  
  return null;
}

// Main chat handler - FAST
async function handleChat(jid, text) {
  // Quick replies first (no API)
  const quick = quickReply(text);
  if (quick) return quick;
  
  // Games
  try {
    const game = await handleGame(text);
    if (game) return game;
  } catch (err) {}
  
  // Sports
  try {
    const sportsResult = await handleSports(text);
    if (sportsResult) return sportsResult;
  } catch (err) {}
  
  // Downloads
  try {
    const download = await handleDownload(text);
    if (download) return download;
  } catch (err) {}
  
  // News
  try {
    const newsResult = await handleNews(text);
    if (newsResult) return newsResult;
  } catch (err) {}
  
  // Quotes
  try {
    const quoteResult = await handleQuote(text);
    if (quoteResult) return quoteResult;
  } catch (err) {}
  
  // AI chat - fast single call
  try {
    const history = db.recentMsgs(jid, 6);
    const prompt = buildPrompt(text, history);
    
    // Try GPT-3 first (fastest)
    let response = await ai.chat(prompt);
    
    // If too short or empty, try ChatGPT
    if (!response || response.length < 3) {
      response = await ai.chatGpt(prompt);
    }
    
    // Final fallback
    if (!response || response.length < 3) {
      response = await ai.chatGifted(text);
    }
    
    const cleaned = cleanResponse(response);
    return cleaned;
    
  } catch (err) {
    console.error("[chat] Error:", err.message);
    const fallbacks = ["Sema tena", "Niambie", "Mmmh", "Rada", "Try again"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

async function route(jid, text) {
  if (!text) return null;
  
  // Silent mode for girlfriends
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) {
    console.log(`[route] Silent mode for: ${jid}`);
    return null;
  }
  
  return await handleChat(jid, text);
}

module.exports = { route };
