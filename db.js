const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = process.env.DATA_DIR || ".";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "marisel.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (jid TEXT PRIMARY KEY, name TEXT, first_seen INTEGER, last_seen INTEGER);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT, role TEXT, content TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS idx_msgs_jid_ts ON messages(jid, ts);
CREATE TABLE IF NOT EXISTS paused_chats (jid TEXT PRIMARY KEY, ts INTEGER);
CREATE TABLE IF NOT EXISTS match_states (match_id TEXT PRIMARY KEY, home TEXT, away TEXT, home_score INTEGER, away_score INTEGER, last_event TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS persona (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS statuses (id TEXT PRIMARY KEY, from_jid TEXT, viewed INTEGER, ts INTEGER);
CREATE TABLE IF NOT EXISTS facts (jid TEXT, key TEXT, value TEXT, ts INTEGER, PRIMARY KEY (jid, key));
CREATE TABLE IF NOT EXISTS reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, jid TEXT, text TEXT, due INTEGER, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger TEXT UNIQUE, reply TEXT, kind TEXT DEFAULT 'text', ts INTEGER);
CREATE TABLE IF NOT EXISTS games (jid TEXT PRIMARY KEY, kind TEXT, state TEXT, ts INTEGER);
`);

const s = {
  upsertUser: db.prepare(`INSERT INTO users (jid,name,first_seen,last_seen) VALUES (?,?,?,?) ON CONFLICT(jid) DO UPDATE SET name=excluded.name, last_seen=excluded.last_seen`),
  addMsg: db.prepare(`INSERT INTO messages (jid,role,content,ts) VALUES (?,?,?,?)`),
  recentMsgs: db.prepare(`SELECT role,content FROM messages WHERE jid=? ORDER BY ts DESC LIMIT ?`),
  pause: db.prepare(`INSERT OR REPLACE INTO paused_chats (jid,ts) VALUES (?,?)`),
  unpause: db.prepare(`DELETE FROM paused_chats WHERE jid=?`),
  isPaused: db.prepare(`SELECT 1 FROM paused_chats WHERE jid=?`),
  getMatch: db.prepare(`SELECT * FROM match_states WHERE match_id=?`),
  upsertMatch: db.prepare(`INSERT INTO match_states (match_id,home,away,home_score,away_score,last_event,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(match_id) DO UPDATE SET home_score=excluded.home_score,away_score=excluded.away_score,last_event=excluded.last_event,updated=excluded.updated`),
  addPersona: db.prepare(`INSERT INTO persona (note,ts) VALUES (?,?)`),
  allPersona: db.prepare(`SELECT note FROM persona ORDER BY ts ASC`),
  allPersonaWithIds: db.prepare(`SELECT id,note FROM persona ORDER BY ts ASC`),
  removePersonaById: db.prepare(`DELETE FROM persona WHERE id=?`),
  clearPersona: db.prepare(`DELETE FROM persona`),
  countPersona: db.prepare(`SELECT COUNT(*) as c FROM persona`),
  markStatusViewed: db.prepare(`INSERT OR REPLACE INTO statuses (id,from_jid,viewed,ts) VALUES (?,?,?,?)`),
  isStatusViewed: db.prepare(`SELECT 1 FROM statuses WHERE id=?`),
  setFact: db.prepare(`INSERT OR REPLACE INTO facts (jid,key,value,ts) VALUES (?,?,?,?)`),
  getFacts: db.prepare(`SELECT key,value FROM facts WHERE jid=?`),
  addReminder: db.prepare(`INSERT INTO reminders (jid,text,due) VALUES (?,?,?)`),
  dueReminders: db.prepare(`SELECT id,jid,text FROM reminders WHERE done=0 AND due<=?`),
  doneReminder: db.prepare(`UPDATE reminders SET done=1 WHERE id=?`),
  addRule: db.prepare(`INSERT INTO rules (trigger,reply,kind,ts) VALUES (?,?,?,?) ON CONFLICT(trigger) DO UPDATE SET reply=excluded.reply, kind=excluded.kind, ts=excluded.ts`),
  allRules: db.prepare(`SELECT id,trigger,reply,kind FROM rules ORDER BY id`),
  removeRule: db.prepare(`DELETE FROM rules WHERE id=?`),
  clearRules: db.prepare(`DELETE FROM rules`),
  setGame: db.prepare(`INSERT OR REPLACE INTO games (jid,kind,state,ts) VALUES (?,?,?,?)`),
  getGame: db.prepare(`SELECT kind,state FROM games WHERE jid=?`),
  endGame: db.prepare(`DELETE FROM games WHERE jid=?`),
};

module.exports = {
  upsertUser: (jid, name) => s.upsertUser.run(jid, name || "", Date.now(), Date.now()),
  addMsg: (jid, role, content) => s.addMsg.run(jid, role, content, Date.now()),
  recentMsgs: (jid, limit = 40) => s.recentMsgs.all(jid, limit).reverse(),
  pause: (jid) => s.pause.run(jid, Date.now()),
  unpause: (jid) => s.unpause.run(jid),
  isPaused: (jid) => !!s.isPaused.get(jid),
  getMatch: (id) => s.getMatch.get(id),
  upsertMatch: (m) => s.upsertMatch.run(m.match_id, m.home, m.away, m.home_score, m.away_score, m.last_event || "", Date.now()),
  addPersona: (note) => s.addPersona.run(note, Date.now()),
  allPersona: () => s.allPersona.all().map((r) => r.note),
  allPersonaWithIds: () => s.allPersonaWithIds.all(),
  removePersonaById: (id) => s.removePersonaById.run(id),
  clearPersona: () => s.clearPersona.run(),
  countPersona: () => s.countPersona.get().c,
  markStatusViewed: (id, fromJid) => s.markStatusViewed.run(id, fromJid, 1, Date.now()),
  isStatusViewed: (id) => !!s.isStatusViewed.get(id),
  setFact: (jid, key, value) => s.setFact.run(jid, key, value, Date.now()),
  getFacts: (jid) => s.getFacts.all(jid),
  addReminder: (jid, text, due) => s.addReminder.run(jid, text, due),
  dueReminders: (now = Date.now()) => s.dueReminders.all(now),
  doneReminder: (id) => s.doneReminder.run(id),
  addRule: (trigger, reply, kind = "text") => s.addRule.run(trigger.toLowerCase().trim(), reply, kind, Date.now()),
  allRules: () => s.allRules.all(),
  removeRule: (id) => s.removeRule.run(id),
  clearRules: () => s.clearRules.run(),
  setGame: (jid, kind, state) => s.setGame.run(jid, kind, JSON.stringify(state), Date.now()),
  getGame: (jid) => { const r = s.getGame.get(jid); return r ? { kind: r.kind, state: JSON.parse(r.state) } : null; },
  endGame: (jid) => s.endGame.run(jid),
};
