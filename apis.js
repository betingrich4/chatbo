const axios = require("axios");

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
  return null;
}

// Fast AI
const ai = {
  // GPT-3 - fastest
  chat: async (text) => {
    const url = `${DAVID_BASE}/ai/gpt3?text=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // ChatGPT fallback
  chatGpt: async (text) => {
    const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(text)}&model=gpt-4o`;
    const data = await getFast(url);
    return extractResponse(data);
  },
  
  // Gifted fallback
  chatGifted: async (text) => {
    const url = `${GIFTED_BASE}/ai/gpt4o?apikey=${GIFTED_KEY}&q=${encodeURIComponent(text)}`;
    const data = await getFast(url);
    return data?.result || data?.response || extractResponse(data);
  }
};

// Download endpoints
const downloads = {
  youtubeMp3: async (url) => {
    const result = await getFast(`${DAVID_BASE}/youtube/mp3?url=${encodeURIComponent(url)}`);
    return result;
  },
  youtubeVideo: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/ytvideo?url=${encodeURIComponent(url)}`);
    return result;
  },
  instagram: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/instagram?url=${encodeURIComponent(url)}`);
    return result;
  },
  facebook: async (url) => {
    const result = await getFast(`${DAVID_BASE}/facebook?url=${encodeURIComponent(url)}`);
    return result;
  },
  tiktok: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/tiktok?url=${encodeURIComponent(url)}`);
    return result;
  },
  twitter: async (url) => {
    const result = await getFast(`${DAVID_BASE}/download/twitter?url=${encodeURIComponent(url)}`);
    return result;
  }
};

// Sports endpoints
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

// Games endpoints
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

// News endpoints
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

// Lyrics endpoint
const lyrics = {
  search: async (title, artist) => {
    const result = await getFast(`${DAVID_BASE}/lyrics2?t=${encodeURIComponent(title)}&a=${encodeURIComponent(artist)}`);
    return result;
  }
};

// Stickers
const stickers = {
  search: async (query) => {
    const result = await getFast(`${DAVID_BASE}/search/stickerly?q=${encodeURIComponent(query)}`);
    return result;
  }
};

// Quotes
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

module.exports = { 
  ai, 
  downloads, 
  sports, 
  games, 
  news, 
  lyrics, 
  stickers,
  quotes
};
