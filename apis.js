const axios = require("axios");
const FormData = require("form-data");

const GIFTED_KEY = process.env.API_KEY || "gifted";
const GIFTED_BASE = "https://api.giftedtech.co.ke/api";
const DAVID_BASE = "https://apis.davidcyril.name.ng";

const http = axios.create({ timeout: 30000 });

async function getFast(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await http.get(url);
      return res.data;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

async function postFast(url, data, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await http.post(url, data);
      return res.data;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

function extractResponse(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (data.choices && data.choices[0]) {
    return data.choices[0].message?.content || data.choices[0].text;
  }
  if (data.message?.content) return data.message.content;
  if (data.response) return data.response;
  if (data.reply) return data.reply;
  if (data.answer) return data.answer;
  if (data.result) {
    if (typeof data.result === "string") return data.result;
    return extractResponse(data.result);
  }
  if (data.text) return data.text;
  if (data.content) return data.content;
  if (data.output) return data.output;
  if (data.data) return extractResponse(data.data);
  return null;
}

// ==================== ALL AI ENDPOINTS ====================

// DavidCyril AI endpoints
const davidApi = {
  // Main chat endpoint
  chat: async (text) => {
    const url = `${DAVID_BASE}/ai/chat?question=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // GPT-3 - fastest
  gpt3: async (text) => {
    const url = `${DAVID_BASE}/ai/gpt3?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // ChatGPT with GPT-4o
  chatgpt: async (text) => {
    const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(text)}&model=gpt-4o`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // DeepSeek LLM
  deepseek: async (text) => {
    const url = `${DAVID_BASE}/ai/deepseek-llm-67b-chat?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // Public AI
  publicAi: async (text) => {
    const url = `${DAVID_BASE}/ai/public?question=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // Perplexity - up to date, good for news/current info
  perplexity: async (text) => {
    const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // Gemini
  gemini: async (text) => {
    const url = `${DAVID_BASE}/ai/gemini?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  }
};

// Gifted AI endpoints
const giftedApi = {
  gpt4o: async (text) => {
    const url = `${GIFTED_BASE}/ai/gpt4o?apikey=${GIFTED_KEY}&q=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return data?.result || data?.response || extractResponse(data);
  },
  
  gemini: async (text) => {
    const url = `${GIFTED_BASE}/ai/gemini?apikey=${GIFTED_KEY}&q=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return data?.result || data?.response || extractResponse(data);
  },
  
  deepseek: async (text) => {
    const url = `${GIFTED_BASE}/ai/overchat?apikey=${GIFTED_KEY}&model=deepseek&q=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return data?.result || data?.response || extractResponse(data);
  },
  
  llama: async (text) => {
    const url = `${GIFTED_BASE}/ai/llama?apikey=${GIFTED_KEY}&q=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return data?.result || data?.response || extractResponse(data);
  },
  
  mistral: async (text) => {
    const url = `${GIFTED_BASE}/ai/mistral?apikey=${GIFTED_KEY}&q=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return data?.result || data?.response || extractResponse(data);
  }
};

// Main AI with smart fallback - tries all APIs
const ai = {
  // Primary: DavidCyril chat endpoint
  chat: async (text) => {
    const url = `${DAVID_BASE}/ai/chat?question=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // Smart chat - tries all APIs in order
  smartChat: async (text) => {
    const models = [
      { name: "david-chat", fn: () => ai.chat(text) },
      { name: "david-gpt3", fn: () => davidApi.gpt3(text) },
      { name: "david-chatgpt", fn: () => davidApi.chatgpt(text) },
      { name: "david-deepseek", fn: () => davidApi.deepseek(text) },
      { name: "david-public", fn: () => davidApi.publicAi(text) },
      { name: "david-perplexity", fn: () => davidApi.perplexity(text) },
      { name: "david-gemini", fn: () => davidApi.gemini(text) },
      { name: "gifted-gpt4o", fn: () => giftedApi.gpt4o(text) },
      { name: "gifted-gemini", fn: () => giftedApi.gemini(text) },
      { name: "gifted-deepseek", fn: () => giftedApi.deepseek(text) },
      { name: "gifted-llama", fn: () => giftedApi.llama(text) },
      { name: "gifted-mistral", fn: () => giftedApi.mistral(text) }
    ];
    
    for (const model of models) {
      try {
        const result = await model.fn();
        if (result && result.length > 3 && !result.toLowerCase().includes("error")) {
          console.log(`[ai] Success: ${model.name}`);
          return result;
        }
      } catch (err) {
        continue;
      }
    }
    return null;
  },
  
  // Individual access
  davidGpt3: (text) => davidApi.gpt3(text),
  davidChatgpt: (text) => davidApi.chatgpt(text),
  davidDeepseek: (text) => davidApi.deepseek(text),
  davidPerplexity: (text) => davidApi.perplexity(text),
  davidGemini: (text) => davidApi.gemini(text),
  giftedGpt4o: (text) => giftedApi.gpt4o(text),
  giftedGemini: (text) => giftedApi.gemini(text),
  giftedDeepseek: (text) => giftedApi.deepseek(text)
};

// ==================== DOWNLOAD ENDPOINTS ====================

const downloads = {
  // Facebook download - prefers SD automatically
  facebook: async (url, preferHD = false) => {
    try {
      const result = await getFast(`${DAVID_BASE}/facebook?url=${encodeURIComponent(url)}`);
      const sdLink = result?.sd || result?.download_url || result?.url;
      const hdLink = result?.hd || result?.hd_url;
      const link = preferHD && hdLink ? hdLink : sdLink;
      return { url: link, isHD: preferHD && hdLink };
    } catch (err) {
      throw err;
    }
  },
  
  // Instagram download
  instagram: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/instagram?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  
  // TikTok download
  tiktok: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/tiktok?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  
  // Twitter/X download
  twitter: async (url) => {
    const result = await getFast(`${DAVID_BASE}/twitter?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  
  // YouTube MP3
  youtubeMp3: async (url) => {
    const result = await getFast(`${DAVID_BASE}/youtube/mp3?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  
  // YouTube Video
  youtubeVideo: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/ytvideo?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  
  // Pinterest download
  pinterest: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/pinterest?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  }
};

// ==================== MUSIC PLAYBACK ====================

const music = {
  play: async (query) => {
    const result = await getFast(`${DAVID_BASE}/play?query=${encodeURIComponent(query)}`);
    return result?.url || result?.downloadUrl || result?.result;
  }
};

// ==================== IMAGE GENERATION ====================

const imageGen = {
  // Flux v2 for image generation
  fluxv2: async (prompt) => {
    const result = await getFast(`${DAVID_BASE}/fluxv2?prompt=${encodeURIComponent(prompt)}`);
    return result?.url || result?.image_url || result?.result;
  },
  
  // NanoBanana for image editing
  nanobanana2: async (imageUrl, prompt) => {
    const result = await getFast(`${DAVID_BASE}/nanobanana2?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`);
    return result?.url || result?.image_url || result?.result;
  }
};

// ==================== IMAGE UPLOAD ====================

const upload = {
  // Catbox upload
  catbox: async (fileUrl) => {
    try {
      const form = new FormData();
      form.append('file', fileUrl);
      const response = await postFast('https://apis.davidcyril.name.ng/uploader/catbox', form, {
        headers: form.getHeaders()
      });
      return response?.url || response?.result;
    } catch (err) {
      throw err;
    }
  },
  
  // ImgBB upload
  imgbb: async (fileUrl) => {
    try {
      const form = new FormData();
      form.append('file', fileUrl);
      const response = await postFast('https://apis.davidcyril.name.ng/upload/imgbb', form, {
        headers: form.getHeaders()
      });
      return response?.url || response?.result;
    } catch (err) {
      throw err;
    }
  }
};

// ==================== SPORTS ENDPOINTS ====================

const sports = {
  liveScores: async () => {
    const result = await getFast(`${DAVID_BASE}/sports/live-scores`);
    return result;
  },
  soccerScores: async () => {
    const result = await getFast(`${DAVID_BASE}/sports/soccer-scores`);
    return result;
  },
  soccerStandings: async (league = "epl") => {
    const result = await getFast(`${DAVID_BASE}/sports/soccer-standings?league=${league}`);
    return result;
  },
  playerSearch: async (playerName) => {
    const result = await getFast(`${DAVID_BASE}/sports/player-search?name=${encodeURIComponent(playerName)}`);
    return result;
  },
  teamSearch: async (teamName) => {
    const result = await getFast(`${DAVID_BASE}/sports/team-search?name=${encodeURIComponent(teamName)}`);
    return result;
  },
  sportsHighlights: async () => {
    const result = await getFast(`${DAVID_BASE}/sports/sports-highlights`);
    return result;
  }
};

// ==================== GAMES ENDPOINTS ====================

const games = {
  rollDice: async (sides = 6, count = 1) => {
    const result = await getFast(`${DAVID_BASE}/api/games/dice?sides=${sides}&count=${count}`);
    return result;
  },
  flipCoin: async () => {
    const result = await getFast(`${DAVID_BASE}/api/games/coin`);
    return result;
  },
  trivia: async (category = 9, difficulty = "easy", amount = 1) => {
    const result = await getFast(`${DAVID_BASE}/api/games/trivia?category=${category}&difficulty=${difficulty}&amount=${amount}`);
    return result;
  },
  joke: async (type = "Any") => {
    const result = await getFast(`${DAVID_BASE}/api/games/joke?type=${type}`);
    return result;
  },
  truth: async () => {
    const result = await getFast(`${DAVID_BASE}/api/games/truth`);
    return result;
  },
  dare: async () => {
    const result = await getFast(`${DAVID_BASE}/api/games/dare`);
    return result;
  },
  eightBall: async (question) => {
    const result = await getFast(`${DAVID_BASE}/api/games/8ball?question=${encodeURIComponent(question)}`);
    return result;
  },
  rps: async (choice) => {
    const result = await getFast(`${DAVID_BASE}/api/games/rps?choice=${choice.toLowerCase()}`);
    return result;
  }
};

// ==================== NEWS ENDPOINTS ====================

const news = {
  trending: async () => {
    const result = await getFast(`${DAVID_BASE}/news/trending`);
    return result;
  },
  bbc: async () => {
    const result = await getFast(`${DAVID_BASE}/news/bbc`);
    return result;
  },
  sports: async () => {
    const result = await getFast(`${DAVID_BASE}/news/sports`);
    return result;
  },
  technology: async () => {
    const result = await getFast(`${DAVID_BASE}/news/technology`);
    return result;
  }
};

// ==================== LYRICS ENDPOINTS ====================

const lyrics = {
  search: async (title, artist) => {
    const result = await getFast(`${DAVID_BASE}/lyrics2?t=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}`);
    return result;
  }
};

// ==================== STICKERS ENDPOINTS ====================

const stickers = {
  search: async (query) => {
    const result = await getFast(`${DAVID_BASE}/search/stickerly?q=${encodeURIComponent(query)}`);
    return result;
  }
};

// ==================== QUOTES ENDPOINTS ====================

const quotes = {
  random: async () => {
    const result = await getFast(`${DAVID_BASE}/quotes/random`);
    return result;
  },
  inspirational: async () => {
    const result = await getFast(`${DAVID_BASE}/quotes/inspirational`);
    return result;
  }
};

// ==================== EXPORT ALL ====================

module.exports = { 
  ai,
  davidApi,
  giftedApi,
  downloads,
  music,
  imageGen,
  upload,
  sports,
  games,
  news,
  lyrics,
  stickers,
  quotes,
  getFast,
  postFast,
  extractResponse
};
