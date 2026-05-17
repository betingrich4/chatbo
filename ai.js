const { 
  ai, downloads, sports, games, news, quotes, 
  davidApi, giftedApi 
} = require("./apis");
const db = require("./db");
const axios = require("axios");
const FormData = require("form-data");

const URL_RE = /(https?:\/\/[^\s]+)/i;
const OWNER_NUMBER = process.env.OWNER_NUMBER || "254740007567";

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["254716065432", "+254716065432", "0716065432", "254708219667", "+254708219667"];

// Track if user said ok/sawa - stop replying
const stopReplyCache = new Map();

// Detect language - ONLY Swahili if user used Swahili
function detectLanguage(text, lastMessageWasSwahili = false) {
  const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo', 'nzuri', 'karibu', 'sema', 'niambie', 'rada', 'alaf', 'ssup', 'kiac', 'hehe', 'bana', 'fiti', 'fresh', 'hapo', 'safi'];
  
  const lower = text.toLowerCase();
  for (const word of swahiliWords) {
    if (lower.includes(word)) return "swahili";
  }
  
  // If last message was Swahili, continue in Swahili
  if (lastMessageWasSwahili) return "swahili";
  
  return "english";
}

// Check if user wants to stop replying
function shouldStopReplying(text, jid) {
  const lower = text.toLowerCase().trim();
  if (lower === "ok" || lower === "sawa" || lower === "okay") {
    stopReplyCache.set(jid, Date.now());
    // Auto clear after 1 hour
    setTimeout(() => stopReplyCache.delete(jid), 3600000);
    return true;
  }
  return false;
}

// Check if we should reply
function shouldReply(jid) {
  const lastStop = stopReplyCache.get(jid);
  if (lastStop) {
    // If they said ok/sawa within last hour, don't reply
    if (Date.now() - lastStop < 3600000) {
      return false;
    }
    stopReplyCache.delete(jid);
  }
  return true;
}

// Clean response - keep VERY short
function cleanResponse(text, language) {
  if (!text) return null;
  
  let cleaned = text;
  
  // Remove AI phrases completely
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
    /As a (human|friend)/gi,
    /I don't have (personal|feelings)/gi,
  ];
  
  for (const re of removePatterns) {
    cleaned = cleaned.replace(re, "");
  }
  
  // Keep only 1-2 sentences
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  if (sentences.length > 2) {
    cleaned = sentences.slice(0, 2).join(" ");
  }
  
  // Hard limit 150 chars
  if (cleaned.length > 150) {
    cleaned = cleaned.substring(0, 150);
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > 30) cleaned = cleaned.substring(0, lastPeriod + 1);
  }
  
  cleaned = cleaned.trim();
  
  // Fallback
  if (!cleaned || cleaned.length < 2) {
    const fallbacks = language === "swahili" 
      ? ["Sawa", "Hehe", "Mmmh", "Vipi"]
      : ["Ok", "Cool", "Nice", "Got it"];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
  
  return cleaned;
}

// Quick replies - English by default
function quickReply(text, language) {
  const lower = text.toLowerCase().trim();
  
  // Greetings - short and natural
  if (lower === "hello" || lower === "hi" || lower === "hey") {
    return language === "swahili" ? "Sasa" : "Hey";
  }
  
  if (lower === "hallo") {
    return language === "swahili" ? "Sasa" : "Hey";
  }
  
  if (lower === "sasa" || lower === "vipi" || lower === "niaje") {
    return "Poa";
  }
  
  if (lower === "habari") {
    return "Nzuri";
  }
  
  // Thank you
  if (lower.includes("thank") || lower === "asante") {
    return language === "swahili" ? "Karibu" : "Welcome";
  }
  
  // Who are you
  if (lower.includes("who are you") || lower === "wewe ni nani") {
    return language === "swahili" ? "Mi ni Marisel" : "I'm Marisel";
  }
  
  // What's up
  if (lower.includes("what's up") || lower === "sup" || lower === "ssup") {
    return "Not much. You?";
  }
  
  return null;
}

