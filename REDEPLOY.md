# Redeploy HoshiHits (any host, any account)

Your **code** is here on GitHub and your **data** is in Turso (a separate cloud
database). The hosting server is disposable — if it goes down or an account is
lost, follow this to bring the whole site (admin system + `/shop` store) back.
Nothing about your products/orders/settings is lost; they live in Turso.

## Environment variables (set these on the host)
Copy the VALUES from your old host's dashboard or your local `.env.local`
(never commit the values — this repo is public):

- `TURSO_DATABASE_URL`  ← the database (all your data)
- `TURSO_AUTH_TOKEN`
- `HOSHI_SECRET`        ← must stay the SAME or logins + the Telegram webhook break
- `GEMINI_API_KEY`
- `GEMINI_API_KEY_2`
- `GROQ_API_KEY`
- `GROQ_ENABLED`
- `POKEMON_TCG_API_KEY`
- `PSA_API_TOKEN`
- `UPC_API_KEY`

The Telegram bot token is stored in the database (Settings), not here.

## Deploy on Railway (fresh account)
1. `railway login` (opens the browser — sign into the account you want)
2. `railway init` → name it `hoshihits`
3. Add all env vars above (dashboard → Variables, or `railway variables --set "KEY=value"`)
4. Add a **Volume** mounted at `/data` (the DB cache lives there)
5. `railway up`  (builds via the Dockerfile)
6. It goes live at `https://<name>.up.railway.app`

## After it's live (point the bot + base URL at the new host)
- Set the `app_base_url` setting to the new URL.
- Re-register the Telegram webhook to `<newUrl>/api/telegram/webhook`
  (secret_token = HMAC-SHA256 of `HOSHI_SECRET` with the text `telegram-webhook`,
  first 40 hex chars; `allowed_updates: ["message","callback_query"]`).
  Easiest: open Settings in the app and press **Connect bot**.

## Deploy anywhere else
The app is a standard Next.js server: `npm ci && npm run build && npm start`
(listens on `$PORT`). Works on Render, Fly.io, a VPS, etc. — just set the same
env vars. On serverless (e.g. Vercel) switch the DB driver to Turso's HTTP
client `@libsql/client`.
