# Configuration du Volume Persistant Railway

## 🎯 Objectif
Créer un volume persistant pour que les fichiers GPX et photos ne soient pas perdus lors des redéploiements.

## 📋 Étapes de configuration

### 1. Accéder à votre projet Railway
1. Aller sur [railway.app](https://railway.app)
2. Ouvrir votre projet MesRides

### 2. Créer le volume
1. Cliquer sur votre service (celui qui contient l'application Node.js)
2. Aller dans l'onglet **"Settings"** ou **"Variables"**
3. Chercher la section **"Volumes"** ou **"Storage"**
4. Cliquer sur **"New Volume"** ou **"Add Volume"**

### 3. Configurer le volume
Utiliser les paramètres suivants :
- **Volume Name**: `uploads`
- **Mount Path**: `/app/uploads`

> ⚠️ Important : Le nom du volume (`uploads`) doit correspondre au `volumeName` dans `railway.json`

### 4. Redéployer l'application
1. Aller dans l'onglet **"Deployments"**
2. Cliquer sur **"Redeploy"** ou faire un nouveau push Git

Railway va :
- Créer le volume persistant
- Monter le volume sur `/app/uploads`
- Les fichiers dans ce dossier persisteront entre les déploiements

## ✅ Vérification

Après le redéploiement :

1. **Uploader une trace GPX**
   - Aller sur votre application
   - Cliquer sur le bouton +
   - Importer un fichier GPX

2. **Redéployer l'application**
   - Faire un nouveau commit et push
   - Ou utiliser "Redeploy" dans Railway

3. **Vérifier la persistance**
   - Retourner sur l'application
   - La trace doit toujours être là ! 🎉

## 💰 Coût du volume

Railway facture les volumes selon l'espace utilisé :
- **Gratuit** : Premiers 1GB inclus dans le plan
- **Payant** : ~$0.25/GB/mois au-delà de 1GB

Estimation pour votre usage :
- Fichiers GPX : ~50-200 KB par trace
- Photos : ~1-5 MB par photo
- **100 traces + 200 photos** ≈ 220 MB → **Gratuit** ✅

## 🐛 Dépannage

### Le volume n'apparaît pas
- Vérifier que vous utilisez Railway V2 (nouveau dashboard)
- Certains plans peuvent ne pas avoir accès aux volumes
- Contacter le support Railway si besoin

### Les fichiers sont toujours perdus
1. Vérifier que le volume est bien monté :
   ```bash
   # Dans les logs Railway, chercher :
   "Mounted volume 'uploads' at /app/uploads"
   ```

2. Vérifier que `railway.json` est bien commité :
   ```bash
   git status
   # railway.json ne doit pas être dans les fichiers modifiés
   ```

3. Vérifier les permissions du dossier :
   - Railway doit avoir les droits d'écriture sur `/app/uploads`
   - Le code crée automatiquement les sous-dossiers `gpx/` et `photos/`

### Alternative : Utiliser la CLI Railway

Si l'interface web ne fonctionne pas :

```bash
# Installer la CLI
npm i -g @railway/cli

# Se connecter
railway login

# Lister les volumes
railway volumes

# Créer un volume
railway volumes create uploads

# Lier le volume au service
railway volumes mount uploads /app/uploads
```

## 📊 Monitoring de l'espace

Pour voir l'espace utilisé :
1. Railway Dashboard → Votre service → Settings → Volumes
2. Vous verrez l'espace utilisé et disponible

## 🔄 Backup (Optionnel)

Pour sauvegarder vos données périodiquement :

### Option 1 : Export manuel
1. Télécharger toutes vos traces GPX via l'interface
2. Sauvegarder sur votre ordinateur

### Option 2 : Script automatique (futur)
Créer un script qui exporte automatiquement :
- La base de données PostgreSQL
- Le contenu du volume

---

**Une fois le volume configuré, vos données persisteront même après les redéploiements !** 🎉
