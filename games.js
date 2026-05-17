// Mini-games: trivia, riddle, dice, rock-paper-scissors, number guess, 8ball
const db = require("./db");

const TRIVIA = [
  { q: "What is the capital of Kenya?", a: ["nairobi"] },
  { q: "How many continents are there?", a: ["7", "seven"] },
  { q: "Which planet is known as the Red Planet?", a: ["mars"] },
  { q: "Who painted the Mona Lisa?", a: ["da vinci", "leonardo da vinci", "leonardo"] },
  { q: "What language has the most native speakers?", a: ["mandarin", "chinese"] },
  { q: "Largest ocean on earth?", a: ["pacific"] },
  { q: "Which year did Kenya gain independence?", a: ["1963"] },
  { q: "Who scored most goals in 2022 World Cup?", a: ["mbappe", "kylian mbappe"] },
  { q: "Highest mountain in Africa?", a: ["kilimanjaro", "mt kilimanjaro"] },
  { q: "What does CPU stand for?", a: ["central processing unit"] },
  { q: "Square root of 144?", a: ["12"] },
  { q: "Who wrote Romeo and Juliet?", a: ["shakespeare", "william shakespeare"] },
];

const RIDDLES = [
  { q: "I speak without a mouth and hear without ears. What am I?", a: ["echo", "an echo"] },
  { q: "The more you take, the more you leave behind. What are they?", a: ["footsteps", "steps"] },
  { q: "What has keys but can't open locks?", a: ["piano", "keyboard", "a piano"] },
  { q: "What gets wetter the more it dries?", a: ["towel", "a towel"] },
  { q: "I'm tall when young and short when old. What am I?", a: ["candle", "a candle"] },
];

const EIGHTBALL = [
  "yeah, definitely.", "doubt it.", "ask again later.", "100%.",
  "nah fam.", "signs point to yes.", "very unlikely.", "could go either way.",
  "trust me, no.", "absolutely.",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function start(jid, kind) {
  if (kind === "trivia") {
    const t = pick(TRIVIA);
    db.setGame(jid, "trivia", { q: t.q, a: t.a });
    return `🎯 trivia: ${t.q}\n_reply with your answer_`;
  }
  if (kind === "riddle") {
    const r = pick(RIDDLES);
    db.setGame(jid, "riddle", { q: r.q, a: r.a });
    return `🧩 riddle: ${r.q}\n_reply with your answer_`;
  }
  if (kind === "guess") {
    const n = Math.floor(Math.random() * 100) + 1;
    db.setGame(jid, "guess", { n, tries: 0 });
    return "🔢 i'm thinking of a number 1-100. guess.";
  }
  if (kind === "rps") {
    db.setGame(jid, "rps", {});
    return "✊✋✌️ rock paper scissors — type rock, paper, or scissors";
  }
  return null;
}

function answer(jid, text) {
  const g = db.getGame(jid);
  if (!g) return null;
  const t = text.toLowerCase().trim();

  if (g.kind === "trivia" || g.kind === "riddle") {
    if (g.state.a.some((a) => t.includes(a))) {
      db.endGame(jid);
      return "✅ correct! nice one.";
    }
    if (/^(skip|giveup|give up|idk|i don'?t know)$/.test(t)) {
      const ans = g.state.a[0];
      db.endGame(jid);
      return `answer was: ${ans}`;
    }
    return "nope, try again or say 'skip'";
  }

  if (g.kind === "guess") {
    const n = parseInt(t, 10);
    if (isNaN(n)) return null;
    g.state.tries++;
    if (n === g.state.n) {
      db.endGame(jid);
      return `🎉 got it in ${g.state.tries} tries!`;
    }
    db.setGame(jid, "guess", g.state);
    return n < g.state.n ? "higher ⬆️" : "lower ⬇️";
  }

  if (g.kind === "rps") {
    if (!/(rock|paper|scissors)/.test(t)) return null;
    const user = t.match(/(rock|paper|scissors)/)[1];
    const me = pick(["rock", "paper", "scissors"]);
    db.endGame(jid);
    if (user === me) return `both ${me}. tie.`;
    const wins = { rock: "scissors", paper: "rock", scissors: "paper" };
    return wins[user] === me ? `i picked ${me}. you win 🏆` : `i picked ${me}. i win 😎`;
  }
  return null;
}

function detect(text) {
  const t = text.toLowerCase().trim();
  if (/^(play )?trivia$/.test(t)) return "trivia";
  if (/^(give me a )?riddle$/.test(t)) return "riddle";
  if (/^(play )?(number )?guess$/.test(t)) return "guess";
  if (/^(play )?(rps|rock paper scissors)$/.test(t)) return "rps";
  return null;
}

function dice() { return `🎲 ${Math.floor(Math.random() * 6) + 1}`; }
function coin() { return Math.random() < 0.5 ? "🪙 heads" : "🪙 tails"; }
function eightball(q) { return `🎱 ${pick(EIGHTBALL)}`; }

module.exports = { start, answer, detect, dice, coin, eightball };
