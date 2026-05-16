const axios = require("axios");

const KEY = process.env.API_KEY || "gifted";
const BASE = "https://api.giftedtech.co.ke/api";

const http = axios.create({ timeout: 45000 });

async function get(path, params = {}) {
  const url = `${BASE}${path}`;
  const res = await http.get(url, { params: { apikey: KEY, ...params } });
  return res.data;
}

// AI
const ai = {
  gpt4o: (q) => get("/ai/gpt4o", { q }),
  gemini: (q) => get("/ai/gemini", { q }),
  deepseek: (q) => get("/ai/overchat", { q, model: "deepseek" }),
};

// Football
const football = {
  livescore: () => get("/football/livescore"),
  predictions: () => get("/football/predictions"),
  eplStandings: () => get("/football/epl/standings"),
  news: () => get("/football/news"),
  team: (q) => get("/football/team", { q }),
  player: (q) => get("/football/player", { q }),
};

// Downloads
const dl = {
  youtube: (url) => get("/download/ytvideo", { url }),
  tiktok: (url) => get("/download/tiktok", { url }),
  instagram: (url) => get("/download/instagram", { url }),
  twitter: (url) => get("/download/twitter", { url }),
  spotify: (url) => get("/download/spotify", { url }),
  aio: (url) => get("/download/aio", { url }),
};

// Images / tools
const tools = {
  genImage: (prompt) => get("/ai/deepimg", { prompt }),
  removeBg: (url) => get("/tools/removebg", { url }),
  enhance: (url) => get("/tools/remini", { url }),
  define: (word) => get("/tools/define", { word }),
  qr: (text) => get("/tools/createqr", { text }),
};

module.exports = { ai, football, dl, tools, http };