// Handle download - Facebook, Instagram, TikTok, Twitter
async function handleDownload(text) {
  const urlMatch = text.match(URL_RE);
  if (!urlMatch) return null;
  const url = urlMatch[1];
  const lower = text.toLowerCase();
  
  try {
    // Facebook download
    if (url.includes("facebook.com") || url.includes("fb.com")) {
      const prefersHD = lower.includes("hd");
      const apiUrl = `https://apis.davidcyril.name.ng/facebook?url=${encodeURIComponent(url)}`;
      const result = await getFast(apiUrl);
      const sdLink = result?.sd || result?.download_url || result?.url;
      const hdLink = result?.hd || result?.hd_url;
      const link = prefersHD && hdLink ? hdLink : sdLink;
      if (link) return link;
    }
    
    // Instagram download
    if (url.includes("instagram.com") || url.includes("instagr.am")) {
      const apiUrl = `https://apis.davidcyril.name.ng/download/instagram?url=${encodeURIComponent(url)}`;
      const result = await getFast(apiUrl);
      const link = result?.downloadUrl || result?.url || result?.result;
      if (link) return link;
    }
    
    // TikTok download
    if (url.includes("tiktok.com")) {
      const apiUrl = `https://apis.davidcyril.name.ng/download/tiktok?url=${encodeURIComponent(url)}`;
      const result = await getFast(apiUrl);
      const link = result?.downloadUrl || result?.url || result?.result;
      if (link) return link;
    }
    
    // Twitter/X download
    if (url.includes("twitter.com") || url.includes("x.com")) {
      const apiUrl = `https://apis.davidcyril.name.ng/twitter?url=${encodeURIComponent(url)}`;
      const result = await getFast(apiUrl);
      const link = result?.downloadUrl || result?.url || result?.result;
      if (link) return link;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Handle play music
async function handlePlayMusic(text) {
  const lower = text.toLowerCase();
  const match = text.match(/play\s+(.+)/i);
  if (!match) return null;
  
  const query = encodeURIComponent(match[1]);
  try {
    const url = `https://apis.davidcyril.name.ng/play?query=${query}`;
    const result = await getFast(url);
    const audioUrl = result?.url || result?.downloadUrl || result?.result;
    if (audioUrl) return audioUrl;
  } catch (err) {
    return null;
  }
  return null;
}

// Handle generate image using fluxv2
async function handleGenerateImage(text) {
  const lower = text.toLowerCase();
  const match = text.match(/(?:generate|create|make)\s+(?:image|picture|photo)\s+(?:of\s+)?(.+)/i);
  if (!match) return null;
  
  const prompt = encodeURIComponent(match[1]);
  try {
    const url = `https://apis.davidcyril.name.ng/fluxv2?prompt=${prompt}`;
    const result = await getFast(url);
    const imageUrl = result?.url || result?.image_url || result?.result;
    if (imageUrl) return { image: imageUrl, caption: "Here it is" };
  } catch (err) {
    return null;
  }
  return null;
}

// Handle edit image using nanobanana2
async function handleEditImage(text) {
  const urlMatch = text.match(URL_RE);
  if (!urlMatch) return null;
  
  const imageUrl = urlMatch[1];
  const promptMatch = text.match(/(?:edit|change|make)\s+(.+)/i);
  if (!promptMatch) return null;
  
  const prompt = encodeURIComponent(promptMatch[1]);
  try {
    const url = `https://apis.davidcyril.name.ng/nanobanana2?url=${encodeURIComponent(imageUrl)}&prompt=${prompt}`;
    const result = await getFast(url);
    const editedUrl = result?.url || result?.image_url || result?.result;
    if (editedUrl) return { image: editedUrl, caption: "Done" };
  } catch (err) {
    return null;
  }
  return null;
}

// Games list
const GAMES_LIST = [
  { name: "20 Questions", cmd: "20q" },
  { name: "Word Association", cmd: "word" },
  { name: "Guess the Number", cmd: "guess" },
  { name: "Story Builder", cmd: "story" },
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
  
  // Handle game selection
  for (let i = 0; i < GAMES_LIST.length; i++) {
    if (lower.includes(GAMES_LIST[i].name.toLowerCase()) || 
        lower.includes(GAMES_LIST[i].cmd) ||
        (lower === `${i+1}`)) {
      return `Playing ${GAMES_LIST[i].name}. ${getGameStartMessage(GAMES_LIST[i].cmd)}`;
    }
  }
  
  return null;
}

function getGameStartMessage(game) {
  const messages = {
    "20q": "Think of something. Ask yes/no questions.",
    "word": "Say a word. I'll say the first thing that comes to mind.",
    "guess": "Pick a number between 1-100. I'll guess.",
    "story": "Give me a starting sentence.",
    "rps": "Choose rock, paper, or scissors."
  };
  return messages[game] || "Ready!";
}

// Handle current info using Perplexity (short answer)
async function handleCurrentInfo(text) {
  const lower = text.toLowerCase();
  
  // Keywords that need current info
  const currentKeywords = ['news', 'today', 'latest', 'current', 'score', 'match', 'weather', 'price', 'stock', 'election', 'results'];
  
  const needsCurrent = currentKeywords.some(k => lower.includes(k));
  if (!needsCurrent) return null;
  
  try {
    // Use Perplexity for current info
    const url = `https://apis.davidcyril.name.ng/ai/perplexity?text=${encodeURIComponent(text)}`;
    const result = await getFast(url);
    let answer = result?.response || result?.answer || result?.result || result?.text;
    
    if (answer) {
      // Force short answer - 1 sentence
      const firstSentence = answer.split(/[.!?]/)[0];
      return firstSentence.substring(0, 150);
    }
  } catch (err) {
    // Fallback to Gemini
    try {
      const url = `https://apis.davidcyril.name.ng/ai/gemini?text=${encodeURIComponent(text)}`;
      const result = await getFast(url);
      let answer = result?.response || result?.answer || result?.result;
      if (answer) {
        const firstSentence = answer.split(/[.!?]/)[0];
        return firstSentence.substring(0, 150);
      }
    } catch (e) {}
  }
  return null;
}

// General chat - use all APIs, short answers
async function handleChat(text, language) {
  try {
    // Use smartChat which tries all APIs
    let response = await ai.smartChat(text);
    
    if (!response || response.length < 3) {
      response = await ai.chat(text);
    }
    
    if (!response || response.length < 3) {
      // Try Gemini directly
      const url = `https://apis.davidcyril.name.ng/ai/gemini?text=${encodeURIComponent(text)}`;
      const result = await getFast(url);
      response = result?.response || result?.answer || result?.result;
    }
    
    const cleaned = cleanResponse(response || "", language);
    return cleaned;
    
  } catch (err) {
    return language === "swahili" ? "Sawa" : "Ok";
  }
}

// Helper for API calls
async function getFast(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, { timeout: 30000 });
      return res.data;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// Main route function
async function route(jid, text, isOwner = false, lastLanguage = "english") {
  if (!text) return null;
  
  // Silent for girlfriends
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) return null;
  
  // Check if user said ok/sawa - stop replying
  if (shouldStopReplying(text, jid)) return null;
  if (!shouldReply(jid)) return null;
  
  // Detect language - English by default, Swahili only if user used it
  const language = detectLanguage(text, lastLanguage === "swahili");
  
  // Quick reply for greetings
  const quick = quickReply(text, language);
  if (quick) return quick;
  
  // Download
  const download = await handleDownload(text);
  if (download) return download;
  
  // Play music
  const music = await handlePlayMusic(text);
  if (music) return music;
  
  // Generate image
  const image = await handleGenerateImage(text);
  if (image) return image;
  
  // Edit image
  const edited = await handleEditImage(text);
  if (edited) return edited;
  
  // Games
  const game = handleGameCommand(text);
  if (game) return game;
  
  // Current info (news, sports, etc) - use Perplexity
  const currentInfo = await handleCurrentInfo(text);
  if (currentInfo) return currentInfo;
  
  // General chat
  return await handleChat(text, language);
}

module.exports = { route };
