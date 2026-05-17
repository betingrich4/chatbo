// Sticker support: random sticker from src/sticker folder
const fs = require("fs");
const path = require("path");

const STICKER_DIR = path.join(__dirname, "src", "sticker");

function listStickers() {
  try {
    if (!fs.existsSync(STICKER_DIR)) return [];
    return fs.readdirSync(STICKER_DIR).filter((f) => /\.(webp|png|jpg|jpeg|gif)$/i.test(f));
  } catch { return []; }
}

function randomSticker() {
  const list = listStickers();
  if (!list.length) return null;
  const pick = list[Math.floor(Math.random() * list.length)];
  return path.join(STICKER_DIR, pick);
}

function findSticker(name) {
  if (!name) return null;
  const list = listStickers();
  const target = name.toLowerCase().replace(/\.(webp|png|jpg|jpeg|gif)$/i, "");
  const hit = list.find((f) => f.toLowerCase().includes(target));
  return hit ? path.join(STICKER_DIR, hit) : null;
}

module.exports = { listStickers, randomSticker, findSticker, STICKER_DIR };
