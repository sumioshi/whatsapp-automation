# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: go to the [Security tab](https://github.com/sumioshi/wacrew/security) and click **Report a vulnerability**. Include what you found, how to reproduce it and the version or commit you tested.

You will get a first answer within 3 business days. Once the issue is confirmed, the fix is prioritized by severity, and you are credited in the release notes unless you prefer otherwise.

## Supported versions

WACrew is self-hosted and released from `main`. Security fixes land on the latest release and on `main`; older versions do not receive patches, so keep your deployment updated (`git pull && docker compose up -d --build`, or `npx -y wacrew-mcp@latest` for the MCP package).

## Scope

In scope:

- The collector, the web panel and its API routes, including authentication and per-chat team access.
- The MCP server (`web/mcp/` and the `wacrew-mcp` npm package).
- The Docker image and `docker-compose.yml` defaults.

Out of scope:

- Vulnerabilities in WhatsApp itself or in [Baileys](https://github.com/WhiskeySockets/Baileys); report those upstream.
- Account bans or restrictions applied by WhatsApp. WACrew uses an unofficial client, as stated in the README.
- Deployments that ignore the hardening below.

## Hardening checklist for self-hosting

- Always set `PANEL_USER` and `PANEL_PASS`. Without them the panel is open to anyone who can reach it.
- Put HTTPS in front of the panel (Caddy, a tunnel or your platform's proxy) before exposing it to the internet.
- Never expose the control API (port `4310`) or the local transcriber (port `4320`). They only listen on `127.0.0.1` by design.
- Treat the data volume (`/data`, or `auth/` and `data/` locally) as sensitive: it holds the WhatsApp session and every collected message.
- Keep secrets in `.env` or your platform's secret store, never in the repository.
