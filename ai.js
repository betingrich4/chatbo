const { ai, downloads, sports, games, news, quotes } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["254716065432", "+254716065432", "0716065432", "254708219667", "+254708219667"];

// KEYWORDS for function execution
const KEYWORDS = {
  // Sports
  SPORTS_LIVE: ['live score', 'scores', 'live scores', 'matokeo', 'current matches', 'today matches', 'live games'],
  SPORTS_STANDINGS: ['standings', 'table', 'msimamo', 'league table', 'epl table', 'premier league table', 'ranking', 'points'],
  SPORTS_FIXTURES: ['fixtures', 'upcoming matches', 'next matches', 'ratiba'],
  SPORTS_PLAYER: ['player', 'player stats', 'player information', 'who is', 'mchezaji'],
  SPORTS_TEAM: ['team', 'team stats', 'timu'],
  
  // Games
  GAME_DICE: ['dice', 'roll dice', 'roll d', 'kete', 'roll a die'],
  GAME_COIN: ['coin', 'flip coin', 'toss', 'sarafu'],
  GAME_JOKE: ['joke', 'utani', 'chesi', 'tell me a joke', 'funny', 'laugh'],
  GAME_TRUTH: ['truth', 'ukweli', 'truth or dare', 'truth question'],
  GAME_DARE: ['dare', 'changamoto', 'challenge'],
  GAME_8BALL: ['8ball', 'magic 8', '8 ball', 'ask the ball', 'mpira wa ajabu'],
  GAME_RPS: ['rock paper scissors', 'rps', 'jiwe karatasi makasi', 'play rps'],
  
  // Downloads
  DOWNLOAD_MP3: ['mp3', 'audio', 'download song', 'download music', 'sauti'],
  DOWNLOAD_INSTAGRAM: ['instagram', 'insta', 'ig download', 'reel'],
  DOWNLOAD_FACEBOOK: ['facebook', 'fb', 'fb video'],
  DOWNLOAD_TIKTOK: ['tiktok', 'tt', 'tik tok'],
  DOWNLOAD_TWITTER: ['twitter', 'x.com', 'tweet video'],
  
  // News
  NEWS_TRENDING: ['trending', 'trending news', 'trending now', 'popular'],
  NEWS_BBC: ['bbc', 'bbc news', 'bbc world'],
  NEWS_SPORTS: ['sports news', 'football news', 'epl news'],
  
  // Quotes
  QUOTE_RANDOM: ['quote', 'nukuu', 'wisdom', 'sayings'],
  QUOTE_INSPIRE: ['inspire', 'motivation', 'motivational', 'inspiring'],
  
  // Chat
  HELP: ['help', 'commands', 'what can you do', 'unaweza nini', 'function', 'capabilities'],
  GREETING: ['hello', 'hi', 'hey', 'hallo', 'sasa', 'vipi', 'niaje', 'habari', 'mambo', 'yo', 'sup', 'ssup'],
  THANK: ['thank', 'thanks', 'asante', 'thank you', 'thx'],
  HOW_ARE_YOU: ['how are you', 'how are you doing', 'uraje', 'uko aje', 'habari yako'],
  WHO_ARE_YOU: ['who are you', 'wewe ni nani', 'your name', 'jina lako', 'what is your name'],
};

// Detect language from user message - DON'T force Swahili
function detectLanguage(text) {
  const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo', 'nzuri', 'karibu', 'sema', 'niambie', 'rada', 'alaf', 'ssup', 'kiac', 'hehe', 'yoh', 'bana', 'fiti', 'fresh', 'hapo', 'safi', 'vyema', 'salama', 'shwari'];
  
  const lower = text.toLowerCase();
  let swahiliCount = 0;
  for (const word of swahiliWords) {
    if (lower.includes(word)) swahiliCount++;
  }
  
  // If message has Swahili words or is very short common greeting
  if (swahiliCount > 0 || ['sasa', 'vipi', 'niaje', 'habari', 'mambo', 'poa'].includes(lower)) {
    return "swahili";
  }
  return "english";
}

// Simple system prompt that matches user's language
function buildPrompt(userText, history, language) {
  const hist = history.slice(-6).map(m => 
    `${m.role === "user" ? "User" : "Marisel"}: ${m.content}`
  ).join("\n");
  
  if (language === "swahili") {
    return `Wewe ni Marisel, Mkenya. Jibu fupi kwa Kiswahili au Sheng. Usijitambulishe kama AI.

Historia:
${hist}

User: ${userText}
Marisel:`;
  } else {
    return `You are Marisel, a Kenyan guy. Reply short in English. Never say "as an AI" or "how can I help you". Say "niambie" instead.

History:
${hist}

User: ${userText}
Marisel:`;
  }
}

