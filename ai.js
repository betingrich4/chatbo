const { ai, downloads, music, imageGen, sports, games, news, quotes } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;
const OWNER_NUMBER = process.env.OWNER_NUMBER || "254740007567";

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["254716065432", "+254716065432", "0716065432", "254708219667", "+254708219667"];

// Stop reply cache
const stopReplyCache = new Map();

// Detect language
function detectLanguage(text, lastWasSwahili = false) {
  const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo', 'nzuri', 'karibu', 'sema', 'niambie', 'rada', 'alaf', 'ssup', 'kiac', 'hehe'];
  const lower = text.toLowerCase();
  for (const word of swahiliWords) {
    if (lower.includes(word)) return "swahili";
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

// Build prompt with persona
function buildPrompt(userText, history, language) {
  const persona = db.allPersona();
  const personaText = persona.length ? `\nPersonality notes: ${persona.join(". ")}` : "";
  
  const hist = history.slice(-6).map(m => 
    `${m.role === "user" ? "User" : "Marisel"}: ${m.content}`
  ).join("\n");
  
  if (language === "swahili") {
    return `Wewe ni Marisel, Mkenya. Jibu fupi sana.${personaText}

Historia:
${hist}

User: ${userText}
Marisel:`;
  } else {
    return `You are Marisel, a Kenyan guy. Reply very short. Never say "as an AI" or "how can I help". Say "niambie" instead.${personaText}

History:
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
  ];
  for (const re of removePatterns) cleaned = cleaned.replace(re, "");
  
  cleaned = cleaned.replace(/How can I (help|assist) you/gi, "Niambie");
  
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  if (sentences.length > 2) cleaned = sentences.slice(0, 2).join(" ");
  if (cleaned.length > 150) cleaned = cleaned.substring(0, 150);
  
  cleaned = cleaned.trim();
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = language === "swahili" ? ["Sawa", "Hehe", "Mmmh", "Vipi"] : ["Ok", "Cool", "Nice", "Got it"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  return cleaned;
}

// Quick replies
function quickReply(text, language) {
  const lower = text.toLowerCase().trim();
  
  if (lower === "hello" || lower === "hi" || lower === "hey") {
    return language === "swahili" ? "Sasa" : "Hey";
  }
  if (lower === "hallo") return language === "swahili" ? "Sasa" : "Hey";
  if (lower === "sasa" || lower === "vipi" || lower === "niaje") return "Poa";
  if (lower === "habari") return "Nzuri";
  if (lower.includes("thank") || lower === "asante") return language === "swahili" ? "Karibu" : "Welcome";
  if (lower.includes("who are you") || lower === "wewe ni nani") return language === "swahili" ? "Mi ni Marisel" : "I'm Marisel";
  if (lower.includes("what's up") || lower === "sup" || lower === "ssup") return "Not much. You?";
  return null;
}

// Handle downloads
async function handleDownload(text) {
  const urlMatch = text.match(URL_RE);
  if (!urlMatch) return null;
  const url = urlMatch[1];
  const lower = text.toLowerCase();
  
  try {
    if (url.includes("facebook.com") || url.includes("fb.com")) {
      const preferHD = lower.includes("hd");
      return await downloads.facebook(url, preferHD);
    }
    if (url.includes("instagram.com")) {
      return await downloads.instagram(url);
    }
    if (url.includes("tiktok.com")) {
      return await downloads.tiktok(url);
    }
    if (url.includes("twitter.com") || url.includes("x.com")) {
      return await downloads.twitter(url);
    }
    if (lower.includes("mp3") || lower.includes("audio")) {
      return await downloads.youtubeMp3(url);
    }
  } catch (err) {
    return null;
  }
  return null;
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

// Handle image edit
async function handleImageEdit(text) {
  const urlMatch = text.match(URL_RE);
  if (!urlMatch) return null;
  const promptMatch = text.match(/(?:edit|change|make)\s+(.+)/i);
  if (!promptMatch) return null;
  const editedUrl = await imageGen.nanobanana2(urlMatch[1], promptMatch[1]);
  if (editedUrl) return { image: editedUrl, caption: "Done" };
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

// Handle current info with Perplexity
async function handleCurrentInfo(text, language) {
  const lower = text.toLowerCase();
  const currentKeywords = ['news', 'today', 'latest', 'current', 'score', 'match', 'weather'];
  if (!currentKeywords.some(k => lower.includes(k))) return null;
  
  try {
    const result = await davidApi.perplexity(text);
    if (result) {
      const firstSentence = result.split(/[.!?]/)[0];
      return firstSentence.substring(0, 150);
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Handle sports
async function handleSports(text, language) {
  const lower = text.toLowerCase();
  
  try {
    if (lower.includes("live score") || lower.includes("scores")) {
      const result = await sports.liveScores();
      if (Array.isArray(result) && result.length) {
        return result.slice(0, 5).map(m => `${m.home} ${m.homeScore}-${m.awayScore} ${m.away}`).join("\n");
      }
      return language === "swahili" ? "Hakuna live scores" : "No live scores";
    }
    if (lower.includes("standings") || lower.includes("table")) {
      const result = await sports.soccerStandings();
      if (Array.isArray(result) && result.length) {
        return result.slice(0, 10).map((t, i) => `${i+1}. ${t.name} (${t.points})`).join("\n");
      }
      return language === "swahili" ? "Standings haipo" : "Standings not available";
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Main chat handler
async function handleChat(jid, text, language) {
  // Quick reply
  const quick = quickReply(text, language);
  if (quick) return quick;
  
  // Download
  const download = await handleDownload(text);
  if (download) return download;
  
  // Music
  const musicResult = await handleMusic(text);
  if (musicResult) return musicResult;
  
  // Image generate
  const imageGenResult = await handleImageGen(text);
  if (imageGenResult) return imageGenResult;
  
  // Image edit
  const imageEditResult = await handleImageEdit(text);
  if (imageEditResult) return imageEditResult;
  
  // Games
  const game = handleGameCommand(text);
  if (game) return game;
  
  // Sports
  const sportsResult = await handleSports(text, language);
  if (sportsResult) return sportsResult;
  
  // Current info
  const currentInfo = await handleCurrentInfo(text, language);
  if (currentInfo) return currentInfo;
  
  // AI chat
  try {
    const history = db.recentMsgs(jid, 6);
    const prompt = buildPrompt(text, history, language);
    let response = await ai.smartChat(prompt);
    if (!response || response.length < 3) response = await ai.chat(prompt);
    const cleaned = cleanResponse(response || "", language);
    if (cleaned) return cleaned;
    return language === "swahili" ? "Sawa" : "Ok";
  } catch (err) {
    return language === "swahili" ? "Sawa" : "Ok";
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
