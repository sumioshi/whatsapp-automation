#!/bin/sh
# Instala o brain-sync no launchd do Mac (a cada 5 minutos) e roda uma vez agora.
set -eu
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/local.brain-sync.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.brain-sync</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>$REPO_DIR/scripts/brain-sync.sh</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/brain-sync.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/brain-sync.log</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict></plist>
PLIST
launchctl bootout "gui/$(id -u)/local.brain-sync" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sh "$REPO_DIR/scripts/brain-sync.sh"
echo "brain-sync instalado (a cada 5 min). Log: ~/Library/Logs/brain-sync.log"
