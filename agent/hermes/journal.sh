#!/bin/sh
# Script de surveillance pour la tâche planifiée du journal (hermes cron create --monitor-script).
# Sort les nouvelles entrées du journal ajoutées sur le site ou l'appli ; Hermes ne réveille l'agent que si
# la sortie change. La nuit (22 h – 7 h, heure de Paris), les entrées attendent le matin.
export TZ="${TZ:-Europe/Paris}"
NODE="${POTAGER_NODE:-$(command -v potager-node || echo "$HOME/.local/bin/potager-node")}"
exec "$NODE" "${POTAGER_DEPOT:-$HOME/potager}/agent/potager-mcp.mjs" journal
