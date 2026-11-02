#!/bin/sh
# Script de surveillance pour la tâche planifiée des alertes (hermes cron create --monitor-script).
# À copier dans le dossier scripts du profil Hermes du jardinier. Hermes ne réveille l'agent que si
# la sortie change ; la nuit (22 h – 7 h) ou en cas d'erreur, la sortie précédente est répétée.
exec "${POTAGER_NODE:-node}" "${POTAGER_DEPOT:-$HOME/potager}/agent/potager-mcp.mjs" surveiller
