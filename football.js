const { football } = require("./apis");
const db = require("./db");

function matchId(m) {
  return (
    m.id ||
    m.matchId ||
    m.match_id ||
    `${(m.home || m.homeTeam || "").toLowerCase()}-vs-${(m.away || m.awayTeam || "").toLowerCase()}-${m.date || m.time || ""}`
  );
}

function normalize(m) {
  return {
    match_id: matchId(m),
    home: m.home || m.homeTeam || m.home_name || "Home",
    away: m.away || m.awayTeam || m.away_name || "Away",
    home_score: parseInt(m.homeScore ?? m.home_score ?? m.score_home ?? 0, 10) || 0,
    away_score: parseInt(m.awayScore ?? m.away_score ?? m.score_away ?? 0, 10) || 0,
    minute: m.minute || m.time || m.elapsed || "",
    last_event: m.lastEvent || m.event || "",
  };
}

async function pollOnce(sendToOwner) {
  let data;
  try {
    data = await football.livescore();
  } catch {
    return;
  }
  const r = data?.result || data?.data || data;
  const list = Array.isArray(r) ? r : Array.isArray(r?.matches) ? r.matches : [];
  for (const raw of list) {
    const m = normalize(raw);
    const prev = db.getMatch(m.match_id);
    db.upsertMatch(m);
    if (!prev) continue; // first time we see this match — don't spam
    const goal =
      m.home_score > prev.home_score || m.away_score > prev.away_score;
    if (goal) {
      const scorer =
        m.home_score > prev.home_score ? m.home : m.away;
      const text = `LIVE: ${m.home} ${m.home_score} - ${m.away_score} ${m.away}\n${scorer} amefunga${m.minute ? ` - Dakika ${m.minute}` : ""}`;
      try {
        await sendToOwner(text);
      } catch {}
    }
  }
}

function start(sendToOwner) {
  const interval = parseInt(process.env.CHECK_INTERVAL || "120000", 10);
  // initial seed without alerts: just upsert
  pollOnce(async () => {}).catch(() => {});
  setInterval(() => {
    pollOnce(sendToOwner).catch(() => {});
  }, interval);
}

module.exports = { start };
