# JJ Bot Control

A starter dashboard for temporary Minecraft test bots on private servers you own or are explicitly authorized to test.

## Important architecture
- GitHub Pages hosts the static website only.
- The Node.js bot backend must run separately on a machine or hosting service that supports long-running Node.js processes.
- This starter currently supports **Minecraft Java Edition, offline-mode private test servers only**.
- Bedrock support and Microsoft account authentication are not implemented. They require separate protocol support and a secure per-user Microsoft sign-in flow.
- No combat/attack automation is included.

## Install through GitHub Actions

1. Put `build.yml` at the repository root in `.github/workflows/build.yml`.
2. Upload `JJ_Bot_Control.zip` anywhere inside the repository (a nested project folder is fine).
3. Push to the `main` branch.
4. The installer finds the ZIP, extracts the project beside it, renames the ZIP to `JJ_Bot_Control_installed.zip`, installs `launch.yml` at the repository root, and deploys the website.
5. In repository Settings → Pages, set Source to **GitHub Actions**.

The installer workflow must be committed to the repository before uploading the project ZIP. GitHub only discovers workflows from the repository-root `.github/workflows/` directory.

## Backend setup

Use Node.js 20+ on a separate host or your own computer.

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env` and set:
- `PORT=3000`
- `PUBLIC_ORIGIN` to your website origin
- `ALLOWED_SERVERS` to exact `host:port` values for private servers you control

Then run:

```bash
npm start
```

Set `public/config.js` `API_BASE` to your backend HTTPS URL before deploying the site.

## Safety and limitations
The backend enforces an exact server allowlist and a low bot limit. Use only servers you own or have explicit permission to test. Do not use the software to spam, grief, disrupt, exploit, or attack other servers or players.

This is a starter, not a publicly safe multi-user service. Before making it public, add real user authentication, abuse prevention, backend HTTPS, per-user authorization, monitoring, and secure secret management. Do not expose an unauthenticated bot-control backend to the internet.
