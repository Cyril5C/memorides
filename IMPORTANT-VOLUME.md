# ⚠️ IMPORTANT : Configuration du Volume Persistant

## 🚨 Problème actuel

Les traces GPX et photos sont stockées dans `/app/uploads` qui est **éphémère** par défaut sur Railway.

**Conséquence** : À chaque redéploiement, tous les fichiers sont perdus ! 😱

## ✅ Solution : Volume Persistant

Le fichier `railway.json` est déjà configuré pour utiliser un volume persistant :

```json
"volumeMounts": [
  {
    "mountPath": "/app/uploads",
    "volumeName": "uploads"
  }
]
```

## 📋 Action requise

**Vous devez créer le volume manuellement sur Railway :**

### Via l'interface web (recommandé)

1. Aller sur https://railway.app
2. Ouvrir votre projet MesRides
3. Cliquer sur votre service
4. Aller dans **Settings** → **Volumes**
5. Cliquer sur **"New Volume"**
6. Configurer :
   - **Name** : `uploads`
   - **Mount Path** : `/app/uploads`
7. Cliquer sur **"Create"**
8. Redéployer l'application

### Via la CLI Railway

```bash
# Installer la CLI
npm i -g @railway/cli

# Se connecter
railway login

# Lier au projet
railway link

# Créer et monter le volume
railway volume create uploads
railway volume mount uploads /app/uploads

# Redéployer
railway up
```

## 📖 Documentation complète

Voir le fichier `RAILWAY-VOLUME-SETUP.md` pour plus de détails.

## ✨ Après configuration

Une fois le volume créé :
- ✅ Les fichiers GPX persisteront entre les déploiements
- ✅ Les photos ne seront plus perdues
- ✅ Coût : Gratuit jusqu'à 1GB d'espace

---

**Ne pas oublier cette étape avant d'uploader vos vraies données !** 🎯
