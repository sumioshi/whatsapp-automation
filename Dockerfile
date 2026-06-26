# Coletor (Baileys, daemon 24/7) + Painel (Next.js) num só container, para que
# ambos compartilhem o volume /data. ffmpeg fica disponível p/ o ver_video.
# A transcrição na nuvem usa OpenRouter (MLX é só Apple Silicon) — ver lib/transcribe.
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Tailscale (acesso privado ao painel — sem exposição pública). Ignora o
# erro de systemctl do install.sh (em container iniciamos o daemon na mão).
RUN curl -fsSL https://tailscale.com/install.sh | sh || true; \
  command -v tailscaled && command -v tailscale

WORKDIR /app

# 1) deps do coletor (raiz). O postinstall roda patch-package (precisa de patches/).
COPY package.json package-lock.json ./
COPY patches ./patches
RUN npm ci

# 2) deps do painel
COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci

# 3) código + build: coletor (tsc -> dist/) e painel (next build -> web/.next)
COPY . .
RUN npm run build && npm --prefix web run build

ENV NODE_ENV=production
RUN chmod +x docker-entrypoint.sh
# entrypoint: sobe o Tailscale (se TS_AUTHKEY) e depois coletor + painel juntos.
CMD ["sh", "/app/docker-entrypoint.sh"]
