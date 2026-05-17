# Marisel — WhatsApp AI (v3)

Personal WhatsApp brain. Grok-powered, persistent memory, custom rules, games, stickers, status auto-view, reply-quoting.

## What's new in v3

- **Grok (xAI) brain** with full conversation history (last 60 msgs per chat) — multilingual, mirrors user's language.
- **Persistent SQLite memory** at `$DATA_DIR/marisel.db` (use Render disk at `/data`).
- **Style few-shots** loaded from `marisel_style.txt` (extracted from your real exported chat — bot literally mimics how you text).
- **Custom reply rules** — train via self-chat: `if someone says sasa respond poa sana uko aje`.
- **Sticker support** — drop `.webp` files in `src/sticker/`. Use `sticker` to send random. Train sticker rules: `sticker: lmao => laugh1.webp`.
- **Reply with quote** — every reply highlights the original message (the slide-to-reply thread look).
- **Auto status view** — silently views every status WhatsApp posts to you (toggle `AUTO_VIEW_STATUS=false` to disable).
- **Games**: trivia, riddle, number guess, rock-paper-scissors, dice, coin flip, 8-ball.
- **Reminders**: `remind me in 10 minutes to call mum`.
- **Fact memory**: bot silently learns names, ages, locations, jobs, birthdays.
- **Auto downloads**: paste a TikTok / IG / FB / Twitter / YouTube link.
- **Owner pause/resume** per chat: `marisel pause` / `marisel resume`.

## Self-chat training commands

Open WhatsApp → chat with **yourself** (your own number). Every message you send to yourself is interpreted as a command:

| You type | What happens |
|---|---|
| `help` | shows this list |
| `if someone says sasa respond poa sana uko aje` | saves a hard reply rule |
| `niaje => poa wewe?` | short form rule |
| `sticker: lmao => laugh1.webp` | trained sticker rule |
| `show training` / `show rules` | list current data |
| `remove training 3` / `remove rule 2` | delete by number |
| `clear training` / `clear rules` | wipe |
| `stickers` | list loaded sticker files |
| anything else | saved as a persona note (long-term flavor) |

## Deploy on Render

1. Push this folder to GitHub.
2. Render → New → Blueprint → pick your repo. Uses `render.yaml` (Starter plan + 1 GB persistent disk at `/data`).
3. Add env vars in dashboard or rely on `.env.example` values.
4. Open the service URL → scan QR with WhatsApp → Linked Devices → Link a Device.
5. Session persists in `/data/auth_info`. SQLite at `/data/marisel.db`. Restarts don't lose state.

## Local dev

```bash
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3000` for the QR.

## Stickers

Drop your `.webp` stickers into `src/sticker/`. They're committed to git so Render gets them too. No restart needed for new files — `stickers` command re-scans the folder.

## Tests after deploy

| Message (from another phone) | Expected |
|---|---|
| `Sema` | `poa, vipi wewe` |
| `play trivia` | trivia question |
| `roll dice` | `🎲 4` |
| `8ball will it rain` | random 8-ball |
| `sticker` | random sticker |
| `remind me in 30 seconds to test` | confirms + pings in 30s |
| paste TikTok link | downloads it |

After you train `if someone says sasa respond poa sana uko aje` from self-chat, any "sasa" you receive triggers exactly that reply, quoted on the original message.
