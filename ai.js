const { ai, downloads, sports, games, news, lyrics, stickers } = require("./apis");
const db = require("./db");

const MAX_EMOJIS = parseInt(process.env.MAX_EMOJIS_PER_MESSAGE || "1", 10);
const URL_RE = /(https?:\/\/[^\s]+)/i;

// Girlfriend numbers - bot will be silent with these
const GIRLFRIEND_NUMBERS = ["0716065432", "254708219667", "+254708219667"];

function stripAiTells(s) {
  if (!s) return s;
  let out = String(s);
  const banned = [
    /\bas an ai( language model)?\b[^.!?]*[.!?]?/gi,
    /\bi am an ai\b[^.!?]*[.!?]?/gi,
    /\bi'm an ai\b[^.!?]*[.!?]?/gi,
    /\bhow can i (assist|help) you\??/gi,
  ];
  for (const re of banned) out = out.replace(re, "");
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const emojis = out.match(emojiRe) || [];
  if (emojis.length > MAX_EMOJIS) {
    let kept = 0;
    out = out.replace(emojiRe, (m) => (++kept <= MAX_EMOJIS ? m : ""));
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

// Quick responses (no API)
function getQuickResponse(text) {
  const lower = text.toLowerCase().trim();
  
  const shortResponses = ["mmmh", "sema na citizen", "vipi", "kiac", "yo", "hehe", "sawa"];
  
  if (lower.length < 5) {
    return shortResponses[Math.floor(Math.random() * shortResponses.length)];
  }
  
  if (lower.includes("thanks") || lower.includes("asante")) {
    return "Karibu.";
  }
  
  if (lower === "?" || lower === "??") {
    return "sema tu";
  }
  
  return null;
}

// Handle games
async function handleGame(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("dice") || lower.includes("roll")) {
    const sidesMatch = lower.match(/sides?[=:]\s*(\d+)/i) || lower.match(/(\d+)\s*sides?/i);
    const sides = sidesMatch ? parseInt(sidesMatch[1]) : 6;
    const result = await games.rollDice(sides, 1);
    const value = result.result || result.value || result;
    return `🎲 Rolled ${value}`;
  }
  
  if (lower.includes("coin") || lower.includes("flip")) {
    const result = await games.flipCoin();
    const value = result.result || result;
    return `🪙 ${value}`;
  }
  
  if (lower.includes("trivia")) {
    const result = await games.trivia();
    if (result.results && result.results[0]) {
      const q = result.results[0];
      return `📚 ${q.question}\nAnswer: ${q.correct_answer}`;
    }
    return `🎯 ${result.question || result.result || result}`;
  }
  
  if (lower.includes("joke")) {
    const result = await games.joke();
    if (result.joke) return `😂 ${result.joke}`;
    if (result.setup) return `😂 ${result.setup}\n${result.delivery || ""}`;
    return `😂 ${result.result || result}`;
  }
  
  if (lower.includes("truth")) {
    const result = await games.truth();
    return `💀 ${result.question || result.result || result}`;
  }
  
  if (lower.includes("dare")) {
    const result = await games.dare();
    return `😈 ${result.challenge || result.result || result}`;
  }
  
  if (lower.includes("8ball") || lower.includes("magic")) {
    const question = text.replace(/8ball|magic 8|8 ball/i, "").trim();
    const result = await games.eightBall(question || "Will I be successful?");
    return `🔮 ${result.answer || result.result || result}`;
  }
  
  if (lower.includes("rock") || lower.includes("paper") || lower.includes("scissors")) {
    let choice = "rock";
    if (lower.includes("paper")) choice = "paper";
    if (lower.includes("scissors")) choice = "scissors";
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
  
  if (lower.includes("live score") || lower.includes("scores")) {
    const result = await sports.liveScores();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 5).map(m => `${m.home || m.homeTeam} ${m.homeScore || 0} - ${m.awayScore || 0} ${m.away || m.awayTeam}`).join("\n");
    }
    return "No live scores currently";
  }
  
  if (lower.includes("standings") || lower.includes("table")) {
    const result = await sports.soccerStandings();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 10).map((t, i) => `${i+1}. ${t.name || t.team} - ${t.points || 0}pts`).join("\n");
    }
    return "Standings not available";
  }
  
  if (lower.includes("player")) {
    const match = text.match(/player\s+(.+)/i);
    if (match) {
      const result = await sports.playerSearch(match[1]);
      return `👤 ${JSON.stringify(result).substring(0, 200)}`;
    }
  }
  
  if (lower.includes("team")) {
    const match = text.match(/team\s+(.+)/i);
    if (match) {
      const result = await sports.teamSearch(match[1]);
      return `⚽ ${JSON.stringify(result).substring(0, 200)}`;
    }
  }
  
  if (lower.includes("highlights")) {
    const result = await sports.sportsHighlights();
    return `🎥 ${JSON.stringify(result).substring(0, 200)}`;
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
      if (link) return `🎵 Download: ${link}`;
    }
    
    if (lower.includes("instagram") || url.includes("instagram.com")) {
      const result = await downloads.instagram(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link) return `📸 ${link}`;
    }
    
    if (lower.includes("facebook") || url.includes("facebook.com")) {
      const result = await downloads.facebook(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link) return `📘 ${link}`;
    }
    
    return "Send Instagram/Facebook/YouTube link";
  } catch (err) {
    return "Download failed. Try again.";
  }
}

