#!/bin/bash

echo "=========================================="
echo "🔍 Vérification de cohérence Railway"
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

echo "📡 Connexion à Railway et vérification..."
railway run node check-consistency.js

echo ""
echo "✅ Vérification terminée !"