// Clean response - keep in user's language
function cleanResponse(text, originalMessage, language) {
  if (!text) return null;
  
  let cleaned = text;
  
  // Remove AI phrases
  const removePatterns = [
    /I am (an|an AI|Perplexity|ChatGPT|assistant|bot|language model)/gi,
    /I'm (an|an AI|assistant|bot|language model)/gi,
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
  
  // Keep it short - 2 sentences max
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  if (sentences.length > 2) {
    cleaned = sentences.slice(0, 2).join(" ");
  }
  
  // Length limit
  if (cleaned.length > 180) {
    cleaned = cleaned.substring(0, 180);
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > 40) cleaned = cleaned.substring(0, lastPeriod + 1);
  }
  
  cleaned = cleaned.trim();
  
  // Fallback
  if (!cleaned || cleaned.length < 2) {
    if (language === "swahili") {
      const fallbacks = ["Sawa", "Hehe", "Mmmh", "Vipi", "Pooh", "Rada"];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    } else {
      const fallbacks = ["Ok", "Sure", "Alright", "Cool", "Nice", "Got it"];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }
  
  return cleaned;
}

// Quick reply - matches user's language
function quickReply(text, language) {
  const lower = text.toLowerCase().trim();
  
  // Greetings
  if (KEYWORDS.GREETING.some(k => lower === k || lower.startsWith(k))) {
    if (language === "swahili") {
      const replies = ["Sasa", "Vipi", "Poa", "Rada", "Alaf"];
      return replies[Math.floor(Math.random() * replies.length)];
    } else {
      const replies = ["Hey", "Hi", "Yo", "Ssup", "Hey there"];
      return replies[Math.floor(Math.random() * replies.length)];
    }
  }
  
  // Thank you
  if (KEYWORDS.THANK.some(k => lower.includes(k))) {
    return language === "swahili" ? "Karibu" : "Welcome";
  }
  
  // How are you
  if (KEYWORDS.HOW_ARE_YOU.some(k => lower.includes(k))) {
    if (language === "swahili") {
      return "Poa, na wewe?";
    } else {
      return "I'm good, you?";
    }
  }
  
  // Who are you
  if (KEYWORDS.WHO_ARE_YOU.some(k => lower.includes(k))) {
    if (language === "swahili") {
      return "Mi ni Marisel. Na wewe nani?";
    } else {
      return "I'm Marisel. What's your name?";
    }
  }
  
  // Help
  if (KEYWORDS.HELP.some(k => lower.includes(k))) {
    if (language === "swahili") {
      return "Niambie. Naeza: download, games, live scores za EPL, news, quotes.";
    } else {
      return "Niambie. I can: download media, play games, show EPL live scores, news, quotes.";
    }
  }
  
  return null;
}

// Handle sports with language
async function handleSports(text, language) {
  const lower = text.toLowerCase();
  
  try {
    // Live scores
    if (KEYWORDS.SPORTS_LIVE.some(k => lower.includes(k))) {
      const result = await sports.liveScores();
      if (Array.isArray(result) && result.length) {
        const scores = result.slice(0, 5).map(m => 
          `${m.home || m.homeTeam} ${m.homeScore || 0}-${m.awayScore || 0} ${m.away || m.awayTeam}`
        ).join("\n");
        return scores;
      }
      return language === "swahili" ? "Hakuna live scores sasa" : "No live scores now";
    }
    
    // Standings
    if (KEYWORDS.SPORTS_STANDINGS.some(k => lower.includes(k))) {
      const result = await sports.soccerStandings();
      if (Array.isArray(result) && result.length) {
        const table = result.slice(0, 10).map((t, i) => 
          `${i+1}. ${t.name || t.team} (${t.points || 0})`
        ).join("\n");
        return `🏆 ${language === "swahili" ? "Msimamo wa EPL" : "EPL Standings"}\n${table}`;
      }
      return language === "swahili" ? "Standings haipo sasa" : "Standings not available";
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Handle games with language
async function handleGame(text, language) {
  const lower = text.toLowerCase();
  
  try {
    if (KEYWORDS.GAME_DICE.some(k => lower.includes(k))) {
      const sides = lower.includes("20") ? 20 : lower.includes("12") ? 12 : 6;
      const result = await games.rollDice(sides, 1);
      const value = result.result || result.value || result;
      return language === "swahili" ? `🎲 Umepata ${value}` : `🎲 You rolled ${value}`;
    }
    
    if (KEYWORDS.GAME_COIN.some(k => lower.includes(k))) {
      const result = await games.flipCoin();
      const value = result.result || result;
      const resultText = value === "Heads" ? (language === "swahili" ? "Kichwa" : "Heads") : (language === "swahili" ? "Kura" : "Tails");
      return language === "swahili" ? `🪙 ${resultText} imetoka` : `🪙 It's ${resultText}`;
    }
    
    if (KEYWORDS.GAME_JOKE.some(k => lower.includes(k))) {
      const result = await games.joke();
      if (result.joke) return result.joke;
      if (result.setup) return `${result.setup}\n${result.delivery || ""}`;
      return language === "swahili" ? "Hakuna joke sasa" : "No joke right now";
    }
    
    if (KEYWORDS.GAME_TRUTH.some(k => lower.includes(k))) {
      const result = await games.truth();
      return result.question || result.result || result;
    }
    
    if (KEYWORDS.GAME_DARE.some(k => lower.includes(k))) {
      const result = await games.dare();
      return result.challenge || result.result || result;
    }
    
    if (KEYWORDS.GAME_8BALL.some(k => lower.includes(k))) {
      const result = await games.eightBall("question");
      return `🔮 ${result.answer || result.result || result}`;
    }
  } catch (err) {
    return null;
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
    if (KEYWORDS.DOWNLOAD_MP3.some(k => lower.includes(k)) || lower.includes('youtube')) {
      const result = await downloads.youtubeMp3(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (KEYWORDS.DOWNLOAD_INSTAGRAM.some(k => lower.includes(k)) || url.includes('instagram.com')) {
      const result = await downloads.instagram(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (KEYWORDS.DOWNLOAD_FACEBOOK.some(k => lower.includes(k)) || url.includes('facebook.com')) {
      const result = await downloads.facebook(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Handle quotes with language
async function handleQuote(text, language) {
  const lower = text.toLowerCase();
  
  try {
    if (KEYWORDS.QUOTE_RANDOM.some(k => lower.includes(k))) {
      const result = await quotes.random();
      if (result.quote || result.text) {
        return `💬 "${result.quote || result.text}" - ${result.author || "Unknown"}`;
      }
      return null;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Main chat handler
async function handleChat(jid, text) {
  const language = detectLanguage(text);
  
  // Quick reply
  const quick = quickReply(text, language);
  if (quick) return quick;
  
  // Games
  const game = await handleGame(text, language);
  if (game) return game;
  
  // Sports
  const sportsResult = await handleSports(text, language);
  if (sportsResult) return sportsResult;
  
  // Downloads
  const download = await handleDownload(text);
  if (download) return download;
  
  // Quotes
  const quote = await handleQuote(text, language);
  if (quote) return quote;
  
  // AI Chat
  try {
    const history = db.recentMsgs(jid, 6);
    const prompt = buildPrompt(text, history, language);
    
    let response = await ai.smartChat(prompt);
    
    if (!response || response.length < 3) {
      response = await ai.chat(prompt);
    }
    
    if (!response || response.length < 3) {
      response = await ai.smartChat(text);
    }
    
    const cleaned = cleanResponse(response || "", text, language);
    if (cleaned) return cleaned;
    
    // Friendly fallback
    const fallbacks = language === "swahili" 
      ? ["Sawa", "Hehe", "Mmmh", "Vipi", "Niambie"]
      : ["Ok", "Sure", "Alright", "Got it", "Cool"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    
  } catch (err) {
    console.error("[chat] Error:", err.message);
    const fallbacks = language === "swahili"
      ? ["Sawa", "Hehe", "Mmmh", "Vipi"]
      : ["Ok", "Sure", "Alright", "Cool"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

async function route(jid, text, isOwner = false) {
  if (!text) return null;
  
  // Silent for girlfriends
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) {
    console.log(`[route] Silent mode for girlfriend: ${jid}`);
    return null;
  }
  
  const response = await handleChat(jid, text);
  
  // Filter errors
  if (response && (response.toLowerCase().includes("error") || 
                   response.toLowerCase().includes("fail") || 
                   response.toLowerCase().includes("network"))) {
    const friendly = ["Sawa", "Hehe", "Mmmh", "Vipi", "Niambie", "Rada", "Alaf", "Ssup", "Poa", "Ok", "Sure", "Cool"];
    return friendly[Math.floor(Math.random() * friendly.length)];
  }
  
  return response;
}

module.exports = { route, KEYWORDS };
