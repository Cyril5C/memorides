# Guide de Backup Automatique - Memorides

## 📦 Solutions de Backup Disponibles

### Solution 1 : GitHub Actions (Recommandé pour Production)

Backup automatique hebdomadaire via GitHub Actions.

**Avantages** :
- ✅ Gratuit
- ✅ Automatique (tous les dimanches à 3h)
- ✅ Backup COMPLET (BDD + GPX + Photos)
- ✅ Stockage sécurisé sur GitHub
- ✅ Historique de 90 jours

**Configuration** :

1. Créer un token Railway :
   - Aller sur https://railway.app/account/tokens
   - Créer un nouveau token nommé "GitHub Actions Backup"
   - Copier le token

2. Dans GitHub → Settings → Secrets → Actions :
   - Créer `RAILWAY_TOKEN` avec le token copié

3. Le backup s'exécute automatiquement chaque dimanche à 3h (UTC)

4. Lancer un backup manuel :
   - GitHub → Actions → "Weekly Backup" → "Run workflow"

5. Télécharger un backup :
   - GitHub → Actions → Choisir un workflow → "Artifacts"

---

### Solution 2 : Scheduler Local (Développement/Serveur)

Backup automatique sur votre machine locale ou serveur.

**Installation** :
```bash
npm install
```

**Lancer le scheduler** :
```bash
npm run backup-scheduler
```

**Configuration** :
- Planning : Tous les dimanches à 3h (modifiable dans `backup-scheduler.js`)
- Rétention : 30 jours (modifiable)
- Emplacement : `./exports/`

**Tester immédiatement** :
```bash
npm run backup
```

---

## 📊 Contenu des Backups

Chaque backup contient :

1. **database.json** : Export complet de la base de données
   - Toutes les traces avec métadonnées
   - Tous les labels
   - Toutes les photos (métadonnées)
   - Types de traces

2. **gpx/** : Tous les fichiers GPX
   - Fichiers sources de toutes les traces

3. **photos/** : Toutes les photos géotaggées
   - Photos en pleine résolution

4. **README.md** : Instructions de restauration

---

## 🔄 Restaurer un Backup

### Depuis un backup local

```bash
# 1. Extraire l'archive (si ZIP)
unzip memorides-backup-2024-01-15.zip

# 2. Restaurer (script à créer si besoin)
node import-data.js memorides-backup-2024-01-15
```

### Restauration manuelle

```bash
# 1. Copier les fichiers
cp -r backup/gpx/* uploads/gpx/
cp -r backup/photos/* uploads/photos/

# 2. Importer la base de données
# Via Prisma Studio ou script d'import personnalisé
```

---

## 🗑️ Nettoyage Automatique

Le scheduler supprime automatiquement les backups de plus de 30 jours.

Pour modifier la rétention, éditer `backup-scheduler.js` :
```javascript
const BACKUP_RETENTION_DAYS = 30; // Modifier ici
```

---

## 📁 Structure des Backups

```
exports/
├── memorides-backup-2024-01-15/
│   ├── database.json       # Base de données
│   ├── gpx/               # Fichiers GPX
│   │   ├── trace1.gpx
│   │   └── trace2.gpx
│   ├── photos/            # Photos
│   │   ├── photo1.jpg
│   │   └── photo2.jpg
│   └── README.md          # Instructions
└── memorides-backup-2024-01-15.zip  # Archive compressée
```

---

## 🔧 Commandes Utiles

```bash
# Backup manuel immédiat
npm run backup

# Lancer le scheduler (background)
npm run backup-scheduler

# Export depuis Railway (production)
npm run backup-prod

# Lister les backups
ls -lh exports/

# Taille des backups
du -sh exports/*
```

---

## ⚠️ Important

### Sécurité
- ⚠️ Les backups contiennent toutes vos données personnelles
- ⚠️ Ne pas commiter les backups dans Git (déjà dans `.gitignore`)
- ⚠️ Sauvegarder les backups sur un stockage externe sécurisé

### Espace Disque
- Chaque backup peut être volumineux (photos + GPX)
- Vérifier l'espace disque disponible régulièrement
- Ajuster la rétention selon vos besoins

### Production (Railway)
- Les backups GitHub Actions sauvegardent uniquement la base de données
- Les fichiers (GPX/photos) doivent être téléchargés séparément depuis Railway
- Utiliser `railway volumes` pour accéder aux fichiers

---

## 📞 Dépannage

### Le scheduler ne démarre pas
```bash
# Vérifier l'installation
npm list node-cron

# Réinstaller si nécessaire
npm install node-cron
```

### Backup échoue
```bash
# Vérifier les permissions
ls -la exports/

# Créer le dossier si nécessaire
mkdir -p exports
```

### GitHub Actions échoue
- Vérifier que `RAILWAY_TOKEN` est configuré dans les secrets
- Vérifier les logs dans GitHub Actions

---

## 📅 Calendrier de Backup

Par défaut :
- **Fréquence** : Hebdomadaire (dimanche 3h)
- **Rétention** : 90 jours (GitHub) / 30 jours (local)
- **Emplacement** : `exports/` (local) / Artifacts (GitHub)

Pour modifier le calendrier, éditer :
- Local : `backup-scheduler.js` (ligne `cron.schedule`)
- GitHub : `.github/workflows/weekly-backup.yml` (section `cron`)
