// xAI Grok client — primary brain for Marisel.
const axios = require("axios");

const XAI_KEY = process.env.XAI_API_KEY;
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.20-reasoning";
const BASE = "https://api.x.ai/v1";

if (!XAI_KEY) {
  console.warn("[xai] XAI_API_KEY missing — Grok replies will fail. Set it in .env");
}

const FALLBACKS = ["grok-2-latest", "grok-beta"];

async function callOnce(model, messages, opts) {
  const { data } = await axios.post(
    `${BASE}/chat/completions`,
    { model, messages, temperature: opts.temperature, max_tokens: opts.max_tokens },
    {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${XAI_KEY}` },
      timeout: 45000,
    }
  );
  const txt = data?.choices?.[0]?.message?.content;
  return typeof txt === "string" ? txt.trim() : null;
}

async function chat(messages, { temperature = 0.9, max_tokens = 220 } = {}) {
  if (!XAI_KEY) return null;
  const tried = [XAI_MODEL, ...FALLBACKS];
  let lastErr;
  for (const m of tried) {
    try {
      return await callOnce(m, messages, { temperature, max_tokens });
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      console.error(`[xai] ${m} failed`, status, err.response?.data?.error?.message || err.message);
      if (status && ![400, 404, 422].includes(status)) break;
    }
  }
  return null;
}

module.exports = { chat };
