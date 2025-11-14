# Guide de Sauvegarde et Restauration

Ce guide explique comment sauvegarder et restaurer vos données Memorides.

## 📦 Export (Sauvegarde)

### En local

Pour créer une sauvegarde complète de toutes vos données :

```bash
node export-data.js
```

Cela créera :
- Un dossier `exports/memorides-backup-YYYY-MM-DD/` contenant :
  - `database.json` : Export complet de la base de données
  - `gpx/` : Tous vos fichiers GPX
  - `photos/` : Toutes vos photos
  - `README.md` : Informations sur la sauvegarde
- Une archive ZIP : `exports/memorides-backup-YYYY-MM-DD.zip`

### Sur Railway (production)

```bash
./export-railway.sh
```

Ou directement :

```bash
railway run node export-data.js
```

**Note** : Les fichiers exportés seront dans le dossier `/app/exports` sur Railway. Pour les récupérer, vous devrez soit :
- Utiliser `railway ssh` pour accéder au serveur
- Créer un endpoint de téléchargement dans l'application
- Exporter depuis votre base locale après synchronisation

## 📥 Import (Restauration)

### Restaurer depuis une sauvegarde

```bash
node import-data.js exports/memorides-backup-YYYY-MM-DD
```

Ou depuis une archive ZIP décompressée :

```bash
unzip exports/memorides-backup-2025-11-14.zip -d /tmp/
node import-data.js /tmp/memorides-backup-2025-11-14
```

⚠️ **ATTENTION** : L'import va :
- Supprimer toutes les données actuelles
- Les remplacer par les données de la sauvegarde
- Copier tous les fichiers GPX et photos

### Sur Railway

```bash
railway run node import-data.js <chemin-de-la-sauvegarde>
```

## 🧹 Nettoyage

### En local

Pour vider complètement la base de données et les fichiers :

```bash
node cleanup-production.js --confirm
```

### Sur Railway

```bash
./cleanup-railway.sh
```

Ou :

```bash
railway run node cleanup-production.js --confirm
```

## 📋 Scripts disponibles

| Script | Description |
|--------|-------------|
| `export-data.js` | Exporte toutes les données (DB + fichiers) |
| `import-data.js` | Importe une sauvegarde complète |
| `cleanup-production.js` | Vide complètement la base et les fichiers |
| `export-railway.sh` | Export depuis Railway (helper) |
| `cleanup-railway.sh` | Nettoyage Railway (helper) |
| `check-db.js` | Affiche le contenu de la base de données |

## 💡 Cas d'usage

### Sauvegarder avant une mise à jour majeure

```bash
node export-data.js
# Conservez le fichier ZIP en lieu sûr
```

### Migrer vers un nouveau serveur

```bash
# Sur l'ancien serveur
node export-data.js

# Transférer le ZIP vers le nouveau serveur
scp exports/memorides-backup-*.zip user@new-server:/path/

# Sur le nouveau serveur
unzip memorides-backup-*.zip
node import-data.js memorides-backup-YYYY-MM-DD
```

### Restaurer après une erreur

```bash
# Trouver la dernière sauvegarde
ls -lt exports/

# Restaurer
node import-data.js exports/memorides-backup-YYYY-MM-DD
```

### Nettoyer et recommencer à zéro

```bash
node cleanup-production.js --confirm
```

## 🔄 Automatisation

### Sauvegarde automatique quotidienne (cron)

Ajoutez cette ligne à votre crontab (`crontab -e`) :

```bash
0 2 * * * cd /path/to/MesRides && node export-data.js >> logs/backup.log 2>&1
```

Cela créera une sauvegarde tous les jours à 2h du matin.

### Rotation des sauvegardes

Pour garder seulement les 7 dernières sauvegardes :

```bash
#!/bin/bash
cd /path/to/MesRides/exports
ls -t memorides-backup-*.zip | tail -n +8 | xargs rm -f
```

## 🚨 Notes importantes

1. **Les exports ne sont pas versionnés** : Ils sont dans `.gitignore` pour éviter d'alourdir le dépôt
2. **Stockez vos sauvegardes en lieu sûr** : Sur un disque externe, cloud, etc.
3. **Testez régulièrement vos sauvegardes** : Faites un import de temps en temps pour vérifier
4. **Railway volume** : Les données du volume persistent entre déploiements, mais faites quand même des backups réguliers
5. **Compression** : Les archives ZIP sont compressées (~90% pour les GPX)

## 📊 Taille des sauvegardes

Estimation approximative :
- 1 trace GPX : ~50-200 KB → ~5-20 KB compressé
- 1 photo : ~1-5 MB → ~800 KB-4 MB compressé
- Base de données : ~1-10 KB par trace

**Exemple** : 100 traces + 200 photos ≈ 220 MB → ~25 MB compressé

## ❓ Résolution de problèmes

### "Cannot find module '@prisma/client'"

```bash
npm install
npx prisma generate
```

### "ENOENT: no such file or directory"

Vérifiez que vous êtes dans le bon dossier :

```bash
cd /path/to/MesRides
pwd
```

### "Database error"

Vérifiez que la base de données est accessible :

```bash
node check-db.js
```

### L'import échoue en cours de route

La base peut être dans un état incohérent. Nettoyez et réessayez :

```bash
node cleanup-production.js --confirm
node import-data.js exports/memorides-backup-YYYY-MM-DD
```
