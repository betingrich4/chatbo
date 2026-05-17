const { ai, downloads, music, imageGen, sports, games, news, quotes, davidApi } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;
const OWNER_NUMBER = process.env.OWNER_NUMBER || "254740007567";

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["254716065432", "+254716065432", "0716065432", "254708219667", "+254708219667"];

// Stop reply cache
const stopReplyCache = new Map();

// Force English mode
let forceEnglish = false;

// Detect language
function detectLanguage(text, lastWasSwahili = false) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("don't understand swahili") || lowerText.includes("not understand swahili")) {
    forceEnglish = true;
    return "english";
  }
  
  if (forceEnglish) return "english";
  
  const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo', 'nzuri', 'karibu', 'sema', 'niambie', 'rada', 'alaf', 'ssup', 'kiac', 'hehe'];
  
  const lower = text.toLowerCase();
  for (const word of swahiliWords) {
    if (lower === word || lower.startsWith(word + " ") || lower.endsWith(" " + word)) {
      return "swahili";
    }
  }
  
  if (lastWasSwahili) return "swahili";
  return "english";
}

// Check stop reply
function shouldStopReplying(text, jid) {
  const lower = text.toLowerCase().trim();
  if (lower === "ok" || lower === "sawa" || lower === "okay") {
    stopReplyCache.set(jid, Date.now());
    setTimeout(() => stopReplyCache.delete(jid), 3600000);
    return true;
  }
  return false;
}

function shouldReply(jid) {
  const lastStop = stopReplyCache.get(jid);
  if (lastStop && Date.now() - lastStop < 3600000) return false;
  stopReplyCache.delete(jid);
  return true;
}

// Build prompt
function buildPrompt(userText, history, language) {
  const persona = db.allPersona();
  const personaText = persona.length ? `\nPersonality notes: ${persona.join(". ")}` : "";
  
  const hist = history.slice(-6).map(m => 
    `${m.role === "user" ? "User" : "Marisel"}: ${m.content}`
  ).join("\n");
  
  const useEnglish = forceEnglish || language !== "swahili";
  
  if (useEnglish) {
    return `You are Marisel, a Kenyan guy. Reply ONLY in English. Never use Swahili words. Never say "as an AI" or "how can I help". Reply directly and naturally.

Give accurate, up-to-date information. For sports results, news, or current events, use your knowledge.

${personaText}

History:
${hist}

User: ${userText}
Marisel (short English reply):`;
  } else {
    return `Wewe ni Marisel, Mkenya. Jibu fupi kwa Kiswahili.${personaText}

Historia:
${hist}

User: ${userText}
Marisel:`;
  }
}

