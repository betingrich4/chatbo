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
      console.log(`[api] Requesting: ${url.substring(0, 100)}...`);
      const res = await http.get(url);
      return res.data;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`[api] Retry ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
}

// Improved response extractor for DavidCyril APIs
function extractDavidResponse(data) {
  if (!data) return null;
  
  // Handle string response
  if (typeof data === "string") {
    if (data.startsWith("{") || data.startsWith("[")) {
      try {
        const parsed = JSON.parse(data);
        return extractDavidResponse(parsed);
      } catch (e) {
        return data;
      }
    }
    return data;
  }
  
  // Handle OpenAI-style response
  if (data.choices && Array.isArray(data.choices) && data.choices[0]) {
    const choice = data.choices[0];
    if (choice.message && choice.message.content) {
      return choice.message.content;
    }
    if (choice.text) return choice.text;
    if (choice.content) return choice.content;
  }
  
  // Handle direct message/content
  if (data.message) {
    if (typeof data.message === "string") return data.message;
    if (data.message.content) return data.message.content;
  }
  
  // Handle other common formats
  if (data.response) return data.response;
  if (data.reply) return data.reply;
  if (data.answer) return data.answer;
  if (data.result) {
    if (typeof data.result === "string") return data.result;
    if (data.result.content) return data.result.content;
    if (data.result.response) return data.result.response;
    return extractDavidResponse(data.result);
  }
  if (data.text) return data.text;
  if (data.content) return data.content;
  if (data.output) return data.output;
  if (data.data) return extractDavidResponse(data.data);
  
  console.log("[api] Unknown response format");
  return null;
}

function extractGiftedText(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (data.error) return null;
  
  const r = data.result || data.data || data.response || data.message || data;
  if (typeof r === "string") return r;
  if (r?.response) return r.response;
  if (r?.text) return r.text;
  if (r?.answer) return r.answer;
  if (r?.content) return r.content;
  if (r?.reply) return r.reply;
  
  return null;
}

// DavidCyril AI endpoints
const davidAi = {
  // ChatGPT endpoint (primary)
  chatgpt: async (text, model = "gpt-4o") => {
    try {
      const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(text)}&model=${model}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.chatgpt] Failed:", err.message);
      throw err;
    }
  },
  
  // GPT-3 endpoint (faster, lighter)
  gpt3: async (text) => {
    try {
      const url = `${DAVID_BASE}/ai/gpt3?text=${encodeURIComponent(text)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.gpt3] Failed:", err.message);
      throw err;
    }
  },
  
  // DeepSeek endpoint (good for reasoning)
  deepseek: async (text) => {
    try {
      const url = `${DAVID_BASE}/ai/deepseek-llm-67b-chat?text=${encodeURIComponent(text)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.deepseek] Failed:", err.message);
      throw err;
    }
  },
  
  // Public AI endpoint (general purpose)
  publicAi: async (text) => {
    try {
      const url = `${DAVID_BASE}/ai/public?question=${encodeURIComponent(text)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.publicAi] Failed:", err.message);
      throw err;
    }
  },
  
  // Perplexity endpoint - BEST for detailed research, news, current events
  // Use this for questions that need up-to-date information, facts, or detailed explanations
  perplexity: async (text, detailed = true) => {
    try {
      // Add instruction for more detailed response if needed
      const query = detailed ? `Give a detailed, comprehensive answer with examples: ${text}` : text;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(query)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.perplexity] Failed:", err.message);
      throw err;
    }
  },
  
  // Perplexity with web search context (for latest news)
  perplexitySearch: async (query) => {
    try {
      const searchQuery = `Search the web and give me detailed, accurate information about: ${query}. Include relevant facts, dates, and sources if possible.`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(searchQuery)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.perplexitySearch] Failed:", err.message);
      throw err;
    }
  },
  
  // Explanation mode - breaks down complex topics
  explain: async (topic, level = "simple") => {
    try {
      let instruction = "";
      if (level === "simple") {
        instruction = `Explain ${topic} in simple, easy-to-understand terms. Use analogies and examples. Keep it conversational.`;
      } else if (level === "detailed") {
        instruction = `Provide a detailed, comprehensive explanation of ${topic}. Include examples, key concepts, and practical applications.`;
      } else {
        instruction = `Explain ${topic} thoroughly with examples and step-by-step breakdown.`;
      }
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.explain] Failed:", err.message);
      throw err;
    }
  },
  
  // Research mode - in-depth analysis
  research: async (topic) => {
    try {
      const instruction = `Research the following topic thoroughly and provide a comprehensive response with key facts, statistics, different perspectives, and important details: ${topic}`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.research] Failed:", err.message);
      throw err;
    }
  },
  
  // Compare mode - compares two or more things
  compare: async (item1, item2, aspect = "general") => {
    try {
      const instruction = `Compare and contrast ${item1} and ${item2} focusing on ${aspect}. Highlight key similarities and differences, pros and cons.`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.compare] Failed:", err.message);
      throw err;
    }
  },
  
  // Summarize mode - condenses long text
  summarize: async (text, length = "medium") => {
    try {
      let len = "";
      if (length === "short") len = "2-3 sentences";
      else if (length === "medium") len = "1 paragraph";
      else len = "detailed bullet points";
      
      const instruction = `Summarize the following text in ${len}. Keep the key points and main ideas: ${text}`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.summarize] Failed:", err.message);
      throw err;
    }
  },
  
  // Tutor mode - teaches a concept step by step
  tutor: async (subject, topic) => {
    try {
      const instruction = `Act as a tutor. Teach me about ${topic} in ${subject}. Break it down step by step, check for understanding, and give examples. Keep it engaging.`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.tutor] Failed:", err.message);
      throw err;
    }
  },
  
  // News summary - gets latest news on a topic
  newsSummary: async (topic) => {
    try {
      const instruction = `Give me the latest news and updates about ${topic}. Include recent developments, key events, and important dates from the past month.`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.newsSummary] Failed:", err.message);
      throw err;
    }
  },
  
  // Creative writing mode
  creative: async (prompt, style = "story") => {
    try {
      const instruction = `Write a ${style} based on: ${prompt}. Be creative, engaging, and descriptive.`;
      const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(instruction)}&model=gpt-4o`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.creative] Failed:", err.message);
      throw err;
    }
  },
  
  // Code helper
  codeHelp: async (question, language = "javascript") => {
    try {
      const instruction = `I need help with ${language} code. ${question}. Provide working code examples with explanations.`;
      const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(instruction)}&model=gpt-4o`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.codeHelp] Failed:", err.message);
      throw err;
    }
  },
  
  // Math solver
  solveMath: async (problem) => {
    try {
      const instruction = `Solve this math problem step by step and explain the solution: ${problem}`;
      const url = `${DAVID_BASE}/ai/perplexity?text=${encodeURIComponent(instruction)}`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.solveMath] Failed:", err.message);
      throw err;
    }
  },
  
  // Translation with context
  translate: async (text, targetLang = "Swahili") => {
    try {
      const instruction = `Translate the following to ${targetLang}. Keep the meaning, tone, and cultural context: ${text}`;
      const url = `${DAVID_BASE}/ai/chatgpt?prompt=${encodeURIComponent(instruction)}&model=gpt-4o`;
      const data = await getWithRetry(url);
      const extracted = extractDavidResponse(data);
      if (extracted && extracted.length > 0) return extracted;
      throw new Error("Empty response");
    } catch (err) {
      console.log("[davidAi.translate] Failed:", err.message);
      throw err;
    }
  }
};

