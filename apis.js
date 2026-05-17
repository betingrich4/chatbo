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

async function postFast(url, data, headers = {}) {
  try {
    const res = await http.post(url, data, { headers });
    return res.data;
  } catch (err) {
    throw err;
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

const davidApi = {
  chat: async (text) => {
    const url = `${DAVID_BASE}/ai/chat?question=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  gpt3: async (text) => {
    const url = `${DAVID_BASE}/ai/gpt3?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  chatgpt: async (text) => {
    const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(text)}&model=gpt-4o`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  deepseek: async (text) => {
    const url = `${DAVID_BASE}/ai/deepseek-llm-67b-chat?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  publicAi: async (text) => {
    const url = `${DAVID_BASE}/ai/public?question=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  perplexity: async (text) => {
    const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  gemini: async (text) => {
    const url = `${DAVID_BASE}/ai/gemini?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  }
};

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

const ai = {
  chat: async (text) => {
    const url = `${DAVID_BASE}/ai/chat?question=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
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
          return result;
        }
      } catch (err) {
        continue;
      }
    }
    return null;
  }
};

// ==================== DOWNLOADS ====================

const downloads = {
  facebook: async (url, preferHD = false) => {
    const result = await getFast(`${DAVID_BASE}/facebook?url=${encodeURIComponent(url)}`);
    const sdLink = result?.sd || result?.download_url || result?.url;
    const hdLink = result?.hd || result?.hd_url;
    return preferHD && hdLink ? hdLink : sdLink;
  },
  instagram: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/instagram?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  tiktok: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/tiktok?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  twitter: async (url) => {
    const result = await getFast(`${DAVID_BASE}/twitter?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  },
  youtubeMp3: async (url) => {
    const result = await getFast(`${DAVID_BASE}/youtube/mp3?url=${encodeURIComponent(url)}`);
    return result?.downloadUrl || result?.url || result?.result;
  }
};

// ==================== MUSIC ====================

const music = {
  play: async (query) => {
    const result = await getFast(`${DAVID_BASE}/play?query=${encodeURIComponent(query)}`);
    return result?.url || result?.downloadUrl || result?.result;
  }
};

// ==================== IMAGE ====================

const imageGen = {
  fluxv2: async (prompt) => {
    const result = await getFast(`${DAVID_BASE}/fluxv2?prompt=${encodeURIComponent(prompt)}`);
    return result?.url || result?.image_url || result?.result;
  },
  nanobanana2: async (imageUrl, prompt) => {
    const result = await getFast(`${DAVID_BASE}/nanobanana2?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`);
    return result?.url || result?.image_url || result?.result;
  }
};

// ==================== UPLOAD ====================

const upload = {
  catbox: async (fileUrl) => {
    const form = new FormData();
    form.append('file', fileUrl);
    const response = await postFast('https://apis.davidcyril.name.ng/uploader/catbox', form, form.getHeaders());
    return response?.url || response?.result;
  },
  imgbb: async (fileUrl) => {
    const form = new FormData();
    form.append('file', fileUrl);
    const response = await postFast('https://apis.davidcyril.name.ng/upload/imgbb', form, form.getHeaders());
    return response?.url || response?.result;
  }
};

// ==================== SPORTS ====================

const sports = {
  liveScores: async () => {
    const result = await getFast(`${DAVID_BASE}/sports/live-scores`);
    return result;
  },
  soccerStandings: async (league = "epl") => {
    const result = await getFast(`${DAVID_BASE}/sports/soccer-standings?league=${league}`);
    return result;
  }
};

// ==================== GAMES ====================

const games = {
  rollDice: async (sides = 6) => {
    const result = await getFast(`${DAVID_BASE}/api/games/dice?sides=${sides}&count=1`);
    return result;
  },
  flipCoin: async () => {
    const result = await getFast(`${DAVID_BASE}/api/games/coin`);
    return result;
  },
  joke: async () => {
    const result = await getFast(`${DAVID_BASE}/api/games/joke?type=Any`);
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

// ==================== NEWS ====================

const news = {
  trending: async () => {
    const result = await getFast(`${DAVID_BASE}/news/trending`);
    return result;
  },
  bbc: async () => {
    const result = await getFast(`${DAVID_BASE}/news/bbc`);
    return result;
  }
};

// ==================== QUOTES ====================

const quotes = {
  random: async () => {
    const result = await getFast(`${DAVID_BASE}/quotes/random`);
    return result;
  }
};

module.exports = { 
  ai, davidApi, giftedApi, downloads, music, imageGen, upload, 
  sports, games, news, quotes, getFast, postFast, extractResponse
};
