const { ai, downloads, music, imageGen, sports, games, news, quotes, davidApi } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;
const OWNER_NUMBER = process.env.OWNER_NUMBER || "254740007567";

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["254716065432", "+254716065432", "0716065432", "254708219667", "+254708219667"];

// Stop reply cache
const stopReplyCache = new Map();

// Force English mode - user said they don't understand Swahili
let forceEnglish = false;

// Detect language - ONLY use Swahili if user used Swahili AND never forced English
function detectLanguage(text, lastWasSwahili = false) {
  // If user explicitly said they don't understand Swahili, force English
  const lowerText = text.toLowerCase();
  if (lowerText.includes("don't understand swahili") || lowerText.includes("not understand swahili") || lowerText === "i don't understand swahili") {
    forceEnglish = true;
    return "english";
  }
  
  // If forceEnglish is true, always return English
  if (forceEnglish) return "english";
  
  const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo', 'nzuri', 'karibu', 'sema', 'niambie', 'rada', 'alaf', 'ssup', 'kiac', 'hehe', 'bana', 'fiti', 'fresh'];
  
  const lower = text.toLowerCase();
  for (const word of swahiliWords) {
    if (lower === word || lower.startsWith(word + " ") || lower.endsWith(" " + word) || lower.includes(" " + word + " ")) {
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

// Build prompt with persona - FORCE ENGLISH if needed
function buildPrompt(userText, history, language) {
  const persona = db.allPersona();
  const personaText = persona.length ? `\nPersonality notes: ${persona.join(". ")}` : "";
  
  const hist = history.slice(-6).map(m => 
    `${m.role === "user" ? "User" : "Marisel"}: ${m.content}`
  ).join("\n");
  
  // ALWAYS use English if forceEnglish is true OR language is english
  const useEnglish = forceEnglish || language !== "swahili";
  
  if (useEnglish) {
    return `You are Marisel, a Kenyan guy. Reply ONLY in English. Never use Swahili words. Never say "as an AI" or "how can I help" or "niambie". Reply directly and naturally.

IMPORTANT: Give accurate, up-to-date information. For sports results, news, or current events, use your knowledge.

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

// Clean response - remove AI talk and "niambie" spam
function cleanResponse(text, language) {
  if (!text) return null;
  
  let cleaned = text;
  
  // Remove AI phrases
  const removePatterns = [
    /I am (an|an AI|Perplexity|ChatGPT|assistant|bot|language model)/gi,
    /I'm (an|an AI|assistant|bot)/gi, /as an AI/gi, /How can I help/gi,
    /What can I help/gi, /Is there anything/gi, /Feel free/gi,
    /I'd be happy/gi, /Let me know/gi, /you can ask me/gi, /I'm here to/gi,
  ];
  for (const re of removePatterns) cleaned = cleaned.replace(re, "");
  
  // Remove excessive "niambie" - only keep if it's the ONLY word
  if (cleaned.toLowerCase().includes("niambie") && cleaned.length > 10) {
    cleaned = cleaned.replace(/niambie/gi, "");
  }
  
  // If response is just "Niambie" or similar, replace with something better
  const justNiambie = /^(niambie|what do you want to know|say|tell me|how can i)/i.test(cleaned.trim());
  if (justNiambie && cleaned.length < 30) {
    return "I'm not sure. Can you rephrase?";
  }
  
  // Keep only 1-2 sentences
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  if (sentences.length > 2) cleaned = sentences.slice(0, 2).join(" ");
  if (cleaned.length > 200) cleaned = cleaned.substring(0, 200);
  
  cleaned = cleaned.trim();
  
  // Final fallback
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = ["Ok", "Cool", "Nice", "Got it", "I see"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  return cleaned;
}

// Quick replies - ENGLISH ONLY unless Swahili forced
function quickReply(text, language) {
  const lower = text.toLowerCase().trim();
  
  // If user said they don't understand Swahili, force English replies
  if (lower.includes("don't understand swahili") || lower.includes("not understand swahili")) {
    return "Got it! I'll only use English from now on.";
  }
  
  // English greetings
  if (lower === "hello" || lower === "hi" || lower === "hey" || lower === "hallo") {
    return "Hey";
  }
  
  if (lower === "how are you" || lower === "how are you doing") {
    return "I'm good, thanks! You?";
  }
  
  if (lower === "what's up" || lower === "sup" || lower === "ssup") {
    return "Not much. What about you?";
  }
  
  // Thank you
  if (lower.includes("thank") || lower === "thanks") {
    return "You're welcome!";
  }
  
  // Who are you
  if (lower.includes("who are you") || lower === "what's your name") {
    return "I'm Marisel. Nice to meet you!";
  }
  
  // Swahili greetings (only if user used Swahili)
  if (language === "swahili") {
    if (lower === "sasa" || lower === "vipi" || lower === "niaje") return "Poa";
    if (lower === "habari") return "Nzuri";
    if (lower === "asante") return "Karibu";
  }
  
  return null;
}

// Use Perplexity for accurate, up-to-date information (sports, news, current events)
async function getAccurateInfo(question) {
  try {
    // Use Perplexity API for current/accurate info
    const result = await davidApi.perplexity(question);
    if (result && result.length > 5) {
      // Clean the response - remove Perplexity's self-intro
      let cleaned = result;
      const removePhrases = [
        /I am (Perplexity|an AI|an AI assistant)/gi,
        /According to my knowledge/gi,
        /Based on my search/gi,
        /I found that/gi,
      ];
      for (const phrase of removePhrases) {
        cleaned = cleaned.replace(phrase, "");
      }
      return cleaned.trim();
    }
  } catch (err) {
    console.log("[perplexity] Error:", err.message);
  }
  return null;
}

// Handle football/sports questions specifically
async function handleFootballQuestion(text) {
  const lower = text.toLowerCase();
  
  // Detect football-related questions
  const footballKeywords = ['manchester city', 'man city', 'city', 'arsenal', 'chelsea', 'liverpool', 'united', 'man united', 'epl', 'premier league', 'fa cup', 'champions league', 'ucl', 'uefa', 'match', 'game', 'score', 'won', 'lost', 'played against', 'fixture', 'result'];
  
  const isFootball = footballKeywords.some(k => lower.includes(k));
  if (!isFootball) return null;
  
  // Use Perplexity for accurate football info
  const accurateAnswer = await getAccurateInfo(text);
  if (accurateAnswer) {
    // Keep it short
    const shortAnswer = accurateAnswer.split(/[.!?]/)[0] + ".";
    return shortAnswer;
  }
  
  return null;
}

// Handle current events/news
async function handleCurrentEvents(text) {
  const lower = text.toLowerCase();
  
  const currentKeywords = ['news', 'today', 'latest', 'current', 'yesterday', 'last night', 'this week', 'happened', 'going on', 'update'];
  const isCurrent = currentKeywords.some(k => lower.includes(k));
  
  if (isCurrent) {
    const accurateAnswer = await getAccurateInfo(text);
    if (accurateAnswer) {
      const shortAnswer = accurateAnswer.split(/[.!?]/)[0] + ".";
      return shortAnswer;
    }
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
  
  // Games
  const game = handleGameCommand(text);
  if (game) return game;
  
  // Sports scores from API
  const sportsResult = await handleSports(text, language);
  if (sportsResult) return sportsResult;
  
  // FIRST: Try to get accurate info for football/sports questions
  const footballAnswer = await handleFootballQuestion(text);
  if (footballAnswer && footballAnswer.length > 5) {
    return footballAnswer;
  }
  
  // SECOND: Try current events
  const currentAnswer = await handleCurrentEvents(text);
  if (currentAnswer && currentAnswer.length > 5) {
    return currentAnswer;
  }
  
  // THIRD: Use AI chat with smart fallback
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
