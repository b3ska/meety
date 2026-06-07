# Deploy to `winnr` (PM2)

Persistent `next start` under PM2 on port 3000. Background ingest pipeline works
because the node process is long-lived.

## One-time on winnr
```bash
# ensure node 20+ and pm2
node -v
npm i -g pm2

# get the code there (pick one):
#  a) git clone <repo> && cd web
#  b) rsync from dev:  rsync -avz --exclude node_modules --exclude .next web/ winnr:~/winnr-app/
cd ~/winnr-app   # the web/ dir

npm ci
```

## Secrets — create `.env.local` on winnr
```
ASSEMBLYAI_API_KEY=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash
MUNINN_URL=http://localhost:8750/mcp        # local on winnr; or the tailnet URL below
MUNINN_TOKEN=mk_...                          # vault token
MUNINN_VAULT=winnr-hack
```
> Muninn runs on winnr itself — prefer the localhost endpoint to skip the tailnet hop.
> Confirm the local port (the MCP config used `:8750`).

## Build + run
```bash
npm run build
pm2 start ecosystem.config.js
pm2 save
pm2 logs winnr-meeting-intel   # watch ingest pipeline
```

## Expose
- Behind existing reverse proxy (Caddy/nginx) → proxy a hostname to `127.0.0.1:3000`.
- Or rely on the Tailscale hostname `winnr.tailf82123.ts.net` if a proxy already fronts it.

## Update after code change
```bash
git pull   # or rsync
npm run build
pm2 reload winnr-meeting-intel
```
