const { ai, downloads, sports, games, news, quotes } = require("./apis");
const db = require("./db");

const URL_RE = /(https?:\/\/[^\s]+)/i;

// Girlfriend numbers - bot stays silent
const GIRLFRIEND_NUMBERS = ["254716065432", "+254716065432", "0716065432", "254708219667", "+254708219667"];

// Language detection
function detectLanguage(text) {
  const swahiliWords = ['sasa', 'vipi', 'niaje', 'habari', 'asante', 'sawa', 'poa', 'mambo', 'nzuri', 'karibu', 'sema', 'niambie', 'rada', 'alaf', 'ssup', 'kiac', 'hehe', 'yoh', 'bana', 'mshale', 'fiti', 'fresh', 'chomoa', 'kaza', 'bamba', 'wacha', 'hapo', 'safi', 'vyema', 'salama', 'shwari', 'hamjambo', 'hatari', 'mzuka', 'kali', 'nonoka', 'piga', 'mwambie', 'kwangu', 'kwako', 'kwetu', 'huku', 'huko'];
  
  const lower = text.toLowerCase();
  for (const word of swahiliWords) {
    if (lower.includes(word)) return "swahili";
  }
  return "english";
}

// Build context with user's message
function buildPrompt(userText, history, language) {
  const hist = history.slice(-8).map(m => 
    `${m.role === "user" ? "👤" : "🤖"}: ${m.content}`
  ).join("\n");
  
  const langInstruction = language === "swahili" 
    ? "Jibu kwa Kiswahili au Sheng. Tumia maneno kama 'rada', 'alaf', 'ssup', 'kiac', 'niambie'."
    : "Reply in natural English, but can mix with Sheng casually.";
  
  return `Wewe ni Marisel, Mkenya real. Jibu fupi, moja kwa moja, kwenye context. ${langInstruction}

HISTORIA:
${hist}

👤: ${userText}
🤖:`;
}

// Clean AI response - remove AI talk, keep context
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
    /you can ask me/gi,
    /I'm here to/gi,
    /my purpose is/gi,
  ];
  
  for (const re of removePatterns) {
    cleaned = cleaned.replace(re, "");
  }
  
  // Replace help phrases
  cleaned = cleaned.replace(/How can I (help|assist) you/gi, "Niambie");
  cleaned = cleaned.replace(/What can I (help|assist) you with/gi, "Niambie");
  
  // Make sure response acknowledges the user's message
  const lowerOriginal = originalMessage.toLowerCase();
  const responseLower = cleaned.toLowerCase();
  
  // If user greeted and response doesn't acknowledge, add acknowledgment
  const greetings = ['sasa', 'vipi', 'niaje', 'habari', 'hello', 'hi', 'hey', 'hallo'];
  const isGreeting = greetings.some(g => lowerOriginal === g || lowerOriginal.startsWith(g));
  
  if (isGreeting && !responseLower.includes('sasa') && !responseLower.includes('vipi') && !responseLower.includes('poa')) {
    const shortAcks = ['Sasa', 'Vipi', 'Poa', 'Yo', 'Rada', 'Alaf'];
    const ack = shortAcks[Math.floor(Math.random() * shortAcks.length)];
    cleaned = `${ack}. ${cleaned}`;
  }
  
  // Limit length - short and sweet
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200);
    const lastPeriod = cleaned.lastIndexOf(".");
    if (lastPeriod > 50) cleaned = cleaned.substring(0, lastPeriod + 1);
  }
  
  cleaned = cleaned.trim();
  
  // Fallback if empty
  if (!cleaned || cleaned.length < 2) {
    if (language === "swahili") {
      const fallbacks = ["Sawa", "Hehe", "Mmmh", "Vipi", "Pooh", "Rada", "Alaf", "Ssup", "Niambie", "Kiac"];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    } else {
      const fallbacks = ["Ok", "Sure", "Alright", "Got it", "Cool", "Nice"];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  }
  
  return cleaned;
}

