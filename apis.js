const axios = require("axios");

const GIFTED_KEY = process.env.API_KEY || "gifted";
const GIFTED_BASE = "https://api.giftedtech.co.ke/api";

// DavidCyril API base
const DAVID_BASE = "https://apis.davidcyril.name.ng";

// Increased timeout
const http = axios.create({ timeout: 60000 });

async function getWithRetry(url, retries = 2, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await http.get(url);
      return res.data;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`[api] Retry ${i + 1}/${retries} for ${url.substring(0, 80)}...`);
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

// DavidCyril AI endpoints
const davidAi = {
  // GPT-3 endpoint
  gpt3: async (text) => {
    const url = `${DAVID_BASE}/ai/gpt3?text=${encodeURIComponent(text)}`;
    const data = await getWithRetry(url);
    return extractDavidResponse(data);
  },
  
  // DeepSeek endpoint
  deepseek: async (text) => {
    const url = `${DAVID_BASE}/ai/deepseek-llm-67b-chat?text=${encodeURIComponent(text)}`;
    const data = await getWithRetry(url);
    return extractDavidResponse(data);
  },
  
  // Public AI endpoint
  publicAi: async (text) => {
    const url = `${DAVID_BASE}/ai/public?question=${encodeURIComponent(text)}`;
    const data = await getWithRetry(url);
    return extractDavidResponse(data);
  },
  
  // Perplexity endpoint (for news/current events)
  perplexity: async (text) => {
    const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(text)}`;
    const data = await getWithRetry(url);
    return extractDavidResponse(data);
  },
  
  // ChatGPT endpoint with configurable model
  chatgpt: async (text, model = "gpt-4o", system = "You are a helpful assistant") => {
    const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(text)}&model=${encodeURIComponent(model)}&system=${encodeURIComponent(system)}`;
    const data = await getWithRetry(url);
    return extractDavidResponse(data);
  }
};

function extractDavidResponse(data) {
  if (!data) return null;
  // Try common response formats
  if (typeof data === "string") return data;
  if (data.response) return data.response;
  if (data.reply) return data.reply;
  if (data.answer) return data.answer;
  if (data.result) return data.result;
  if (data.text) return data.text;
  if (data.message) return data.message;
  if (data.content) return data.content;
  if (data.data) return extractDavidResponse(data.data);
  return JSON.stringify(data);
}

// Gifted API (fallback)
const gifted = {
  gpt4o: async (q) => {
    const url = `${GIFTED_BASE}/ai/gpt4o?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`;
    const data = await getWithRetry(url);
    return data;
  },
  gemini: async (q) => {
    const url = `${GIFTED_BASE}/ai/gemini?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`;
    const data = await getWithRetry(url);
    return data;
  },
  deepseek: async (q) => {
    const url = `${GIFTED_BASE}/ai/overchat?apikey=${GIFTED_KEY}&model=deepseek&q=${encodeURIComponent(q)}`;
    const data = await getWithRetry(url);
    return data;
  }
};

function extractGiftedText(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  const r = data.result || data.data || data.response || data.message || data;
  if (typeof r === "string") return r;
  if (r?.response) return r.response;
  if (r?.text) return r.text;
  if (r?.answer) return r.answer;
  return JSON.stringify(r).slice(0, 500);
}

// Main AI with fallback chain
const ai = {
  // Primary: Try DavidCyril endpoints in order
  chat: async (text) => {
    const models = [
      { name: "david-chatgpt", fn: () => davidAi.chatgpt(text) },
      { name: "david-gpt3", fn: () => davidAi.gpt3(text) },
      { name: "david-deepseek", fn: () => davidAi.deepseek(text) },
      { name: "david-public", fn: () => davidAi.publicAi(text) },
      { name: "gifted-gpt4o", fn: () => gifted.gpt4o(text).then(extractGiftedText) },
      { name: "gifted-gemini", fn: () => gifted.gemini(text).then(extractGiftedText) },
      { name: "gifted-deepseek", fn: () => gifted.deepseek(text).then(extractGiftedText) }
    ];
    
    let lastError = null;
    
    for (const model of models) {
      try {
        console.log(`[ai] Trying: ${model.name}`);
        const result = await model.fn();
        if (result && result.length > 5 && !result.toLowerCase().includes("error")) {
          console.log(`[ai] Success with: ${model.name}`);
          return result;
        }
      } catch (err) {
        lastError = err;
        console.log(`[ai] ${model.name} failed:`, err.message);
        continue;
      }
    }
    
    throw lastError || new Error("All AI models failed");
  },
  
  // Perplexity for news/current events
  news: async (text) => {
    try {
      const result = await davidAi.perplexity(text);
      if (result && result.length > 5) return result;
    } catch (e) {
      console.log("[ai] Perplexity failed, falling back to regular chat");
    }
    return ai.chat(text);
  },
  
  // Legacy compatibility
  gpt4o: (q) => ai.chat(q),
  gemini: (q) => ai.chat(q),
  deepseek: (q) => ai.chat(q)
};

// Football (keeping Gifted as it works)
const football = {
  livescore: () => getWithRetry(`${GIFTED_BASE}/football/livescore?apikey=${GIFTED_KEY}`),
  predictions: () => getWithRetry(`${GIFTED_BASE}/football/predictions?apikey=${GIFTED_KEY}`),
  eplStandings: () => getWithRetry(`${GIFTED_BASE}/football/epl/standings?apikey=${GIFTED_KEY}`),
  news: () => getWithRetry(`${GIFTED_BASE}/football/news?apikey=${GIFTED_KEY}`),
  team: (q) => getWithRetry(`${GIFTED_BASE}/football/team?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`),
  player: (q) => getWithRetry(`${GIFTED_BASE}/football/player?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`),
};

// Downloads (keeping Gifted)
const dl = {
  youtube: (url) => getWithRetry(`${GIFTED_BASE}/download/ytvideo?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  tiktok: (url) => getWithRetry(`${GIFTED_BASE}/download/tiktok?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  instagram: (url) => getWithRetry(`${GIFTED_BASE}/download/instagram?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  twitter: (url) => getWithRetry(`${GIFTED_BASE}/download/twitter?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  spotify: (url) => getWithRetry(`${GIFTED_BASE}/download/spotify?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  aio: (url) => getWithRetry(`${GIFTED_BASE}/download/aio?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
};

// Images / tools (keeping Gifted)
const tools = {
  genImage: (prompt) => getWithRetry(`${GIFTED_BASE}/ai/deepimg?apikey=${GIFTED_KEY}&prompt=${encodeURIComponent(prompt)}`),
  removeBg: (url) => getWithRetry(`${GIFTED_BASE}/tools/removebg?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  enhance: (url) => getWithRetry(`${GIFTED_BASE}/tools/remini?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`),
  define: (word) => getWithRetry(`${GIFTED_BASE}/tools/define?apikey=${GIFTED_KEY}&word=${encodeURIComponent(word)}`),
  qr: (text) => getWithRetry(`${GIFTED_BASE}/tools/createqr?apikey=${GIFTED_KEY}&text=${encodeURIComponent(text)}`),
};

module.exports = { ai, football, dl, tools, http };