// Gifted API (fallback)
const gifted = {
  gpt4o: async (q) => {
    try {
      const url = `${GIFTED_BASE}/ai/gpt4o?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`;
      const data = await getWithRetry(url);
      return extractGiftedText(data);
    } catch (err) {
      console.log("[gifted.gpt4o] Failed:", err.message);
      throw err;
    }
  },
  gemini: async (q) => {
    try {
      const url = `${GIFTED_BASE}/ai/gemini?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`;
      const data = await getWithRetry(url);
      return extractGiftedText(data);
    } catch (err) {
      console.log("[gifted.gemini] Failed:", err.message);
      throw err;
    }
  },
  deepseek: async (q) => {
    try {
      const url = `${GIFTED_BASE}/ai/overchat?apikey=${GIFTED_KEY}&model=deepseek&q=${encodeURIComponent(q)}`;
      const data = await getWithRetry(url);
      return extractGiftedText(data);
    } catch (err) {
      console.log("[gifted.deepseek] Failed:", err.message);
      throw err;
    }
  }
};

// Main AI with intelligent routing based on query type
const ai = {
  // Smart router - picks the best model based on query type
  smartChat: async (text) => {
    const lower = text.toLowerCase();
    
    // Detect query type and route appropriately
    if (lower.includes("explain") || lower.includes("what is") || lower.includes("how does") || lower.includes("tell me about")) {
      console.log("[ai] Detected explanation query - using explain mode");
      return await davidAi.explain(text);
    }
    
    if (lower.includes("compare") || lower.includes("versus") || lower.includes("vs") || lower.includes("difference between")) {
      console.log("[ai] Detected comparison query - using compare mode");
      const parts = text.match(/(.+?)\s+(?:vs|versus|compared to|and)\s+(.+)/i);
      if (parts) {
        return await davidAi.compare(parts[1].trim(), parts[2].trim());
      }
    }
    
    if (lower.includes("news") || lower.includes("latest") || lower.includes("update") || lower.includes("current")) {
      console.log("[ai] Detected news query - using perplexity search");
      return await davidAi.newsSummary(text);
    }
    
    if (lower.includes("research") || lower.includes("analysis") || lower.includes("deep dive")) {
      console.log("[ai] Detected research query - using research mode");
      return await davidAi.research(text);
    }
    
    if (lower.includes("summarize") || lower.includes("summary") || lower.includes("tl;dr")) {
      console.log("[ai] Detected summary query - using summarize mode");
      const cleanText = text.replace(/summarize|summary|tl;dr/i, "").trim();
      return await davidAi.summarize(cleanText);
    }
    
    if (lower.includes("code") || lower.includes("function") || lower.includes("javascript") || lower.includes("python")) {
      console.log("[ai] Detected coding query - using code help");
      return await davidAi.codeHelp(text);
    }
    
    if (lower.includes("math") || lower.includes("calculate") || lower.includes("solve") || /[\d\+\-\*\/\=]/.test(text)) {
      console.log("[ai] Detected math query - using math solver");
      return await davidAi.solveMath(text);
    }
    
    if (lower.includes("translate") || lower.includes("in swahili") || lower.includes("in english")) {
      console.log("[ai] Detected translation query - using translate");
      return await davidAi.translate(text);
    }
    
    if (lower.includes("write") || lower.includes("story") || lower.includes("poem") || lower.includes("creative")) {
      console.log("[ai] Detected creative query - using creative mode");
      return await davidAi.creative(text);
    }
    
    if (lower.includes("teach") || lower.includes("tutor") || lower.includes("learn")) {
      console.log("[ai] Detected tutoring query - using tutor mode");
      return await davidAi.tutor("general", text);
    }
    
    // Default: Use perplexity for detailed responses on most queries
    console.log("[ai] Using perplexity for detailed response");
    return await davidAi.perplexity(text, true);
  },
  
  // Regular chat with fallback chain
  chat: async (text) => {
    const models = [
      { name: "david-perplexity", fn: () => davidAi.perplexity(text, true) },
      { name: "david-chatgpt", fn: () => davidAi.chatgpt(text) },
      { name: "david-gpt3", fn: () => davidAi.gpt3(text) },
      { name: "david-deepseek", fn: () => davidAi.deepseek(text) },
      { name: "david-public", fn: () => davidAi.publicAi(text) },
      { name: "gifted-gpt4o", fn: () => gifted.gpt4o(text) },
      { name: "gifted-gemini", fn: () => gifted.gemini(text) },
      { name: "gifted-deepseek", fn: () => gifted.deepseek(text) }
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
  
  // Perplexity for detailed research
  detailedResearch: async (topic) => {
    return await davidAi.research(topic);
  },
  
  // Quick answer (GPT-3 for speed)
  quickAnswer: async (question) => {
    return await davidAi.gpt3(question);
  },
  
  // Deep analysis
  deepAnalysis: async (topic) => {
    return await davidAi.perplexity(`Provide a deep, comprehensive analysis of: ${topic}`, true);
  },
  
  // News with sources
  getNews: async (topic) => {
    return await davidAi.newsSummary(topic);
  },
  
  // Learn mode - educational responses
  learnMode: async (topic) => {
    return await davidAi.tutor("general", topic);
  },
  
  // Legacy compatibility
  gpt4o: (q) => ai.chat(q),
  gemini: (q) => ai.chat(q),
  deepseek: (q) => ai.chat(q)
};

// Football API (Gifted)
const football = {
  livescore: async () => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/football/livescore?apikey=${GIFTED_KEY}`);
      return data;
    } catch (err) {
      console.log("[football.livescore] Failed:", err.message);
      throw err;
    }
  },
  predictions: async () => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/football/predictions?apikey=${GIFTED_KEY}`);
    } catch (err) {
      console.log("[football.predictions] Failed:", err.message);
      throw err;
    }
  },
  eplStandings: async () => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/football/epl/standings?apikey=${GIFTED_KEY}`);
    } catch (err) {
      console.log("[football.eplStandings] Failed:", err.message);
      throw err;
    }
  },
  news: async () => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/football/news?apikey=${GIFTED_KEY}`);
    } catch (err) {
      console.log("[football.news] Failed:", err.message);
      throw err;
    }
  },
  team: async (q) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/football/team?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`);
    } catch (err) {
      console.log("[football.team] Failed:", err.message);
      throw err;
    }
  },
  player: async (q) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/football/player?apikey=${GIFTED_KEY}&q=${encodeURIComponent(q)}`);
    } catch (err) {
      console.log("[football.player] Failed:", err.message);
      throw err;
    }
  }
};