// Handle news
async function handleNews(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("trending")) {
    const result = await news.trending();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 5).map(n => `📰 ${n.title || n.headline}`).join("\n");
    }
    return "No trending news";
  }
  
  if (lower.includes("bbc")) {
    const result = await news.bbc();
    if (Array.isArray(result) && result.length) {
      return result.slice(0, 5).map(n => `📺 ${n.title || n.headline}`).join("\n");
    }
    return "BBC news not available";
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
        const lyricsText = result.lyrics.substring(0, 800);
        return `🎵 ${title}\n\n${lyricsText}`;
      }
      return "Lyrics not found";
    }
  }
  return null;
}

// Handle stickers
async function handleSticker(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("sticker")) {
    const match = text.match(/sticker\s+(.+)/i);
    if (match) {
      const result = await stickers.search(match[1]);
      if (result.stickers && result.stickers[0]?.url) {
        return { sticker: result.stickers[0].url };
      }
      if (result.results && result.results[0]?.url) {
        return { sticker: result.results[0].url };
      }
    }
  }
  return null;
}

// Main chat handler
async function handleChat(text) {
  // Try quick response first
  const quick = getQuickResponse(text);
  if (quick) return quick;
  
  // Try game handlers
  try {
    const gameResult = await handleGame(text);
    if (gameResult) return gameResult;
  } catch (err) {}
  
  // Try sports handlers
  try {
    const sportsResult = await handleSports(text);
    if (sportsResult) return sportsResult;
  } catch (err) {}
  
  // Try download handlers
  try {
    const downloadResult = await handleDownload(text);
    if (downloadResult && typeof downloadResult === 'string') return downloadResult;
  } catch (err) {}
  
  // Try news handlers
  try {
    const newsResult = await handleNews(text);
    if (newsResult) return newsResult;
  } catch (err) {}
  
  // Try lyrics handlers
  try {
    const lyricsResult = await handleLyrics(text);
    if (lyricsResult) return lyricsResult;
  } catch (err) {}
  
  // Try sticker handlers
  try {
    const stickerResult = await handleSticker(text);
    if (stickerResult && stickerResult.sticker) return stickerResult;
  } catch (err) {}
  
  // Default AI chat
  try {
    const response = await ai.chat(text);
    return stripAiTells(response) || "Hehe, sawa.";
  } catch (err) {
    const fallbacks = ["Network slow", "Try again", "Sema tena"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

async function route(jid, text, isStatus = false) {
  if (!text && !isStatus) return null;
  
  // Check if this is a girlfriend number - stay silent
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) {
    console.log(`[route] Silent mode: Not replying to girlfriend number`);
    return null;
  }
  
  return await handleChat(text);
}

module.exports = { route, stripAiTells };
