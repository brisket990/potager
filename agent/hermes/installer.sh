#!/bin/sh
# Installe (ou met à jour) le Jardinier sur la machine d'Hermes Agent, dans un profil séparé « jardinier ».
# Les autres profils ne sont pas touchés. Peut être relancé sans risque.
set -e
DEPOT="$HOME/potager"
PROFIL=jardinier
HERMES="$HOME/.local/bin/hermes"
P="$HOME/.hermes/profiles/$PROFIL"

echo "1. Code du potager dans $DEPOT"
if [ -d "$DEPOT/.git" ]; then git -C "$DEPOT" pull --ff-only; else git clone https://github.com/brisket990/potager.git "$DEPOT"; fi

echo "2. Lanceur Node : ~/.local/bin/potager-node"
install -D -m 755 "$DEPOT/agent/hermes/potager-node" "$HOME/.local/bin/potager-node"

echo "3. Profil Hermes « $PROFIL » (copie des réglages du modèle depuis « proxmox », sans ses bots ni sa mémoire)"
if [ ! -d "$P" ]; then "$HERMES" profile create "$PROFIL" --clone-from proxmox --description "Jardinier du potager familial"; fi

echo "4. Personnalité, compétence « potager » et script d'alertes"
cp "$DEPOT/agent/hermes/SOUL.md" "$P/SOUL.md"
mkdir -p "$P/skills/jardin"
rm -rf "$P/skills/jardin/potager"
cp -r "$DEPOT/agent/hermes/skills/potager" "$P/skills/jardin/"
install -D -m 755 "$DEPOT/agent/hermes/alertes.sh" "$P/scripts/potager-alertes.sh"

echo "5. Outils du potager (serveur MCP)"
if ! "$HERMES" -p "$PROFIL" mcp list 2>/dev/null | grep -q potager; then
  "$HERMES" -p "$PROFIL" mcp add potager --command "$HOME/.local/bin/potager-node" --args "$DEPOT/agent/potager-mcp.mjs" </dev/null
fi

echo "6. Dossier des livres : ~/potager-livres"
mkdir -p "$HOME/potager-livres"

echo "Terminé."
