#!/bin/sh
# Sobe o Tailscale (se TS_AUTHKEY estiver setada) e depois coletor + painel.
# Em userspace networking (Railway/Cloud Run não têm /dev/net/tun), o painel
# é exposto na tailnet via `tailscale serve` — SÓ na rede privada, sem domínio
# público. Sem TS_AUTHKEY, segue sem Tailscale (ex.: só com domínio + Basic Auth).

if [ -n "$TS_AUTHKEY" ]; then
  mkdir -p /data/tailscale /var/run/tailscale
  echo "[ts] iniciando tailscaled (userspace)..."
  tailscaled \
    --tun=userspace-networking \
    --statedir=/data/tailscale \
    --socket=/var/run/tailscale/tailscaled.sock &
  sleep 3
  echo "[ts] autenticando na tailnet (hostname=wa-painel)..."
  tailscale --socket=/var/run/tailscale/tailscaled.sock up \
    --authkey="$TS_AUTHKEY" --hostname=wa-painel --accept-dns=false \
    || echo "[ts] AVISO: 'up' falhou (key inválida/expirada?)."
  echo "[ts] expondo o painel (porta 8080) na tailnet via HTTPS..."
  tailscale --socket=/var/run/tailscale/tailscaled.sock serve --bg 8080 \
    || echo "[ts] AVISO: 'serve' falhou — habilite HTTPS Certificates + MagicDNS na tailnet."
  tailscale --socket=/var/run/tailscale/tailscaled.sock status 2>&1 | head -5 || true
fi

exec npm run start:cloud