// Download APIs (Gifted)
const dl = {
  youtube: async (url) => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/download/ytvideo?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
      console.log("[dl.youtube] Response received");
      return data;
    } catch (err) {
      console.log("[dl.youtube] Failed:", err.message);
      throw err;
    }
  },
  tiktok: async (url) => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/download/tiktok?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
      console.log("[dl.tiktok] Response received");
      return data;
    } catch (err) {
      console.log("[dl.tiktok] Failed:", err.message);
      throw err;
    }
  },
  instagram: async (url) => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/download/instagram?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
      console.log("[dl.instagram] Response received");
      return data;
    } catch (err) {
      console.log("[dl.instagram] Failed:", err.message);
      throw err;
    }
  },
  twitter: async (url) => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/download/twitter?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
      console.log("[dl.twitter] Response received");
      return data;
    } catch (err) {
      console.log("[dl.twitter] Failed:", err.message);
      throw err;
    }
  },
  spotify: async (url) => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/download/spotify?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
      console.log("[dl.spotify] Response received");
      return data;
    } catch (err) {
      console.log("[dl.spotify] Failed:", err.message);
      throw err;
    }
  },
  aio: async (url) => {
    try {
      const data = await getWithRetry(`${GIFTED_BASE}/download/aio?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
      console.log("[dl.aio] Response received");
      return data;
    } catch (err) {
      console.log("[dl.aio] Failed:", err.message);
      throw err;
    }
  }
};

// Image tools (Gifted)
const tools = {
  genImage: async (prompt) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/ai/deepimg?apikey=${GIFTED_KEY}&prompt=${encodeURIComponent(prompt)}`);
    } catch (err) {
      console.log("[tools.genImage] Failed:", err.message);
      throw err;
    }
  },
  removeBg: async (url) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/tools/removebg?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
    } catch (err) {
      console.log("[tools.removeBg] Failed:", err.message);
      throw err;
    }
  },
  enhance: async (url) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/tools/remini?apikey=${GIFTED_KEY}&url=${encodeURIComponent(url)}`);
    } catch (err) {
      console.log("[tools.enhance] Failed:", err.message);
      throw err;
    }
  },
  define: async (word) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/tools/define?apikey=${GIFTED_KEY}&word=${encodeURIComponent(word)}`);
    } catch (err) {
      console.log("[tools.define] Failed:", err.message);
      throw err;
    }
  },
  qr: async (text) => {
    try {
      return await getWithRetry(`${GIFTED_BASE}/tools/createqr?apikey=${GIFTED_KEY}&text=${encodeURIComponent(text)}`);
    } catch (err) {
      console.log("[tools.qr] Failed:", err.message);
      throw err;
    }
  }
};

module.exports = { ai, football, dl, tools, http, davidAi };
