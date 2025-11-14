#!/bin/bash

echo "=========================================="
echo "🧹 Nettoyage de la production Railway"
echo "=========================================="
echo ""
echo "Ce script va :"
echo "1. Se connecter à Railway"
echo "2. Exécuter le script de nettoyage"
echo "3. Supprimer toutes les données (DB + fichiers)"
echo ""
read -p "Êtes-vous sûr de vouloir continuer ? (tapez 'oui' pour confirmer) : " confirm

if [ "$confirm" != "oui" ]; then
    echo "❌ Annulé"
    exit 0
fi

echo ""
echo "📦 Connexion à Railway..."

# Vérifier si la CLI Railway est installée
if ! command -v railway &> /dev/null; then
    echo "❌ La CLI Railway n'est pas installée"
    echo ""
    echo "Installation :"
    echo "  npm i -g @railway/cli"
    echo ""
    exit 1
fi

# Exécuter le script de nettoyage sur Railway
echo "🧹 Exécution du nettoyage..."
railway run node cleanup-production.js --confirm

echo ""
echo "=========================================="
echo "✅ Nettoyage terminé !"
echo "=========================================="
