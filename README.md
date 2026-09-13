# Watch Together

A private watch-party app for you and your partner: paste a YouTube link, share a room code, and watch in sync with chat and reactions. No accounts, no sign-up.

## Running it

```bash
npm run dev
```

This starts the backend (port 4000) and the web app (port 5173). Open http://localhost:5173, enter your name, and click **Start Watching** to create a room. Copy the invite link (or room code) and send it to your partner.

## Using it together

- **Same WiFi (e.g. you on your PC, her on a tablet at home):** Vite prints a `Network:` URL like `http://192.168.1.105:5173` — use that instead of `localhost` on the other device.
- **Long distance (different networks/countries) — this is the real use case:** your partner can't reach `localhost` or your home network, so the server needs a public URL. Two options:
  1. **Quick tunnel (easiest, good for tonight):** install [ngrok](https://ngrok.com/download), run `npm run start` here (builds the app and serves everything from port 4000), then in another terminal run `ngrok http 4000`. Send her the `https://...ngrok-free.app` link it gives you.
  2. **Permanent link (better long-term):** deploy the `server` folder (which also serves the built client) to a free host like Render or Fly.io, so you always have the same URL to share. Ask me when you're ready and I'll set it up.

## How it works

- `server/` — Node + Express + Socket.IO. Holds room state (who's in the room, what's playing, chat) and broadcasts play/pause/seek events to everyone in the room.
- `client/` — React app. Plays the YouTube video via the YouTube IFrame API, and corrects small timing drift automatically every couple of seconds so you both stay within ~1.5s of each other.
- No video is ever uploaded to or stored by the server — it only synchronizes playback *metadata* (position, play/pause state) between browsers. The video itself streams from YouTube to each person directly.

## What's not in here yet

This is the MVP: room + YouTube sync + chat + reactions + host controls. Not included yet (let me know if you want any of these next):
- Voice/video calling (so you can hear/see each other while watching)
- Other sources (local video files, Netflix/Disney+ etc. via a browser extension)
- Watchlist / watch history / scheduling
