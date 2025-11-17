# Vérification de Cohérence en Production

## Option 1 : Via Railway CLI (Recommandé)

```bash
# 1. Lier le projet Railway
railway link

# 2. Lancer la vérification
railway run node check-consistency.js
```

## Option 2 : Via Logs Railway

1. Aller sur **Railway Dashboard** → votre projet
2. Cliquer sur **Deployments**
3. Chercher dans les logs au démarrage :

```
Step 4: Final check before starting server...
Upload directory contents:
total ...
-rw-r--r-- ... fichier1.gpx
-rw-r--r-- ... fichier2.gpx
```

Comparez avec le nombre de tracks en DB visible dans l'app.

## Option 3 : Via Interface Web

Ajoutez temporairement un endpoint dans `server.js` :

```javascript
app.get('/api/admin/consistency', async (req, res) => {
    const fs = require('fs');
    const tracks = await prisma.track.findMany();
    const files = fs.readdirSync(gpxDir);

    res.json({
        tracksInDB: tracks.length,
        filesOnDisk: files.length,
        trackFilenames: tracks.map(t => t.filename),
        diskFiles: files
    });
});
```

Puis accédez à `https://votre-app.railway.app/api/admin/consistency`

## Ce que vous devriez vérifier

✅ **Nombre de fichiers GPX = Nombre de tracks en DB**
✅ **Tous les fichiers listés dans les logs existent en DB**
✅ **Toutes les traces visibles dans l'app ont leur fichier**

## Problèmes Courants

### Traces manquantes dans l'app mais fichiers présents

**Cause** : Entrées DB manquantes ou nom de fichier incorrect en DB

**Solution** :
1. Vérifier les logs Railway : `Step 4: Final check...`
2. Compter les fichiers
3. Si fichiers > tracks DB : Ré-uploader les traces manquantes

### Traces visibles mais fichier introuvable

**Cause** : Fichier supprimé mais DB pas nettoyée

**Solution** :
```sql
-- Supprimer les tracks sans fichier (à faire manuellement)
DELETE FROM "TrackLabel" WHERE "trackId" = 'xxx';
DELETE FROM "Track" WHERE filename = 'fichier-manquant.gpx';
```

Ou utilisez le script de nettoyage :
```bash
node cleanup-production.js --confirm
```