// Quick intelligent responses based on message content
function quickIntelligentReply(text, language) {
  const lower = text.toLowerCase().trim();
  
  // Greetings - reply to the specific greeting
  if (lower === "sasa" || lower === "sasa?" || lower === "sasa!") {
    const replies = ["Poa", "Poa yako?", "Poa sana", "Fresh", "Fiti"];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  
  if (lower === "vipi" || lower === "vipi?") {
    const replies = ["Poa", "Salama", "Fresh", "Fiti tu"];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  
  if (lower === "niaje" || lower === "niaje?") {
    return "Poa, na wewe?";
  }
  
  if (lower === "habari" || lower === "habari yako") {
    return "Nzuri, kwako?";
  }
  
  if (lower === "mambo" || lower === "mambo?") {
    return "Poa";
  }
  
  if (lower === "hello" || lower === "hi" || lower === "hey") {
    const replies = ["Sasa", "Vipi", "Yo", "Hey", "Ssup"];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  
  if (lower === "hallo") {
    return "Sasa";
  }
  
  // Short responses
  if (lower === "poa") {
    return "Sawa";
  }
  
  if (lower === "sawa") {
    return "Nzuri";
  }
  
  if (lower === "asante" || lower === "thank you" || lower === "thanks") {
    return "Karibu";
  }
  
  // Who are you
  if (lower.includes("wewe ni nani") || lower === "who are you" || lower === "what's your name") {
    return "Mi ni Marisel. Na wewe?";
  }
  
  // What can you do
  if (lower.includes("unaweza nini") || lower.includes("what can you do") || lower.includes("help")) {
    return "Niambie. Naeza download video/audio, games, live scores za EPL, news, quotes, na chat tu.";
  }
  
  // How are you
  if (lower.includes("how are you") || lower.includes("uraje") || lower.includes("uko aje")) {
    return "Poa. Na wewe uko aje?";
  }
  
  // What's up
  if (lower.includes("what's up") || lower.includes("sup") || lower === "ssup") {
    return "Poa tu. Niambie.";
  }
  
  return null;
}

// Handle games with contextual replies
async function handleGame(text, language) {
  const lower = text.toLowerCase();
  
  try {
    if (lower.includes("dice") || lower.includes("roll") || lower.includes("kete")) {
      const sides = lower.includes("20") ? 20 : lower.includes("12") ? 12 : 6;
      const result = await games.rollDice(sides, 1);
      const value = result.result || result.value || result;
      return `🎲 Umepata ${value}`;
    }
    
    if (lower.includes("coin") || lower.includes("flip") || lower.includes("sarafu")) {
      const result = await games.flipCoin();
      const value = result.result || result;
      return `🪙 ${value === "Heads" ? "Kichwa" : "Kura"} imetoka`;
    }
    
    if (lower.includes("joke") || lower.includes("utani") || lower.includes("chesi")) {
      const result = await games.joke();
      if (result.joke) return result.joke;
      if (result.setup) return `${result.setup} ${result.delivery || ""}`;
      return language === "swahili" ? "Hakuna joke sasa" : "No joke right now";
    }
    
    if (lower.includes("truth") || lower.includes("ukweli")) {
      const result = await games.truth();
      return result.question || result.result || result;
    }
    
    if (lower.includes("dare") || lower.includes("changamoto")) {
      const result = await games.dare();
      return result.challenge || result.result || result;
    }
    
    if (lower.includes("8ball") || lower.includes("magic")) {
      const result = await games.eightBall("question");
      return `🔮 ${result.answer || result.result || result}`;
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
    if (lower.includes("live score") || lower.includes("scores") || lower.includes("matokeo")) {
      const result = await sports.liveScores();
      if (Array.isArray(result) && result.length) {
        const scores = result.slice(0, 5).map(m => 
          `${m.home || m.homeTeam} ${m.homeScore || 0}-${m.awayScore || 0} ${m.away || m.awayTeam}`
        ).join("\n");
        return scores;
      }
      return language === "swahili" ? "Hakuna live scores sasa" : "No live scores now";
    }
    
    if (lower.includes("standings") || lower.includes("table") || lower.includes("msimamo")) {
      const result = await sports.soccerStandings();
      if (Array.isArray(result) && result.length) {
        const table = result.slice(0, 10).map((t, i) => 
          `${i+1}. ${t.name || t.team} (${t.points || 0})`
        ).join("\n");
        return `🏆 EPL Standings\n${table}`;
      }
      return language === "swahili" ? "Standings haipo sasa" : "Standings not available";
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
    if (lower.includes("mp3") || lower.includes("audio")) {
      const result = await downloads.youtubeMp3(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (lower.includes("instagram") || url.includes("instagram.com")) {
      const result = await downloads.instagram(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
    
    if (url.includes("facebook.com")) {
      const result = await downloads.facebook(url);
      const link = result.downloadUrl || result.url || result.result;
      if (link && link.startsWith("http")) return link;
    }
  } catch (err) {
    return null;
  }
  return null;
}

// Handle news
async function handleNews(text, language) {
  const lower = text.toLowerCase();
  
  try {
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
  } catch (err) {
    return null;
  }
  return null;
}

// Main chat handler - uses ALL AI APIs, no errors
async function handleChat(jid, text) {
  const language = detectLanguage(text);
  
  // Step 1: Quick intelligent reply (acknowledges the specific message)
  const quick = quickIntelligentReply(text, language);
  if (quick) return quick;
  
  // Step 2: Games
  const game = await handleGame(text, language);
  if (game) return game;
  
  // Step 3: Sports
  const sportsResult = await handleSports(text, language);
  if (sportsResult) return sportsResult;
  
  // Step 4: Downloads
  const download = await handleDownload(text);
  if (download) return download;
  
  // Step 5: News
  const newsResult = await handleNews(text, language);
  if (newsResult) return newsResult;
  
  // Step 6: AI Chat - Use ALL available APIs with smart fallback
  try {
    const history = db.recentMsgs(jid, 8);
    const prompt = buildPrompt(text, history, language);
    
    // Try all APIs in order of speed/reliability
    let response = null;
    let usedApi = null;
    
    // Try GPT-3 (fastest)
    try {
      response = await ai.chat(prompt);
      if (response && response.length > 3) usedApi = "gpt3";
    } catch (e) {}
    
    // Try ChatGPT if GPT-3 failed
    if (!response || response.length < 3) {
      try {
        response = await ai.chatGpt(prompt);
        if (response && response.length > 3) usedApi = "chatgpt";
      } catch (e) {}
    }
    
    // Try Gifted GPT-4
    if (!response || response.length < 3) {
      try {
        response = await ai.chatGifted(text);
        if (response && response.length > 3) usedApi = "gifted";
      } catch (e) {}
    }
    
    // Try DeepSeek via Gifted
    if (!response || response.length < 3) {
      try {
        const { ai: deepAi } = require("./apis");
        response = await deepAi.chatDeepSeek?.(text) || null;
        if (response && response.length > 3) usedApi = "deepseek";
      } catch (e) {}
    }
    
    // Try Gemini via Gifted
    if (!response || response.length < 3) {
      try {
        const { ai: geminiAi } = require("./apis");
        response = await geminiAi.chatGemini?.(text) || null;
        if (response && response.length > 3) usedApi = "gemini";
      } catch (e) {}
    }
    
    console.log(`[ai] Used API: ${usedApi || "none"}`);
    
    const cleaned = cleanResponse(response || "", text, language);
    if (cleaned) return cleaned;
    
    // Ultimate fallback - contextual based on user's message
    const lastResort = [
      "Sawa, niambie zaidi.",
      "Hehe, sawa. Endelea.",
      "Poa. Una maoni gani?",
      "Sema tu.",
      "Niambie unataka nini.",
    ];
    return lastResort[Math.floor(Math.random() * lastResort.length)];
    
  } catch (err) {
    // SILENT FAILURE - NEVER send error to user
    console.error("[chat] Error:", err.message);
    
    // Contextual fallbacks based on user's message - NOT errors
    const contextual = [
      "Sawa.",
      "Hehe.",
      "Mmmh.",
      "Vipi?",
      "Niambie.",
      "Rada.",
      "Alaf?",
      "Ssup?",
    ];
    return contextual[Math.floor(Math.random() * contextual.length)];
  }
}

// Main route function
async function route(jid, text, isOwner = false) {
  if (!text) return null;
  
  // Silent mode for girlfriends
  const isGirlfriend = GIRLFRIEND_NUMBERS.some(num => jid.includes(num));
  if (isGirlfriend) {
    console.log(`[route] Silent mode for girlfriend: ${jid}`);
    return null;
  }
  
  const response = await handleChat(jid, text);
  
  // NEVER send errors to anyone (including owner via chat)
  if (response && (response.toLowerCase().includes("error") || 
                   response.toLowerCase().includes("fail") || 
                   response.toLowerCase().includes("network slow") ||
                   response.toLowerCase().includes("try again"))) {
    // Replace with friendly response
    const friendly = ["Sawa", "Hehe", "Mmmh", "Vipi", "Niambie", "Rada", "Alaf", "Ssup", "Poa"];
    return friendly[Math.floor(Math.random() * friendly.length)];
  }
  
  return response;
}

module.exports = { route };
