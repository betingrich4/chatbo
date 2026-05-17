const { sports } = require("./apis");
const db = require("./db");

function matchId(m) {
  return m.id || `${(m.home || "").toLowerCase()}-vs-${(m.away || "").toLowerCase()}`;
}

function normalize(m) {
  return {
    match_id: matchId(m),
    home: m.home || m.homeTeam || "Home",
    away: m.away || m.awayTeam || "Away",
    home_score: parseInt(m.homeScore ?? m.home_score ?? 0, 10),
    away_score: parseInt(m.awayScore ?? m.away_score ?? 0, 10),
    last_event: m.lastEvent || "",
  };
}

async function pollOnce(sendToOwner) {
  try {
    const data = await sports.liveScores();
    const list = Array.isArray(data) ? data : [];
    for (const raw of list) {
      const m = normalize(raw);
      const prev = db.getMatch(m.match_id);
      db.upsertMatch(m);
      if (!prev) continue;
      const goal = m.home_score > prev.home_score || m.away_score > prev.away_score;
      if (goal) {
        const scorer = m.home_score > prev.home_score ? m.home : m.away;
        await sendToOwner(`⚽ GOAL! ${m.home} ${m.home_score}-${m.away_score} ${m.away}\n${scorer} scored!`);
      }
    }
  } catch (err) {}
}

function start(sendToOwner) {
  const interval = parseInt(process.env.CHECK_INTERVAL || "120000", 10);
  pollOnce(async () => {}).catch(() => {});
  setInterval(() => pollOnce(sendToOwner).catch(() => {}), interval);
}

module.exports = { start };