// Clean response
function cleanResponse(text, language) {
  if (!text) return null;
  
  let cleaned = text;
  
  const removePatterns = [
    /I am (an|an AI|Perplexity|ChatGPT|assistant|bot|language model)/gi,
    /I'm (an|an AI|assistant|bot)/gi, /as an AI/gi, /How can I help/gi,
    /What can I help/gi, /Is there anything/gi, /Feel free/gi,
    /I'd be happy/gi, /Let me know/gi, /you can ask me/gi,
  ];
  for (const re of removePatterns) cleaned = cleaned.replace(re, "");
  
  if (cleaned.toLowerCase().includes("niambie") && cleaned.length > 10) {
    cleaned = cleaned.replace(/niambie/gi, "");
  }
  
  const justNiambie = /^(niambie|what do you want to know|say|tell me|how can i)/i.test(cleaned.trim());
  if (justNiambie && cleaned.length < 30) {
    return "I'm not sure. Can you rephrase?";
  }
  
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  if (sentences.length > 2) cleaned = sentences.slice(0, 2).join(" ");
  if (cleaned.length > 200) cleaned = cleaned.substring(0, 200);
  
  cleaned = cleaned.trim();
  
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = ["Ok", "Cool", "Nice", "Got it", "I see"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  return cleaned;
}

// Quick replies
function quickReply(text, language) {
  const lower = text.toLowerCase().trim();
  
  if (lower.includes("don't understand swahili")) {
    return "Got it! I'll only use English from now on.";
  }
  
  if (lower === "hello" || lower === "hi" || lower === "hey" || lower === "hallo") {
    return "Hey";
  }
  
  if (lower === "how are you") {
    return "I'm good, thanks! You?";
  }
  
  if (lower === "what's up" || lower === "sup" || lower === "ssup") {
    return "Not much. What about you?";
  }
  
  if (lower.includes("thank")) {
    return "You're welcome!";
  }
  
  if (lower.includes("who are you") || lower === "what's your name") {
    return "I'm Marisel. Nice to meet you!";
  }
  
  if (language === "swahili") {
    if (lower === "sasa" || lower === "vipi" || lower === "niaje") return "Poa";
    if (lower === "habari") return "Nzuri";
    if (lower === "asante") return "Karibu";
  }
  
  return null;
}

// ==================== AUTO DOWNLOAD - DETECT ANY LINK ====================

async function handleAutoDownload(text) {
  // Extract any URL from the message
  const urlMatch = text.match(URL_RE);
  if (!urlMatch) return null;
  
  const url = urlMatch[1];
  const lower = text.toLowerCase();
  
  console.log(`[download] Detected URL: ${url}`);
  
  // Check if message contains "download" or just send link - either way, download
  const wantsDownload = lower.includes("download") || lower.includes("down") || lower.includes("get") || lower.includes("save");
  
  try {
    // FACEBOOK DOWNLOAD
    if (url.includes("facebook.com") || url.includes("fb.com") || url.includes("fb.watch") || url.includes("share")) {
      console.log(`[download] Facebook detected, fetching...`);
      const preferHD = lower.includes("hd");
      const downloadUrl = await downloads.facebook(url, preferHD);
      if (downloadUrl && downloadUrl.startsWith("http")) {
        console.log(`[download] Facebook success: ${downloadUrl.substring(0, 50)}...`);
        return downloadUrl;
      }
      return "Facebook download failed. The video might be private.";
    }
    
    // INSTAGRAM DOWNLOAD
    if (url.includes("instagram.com") || url.includes("instagr.am") || url.includes("reel")) {
      console.log(`[download] Instagram detected, fetching...`);
      const downloadUrl = await downloads.instagram(url);
      if (downloadUrl && downloadUrl.startsWith("http")) {
        console.log(`[download] Instagram success`);
        return downloadUrl;
      }
      return "Instagram download failed. The reel might be private.";
    }
    
    // TIKTOK DOWNLOAD
    if (url.includes("tiktok.com")) {
      console.log(`[download] TikTok detected, fetching...`);
      const downloadUrl = await downloads.tiktok(url);
      if (downloadUrl && downloadUrl.startsWith("http")) {
        console.log(`[download] TikTok success`);
        return downloadUrl;
      }
      return "TikTok download failed.";
    }
    
    // TWITTER/X DOWNLOAD
    if (url.includes("twitter.com") || url.includes("x.com")) {
      console.log(`[download] Twitter detected, fetching...`);
      const downloadUrl = await downloads.twitter(url);
      if (downloadUrl && downloadUrl.startsWith("http")) {
        console.log(`[download] Twitter success`);
        return downloadUrl;
      }
      return "Twitter download failed.";
    }
    
    // YOUTUBE MP3
    if ((url.includes("youtube.com") || url.includes("youtu.be")) && (lower.includes("mp3") || lower.includes("audio"))) {
      console.log(`[download] YouTube MP3 detected, fetching...`);
      const downloadUrl = await downloads.youtubeMp3(url);
      if (downloadUrl && downloadUrl.startsWith("http")) {
        console.log(`[download] YouTube MP3 success`);
        return downloadUrl;
      }
      return "YouTube MP3 download failed.";
    }
    
    // If it's a link but not a supported platform, just return null (let AI handle it)
    console.log(`[download] Unsupported platform or not a download request`);
    return null;
    
  } catch (err) {
    console.error(`[download] Error:`, err.message);
    return "Download failed. Try again later.";
  }
}

// Handle music
async function handleMusic(text) {
  const match = text.match(/play\s+(.+)/i);
  if (!match) return null;
  return await music.play(match[1]);
}

// Handle image generation
async function handleImageGen(text) {
  const match = text.match(/(?:generate|create|make)\s+(?:image|picture|photo)\s+(?:of\s+)?(.+)/i);
  if (!match) return null;
  const imageUrl = await imageGen.fluxv2(match[1]);
  if (imageUrl) return { image: imageUrl, caption: "Here it is" };
  return null;
}

// Use Perplexity for accurate info
async function getAccurateInfo(question) {
  try {
    const result = await davidApi.perplexity(question);
    if (result && result.length > 5) {
      let cleaned = result;
      const removePhrases = [
        /I am (Perplexity|an AI|an AI assistant)/gi,
        /According to my knowledge/gi,
        /Based on my search/gi,
      ];
      for (const phrase of removePhrases) {
        cleaned = cleaned.replace(phrase, "");
      }
      const shortAnswer = cleaned.split(/[.!?]/)[0] + ".";
      return shortAnswer.length > 200 ? shortAnswer.substring(0, 200) : shortAnswer;
    }
  } catch (err) {}
  return null;
}

// Handle football questions
async function handleFootballQuestion(text) {
  const lower = text.toLowerCase();
  const footballKeywords = ['manchester city', 'man city', 'arsenal', 'chelsea', 'liverpool', 'united', 'epl', 'premier league', 'fa cup', 'champions league', 'uefa', 'match', 'score', 'won', 'lost', 'played against'];
  
  const isFootball = footballKeywords.some(k => lower.includes(k));
  if (!isFootball) return null;
  
  const accurateAnswer = await getAccurateInfo(text);
  if (accurateAnswer) return accurateAnswer;
  return null;
}

// Handle current events
async function handleCurrentEvents(text) {
  const lower = text.toLowerCase();
  const currentKeywords = ['news', 'today', 'latest', 'current', 'yesterday', 'last night', 'happened'];
  
  const isCurrent = currentKeywords.some(k => lower.includes(k));
  if (isCurrent) {
    const accurateAnswer = await getAccurateInfo(text);
    if (accurateAnswer) return accurateAnswer;
  }
  return null;
}

// Games list
const GAMES_LIST = [
  { name: "20 Questions", cmd: "20q" },
  { name: "Word Association", cmd: "word" },
  { name: "Guess the Number", cmd: "guess" },
  { name: "Rock Paper Scissors", cmd: "rps" }
];

function handleGameCommand(text) {
  const lower = text.toLowerCase().trim();
  
  if (lower === "game" || lower === "games" || lower === "play a game") {
    let list = "Games:\n";
    for (let i = 0; i < GAMES_LIST.length; i++) {
      list += `${i+1}. ${GAMES_LIST[i].name}\n`;
    }
    return list;
  }
  
  for (let i = 0; i < GAMES_LIST.length; i++) {
    if (lower.includes(GAMES_LIST[i].name.toLowerCase()) || lower === `${i+1}`) {
      const starts = { "20q": "Think of something. Ask yes/no questions.", "word": "Say a word.", "guess": "Pick a number 1-100.", "rps": "Choose rock, paper, or scissors." };
      return `Playing ${GAMES_LIST[i].name}. ${starts[GAMES_LIST[i].cmd] || "Ready!"}`;
    }
  }
  return null;
}

// Handle sports scores
async function handleSports(text, language) {
  const lower = text.toLowerCase();
  
  try {
    if (lower.includes("live score") || lower.includes("scores")) {
      const result = await sports.liveScores();
      if (Array.isArray(result) && result.length) {
        return result.slice(0, 5).map(m => `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`).join("\n");
      }
      return null;
    }
    if (lower.includes("standings") || lower.includes("table")) {
      const result = await sports.soccerStandings();
      if (Array.isArray(result) && result.length) {
        return result.slice(0, 10).map((t, i) => `${i+1}. ${t.name} (${t.points})`).join("\n");
      }
      return null;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Main chat handler
async function handleChat(jid, text, language) {
  // ========== STEP 1: AUTO DOWNLOAD ANY LINK ==========
  // This runs FIRST - if there's a link, download it immediately
  const downloadResult = await handleAutoDownload(text);
  if (downloadResult) {
    // If it's a download URL, return it directly
    if (downloadResult.startsWith("http")) {
      return downloadResult;
    }
    // If it's an error message about download
    if (downloadResult.includes("failed") || downloadResult.includes("private")) {
      return downloadResult;
    }
  }
  
  // Quick reply
  const quick = quickReply(text, language);
  if (quick) return quick;
  
  // Music
  const musicResult = await handleMusic(text);
  if (musicResult) return musicResult;
  
  // Image generate
  const imageGenResult = await handleImageGen(text);
  if (imageGenResult) return imageGenResult;
  
  // Games
  const game = handleGameCommand(text);
  if (game) return game;
  
  // Sports scores from API
  const sportsResult = await handleSports(text, language);
  if (sportsResult) return sportsResult;
  
  // Football questions (accurate info)
  const footballAnswer = await handleFootballQuestion(text);
  if (footballAnswer) return footballAnswer;
  
  // Current events
  const currentAnswer = await handleCurrentEvents(text);
  if (currentAnswer) return currentAnswer;
  
  // AI chat
  try {
    const history = db.recentMsgs(jid, 6);
    const prompt = buildPrompt(text, history, language);
    
    let response = await ai.smartChat(prompt);
    if (!response || response.length < 3) response = await ai.chat(prompt);
    if (!response || response.length < 3) response = await davidApi.gemini(text);
    
    const cleaned = cleanResponse(response || "", language);
    if (cleaned) return cleaned;
    
    return "I'm not sure. Can you rephrase?";
  } catch (err) {
    console.error("[chat] Error:", err.message);
    return "I'm not sure. Can you rephrase?";
  }
}

// Main route
async function route(jid, text, isOwner = false, lastLanguage = "english") {
  if (!text) return null;
  
  // Silent for girlfriends
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) return null;
  
  // Check stop reply
  if (shouldStopReplying(text, jid)) return null;
  if (!shouldReply(jid)) return null;
  
  // Detect language
  const language = detectLanguage(text, lastLanguage === "swahili");
  
  return await handleChat(jid, text, language);
}

module.exports = { route };
