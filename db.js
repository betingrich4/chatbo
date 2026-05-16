const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || ".";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "marisel.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  jid TEXT PRIMARY KEY,
  name TEXT,
  first_seen INTEGER,
  last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT,
  role TEXT,        -- 'user' or 'marisel'
  content TEXT,
  ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_msgs_jid_ts ON messages(jid, ts);
CREATE TABLE IF NOT EXISTS paused_chats (
  jid TEXT PRIMARY KEY,
  ts INTEGER
);
CREATE TABLE IF NOT EXISTS match_states (
  match_id TEXT PRIMARY KEY,
  home TEXT,
  away TEXT,
  home_score INTEGER,
  away_score INTEGER,
  last_event TEXT,
  updated INTEGER
);
CREATE TABLE IF NOT EXISTS persona (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note TEXT,
  ts INTEGER
);
`);

const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (jid, name, first_seen, last_seen) VALUES (?,?,?,?)
    ON CONFLICT(jid) DO UPDATE SET name=excluded.name, last_seen=excluded.last_seen
  `),
  addMsg: db.prepare(`INSERT INTO messages (jid, role, content, ts) VALUES (?,?,?,?)`),
  recentMsgs: db.prepare(
    `SELECT role, content FROM messages WHERE jid=? ORDER BY ts DESC LIMIT ?`
  ),
  pause: db.prepare(`INSERT OR REPLACE INTO paused_chats (jid, ts) VALUES (?, ?)`),
  unpause: db.prepare(`DELETE FROM paused_chats WHERE jid=?`),
  isPaused: db.prepare(`SELECT 1 FROM paused_chats WHERE jid=?`),
  getMatch: db.prepare(`SELECT * FROM match_states WHERE match_id=?`),
  upsertMatch: db.prepare(`
    INSERT INTO match_states (match_id, home, away, home_score, away_score, last_event, updated)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(match_id) DO UPDATE SET
      home_score=excluded.home_score,
      away_score=excluded.away_score,
      last_event=excluded.last_event,
      updated=excluded.updated
  `),
  addPersona: db.prepare(`INSERT INTO persona (note, ts) VALUES (?, ?)`),
  allPersona: db.prepare(`SELECT note FROM persona ORDER BY ts ASC`),
};

module.exports = {
  upsertUser: (jid, name) =>
    stmts.upsertUser.run(jid, name || "", Date.now(), Date.now()),
  addMsg: (jid, role, content) => stmts.addMsg.run(jid, role, content, Date.now()),
  recentMsgs: (jid, limit = 20) => stmts.recentMsgs.all(jid, limit).reverse(),
  pause: (jid) => stmts.pause.run(jid, Date.now()),
  unpause: (jid) => stmts.unpause.run(jid),
  isPaused: (jid) => !!stmts.isPaused.get(jid),
  getMatch: (id) => stmts.getMatch.get(id),
  upsertMatch: (m) =>
    stmts.upsertMatch.run(
      m.match_id,
      m.home,
      m.away,
      m.home_score,
      m.away_score,
      m.last_event || "",
      Date.now()
    ),
  addPersona: (note) => stmts.addPersona.run(note, Date.now()),
  allPersona: () => stmts.allPersona.all().map((r) => r.note),
};
