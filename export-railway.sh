#!/bin/bash

echo "=========================================="
echo "📦 Export des données depuis Railway"
echo "=========================================="
echo ""

# Vérifier si la CLI Railway est installée
if ! command -v railway &> /dev/null; then
    echo "❌ La CLI Railway n'est pas installée"
    echo ""
    echo "Installation :"
    echo "  npm i -g @railway/cli"
    echo ""
    exit 1
fi

echo "📡 Connexion à Railway et export des données..."
railway run node export-data.js

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Export terminé !"
    echo ""
    echo "Pour télécharger les fichiers depuis Railway :"
    echo "1. Les fichiers sont dans le dossier /app/exports sur Railway"
    echo "2. Utilisez 'railway volumes' pour voir le volume"
    echo "3. Ou configurez un endpoint de téléchargement dans l'app"
    echo ""
    echo "Alternative : Exportez depuis local après avoir synchronisé la DB"
else
    echo ""
    echo "❌ L'export a échoué"
    exit 1
fi
