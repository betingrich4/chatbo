# Marisel — WhatsApp AI Agent

Personal WhatsApp assistant. Male, Kenyan, chill. Uses GiftedTech APIs.

## Features
- Owner-only `marisel pause` / `marisel resume` per chat
- Ignores all groups (`@g.us`)
- Permanent SQLite memory
- Auto-detects YouTube / TikTok / IG / Twitter / Spotify links → downloads
- Football commands (live scores, EPL standings, news, team/player)
- Image generation ("generate image of …")
- Live football alerts to owner every 2 minutes
- Express `/health` endpoint
- Auto-reconnect with exponential backoff
- Owner messaging own number = training mode

## Run locally
```bash
cp .env.example .env
npm install
npm start
```
Scan the QR shown in terminal with WhatsApp → Linked Devices → Link a Device.

## Deploy on Render

1. Push this folder to a GitHub repo.
2. On Render: **New +** → **Blueprint** → pick the repo. `render.yaml` is detected automatically.
3. Render provisions a persistent 1GB disk at `/data` for auth + database (so you scan the QR only once).
4. First deploy: open the service's **Logs** tab — the QR code prints there. Scan it from your phone.
5. After that the session stays alive forever; redeploys reuse the saved auth.

**Important:** use a **Starter** plan or higher. Free Render web services sleep on inactivity, which breaks the WhatsApp WebSocket. Starter ($7/mo) stays on 24/7 and includes the persistent disk.

## Owner controls (from 254740007567)
| Send | Marisel does |
|------|---------|
| `marisel pause` | Stops replying in that chat. Replies `Paused`. |
| `marisel resume` | Resumes that chat. Replies `Resumed`. |
| Any message to own number | Training — appended to persona. Replies `Learned`. |

## Files
- `index.js` — entry, Express, Baileys connection, message router
- `db.js` — SQLite (better-sqlite3)
- `ai.js` — GiftedTech AI + tool routing
- `football.js` — live score monitor
- `apis.js` — GiftedTech endpoint helpers
