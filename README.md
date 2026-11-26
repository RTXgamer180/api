# JJ Bot Control

A starter project for a **private, permission-based Minecraft bot dashboard**.

## Included in this starter
- GitHub Pages frontend (`public/`)
- Node.js + Express + Socket.IO backend (`server/`)
- Mineflayer bot engine
- Random bot usernames
- Chat, walk, jump, stop, status and disconnect controls
- Session cleanup when a dashboard disconnects
- Exact server allowlist, per-session bot limit and rate limits
- Offline-mode support for private test servers you own

## Important compatibility note
GitHub Pages only hosts static files. The Node.js backend must run separately on a machine/server you control.

This starter intentionally does **not** connect to arbitrary public servers, bypass authentication, or automate attacking players. It is designed for private servers you own or have explicit permission to test.

### Authentication
- `offline` mode is supported for your own private offline-mode test server.
- `microsoft` mode is reserved in the UI but disabled in this starter. A proper per-user Microsoft OAuth/device-code flow must be added before enabling it. Do not collect Microsoft passwords or share one Microsoft session between users.

## 1. Requirements
- Node.js 20+
- A private Minecraft Java server you own, configured for offline mode if using the offline test option
- A host for the backend that can keep Node.js running

## 2. Install
```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:
```env
PORT=3000
PUBLIC_ORIGIN=http://localhost:8080
ALLOWED_SERVERS=127.0.0.1:25565
MAX_BOTS_PER_SESSION=1
BOT_CONNECT_TIMEOUT_MS=20000
```

`ALLOWED_SERVERS` is a comma-separated list of exact `host:port` entries. Add only private servers you own or are explicitly authorized to test.

## 3. Run locally
Terminal 1:
```bash
cd server
npm start
```

Terminal 2 (serve the static frontend):
```bash
npx serve public -l 8080
```
Open `http://localhost:8080`.

For local testing, the frontend and backend must be on the same computer. Set `PUBLIC_ORIGIN` to the frontend origin.

## 4. Deploy the website to GitHub Pages
1. Create a GitHub repository named `JJ-Bot-Control`.
2. Upload the contents of this project.
3. In GitHub, open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/public` (or move the contents of `public/` to the root if your Pages setup does not offer a folder selector).
5. Update `public/config.js` so `API_BASE` is your backend HTTPS URL.
6. Set the backend `PUBLIC_ORIGIN` to your GitHub Pages origin, for example `https://YOURNAME.github.io`.

Do not expose the backend without HTTPS, authentication, and a restrictive server allowlist. This starter is intended for a trusted private test deployment, not an unrestricted public bot service.

## 5. Minecraft version
Mineflayer protocol support depends on its current release. If your server version is not supported, update Mineflayer and its dependencies after checking their compatibility.

## Disclaimer
Use JJ Bot Control only on Minecraft servers you own or have explicit permission to test. Do not use it to spam, grief, disrupt, exploit, or attack other players or servers. You are responsible for complying with server rules and applicable laws.
