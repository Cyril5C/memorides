# Guide de déploiement sur Railway

## 📋 Checklist avant déploiement

✅ Les fichiers suivants sont configurés :
- `railway.json` - Configuration du build et déploiement
- `Procfile` - Commandes de démarrage
- `prisma/schema.prisma` - Configuré pour PostgreSQL
- `.dockerignore` - Exclut les fichiers inutiles
- `package.json` - Dépendances et scripts

## 🚀 Étapes de déploiement

### 1. Préparer le code

**A. Vérifier le statut Git**
```bash
git status
```

**B. Commit les dernières modifications**
```bash
git add .
git commit -m "feat: Add labels system and prepare for Railway deployment

- Add Label and TrackLabel models for many-to-many relationships
- Add download GPX functionality
- Configure PostgreSQL for production
- Update Dockerfile with dummy DATABASE_URL for build
- Exclude prisma.config.ts from Docker build"
```

**C. Push sur GitHub**
```bash
# Si vous n'avez pas encore de remote
git remote add origin https://github.com/VOTRE-USERNAME/MesRides.git

# Push
git push -u origin main
```

### 2. Créer le projet Railway

**A. Se connecter à Railway**
1. Aller sur [railway.app](https://railway.app)
2. Se connecter avec GitHub
3. Cliquer sur "New Project"

**B. Créer le projet depuis GitHub**
1. Sélectionner "Deploy from GitHub repo"
2. Choisir votre repository "MesRides"
3. Railway va automatiquement détecter que c'est une application Node.js

### 3. Ajouter PostgreSQL

**A. Ajouter une base de données**
1. Dans votre projet Railway, cliquer sur "New" → "Database" → "Add PostgreSQL"
2. Railway va créer une base de données et générer automatiquement `DATABASE_URL`

**B. Vérifier les variables d'environnement**
Railway configure automatiquement :
- `DATABASE_URL` - URL de connexion PostgreSQL
- `PORT` - Port assigné par Railway

Pas besoin d'ajouter manuellement ces variables !

### 4. Configurer le déploiement

**A. Vérifier la détection automatique**
Railway devrait automatiquement :
- Détecter `railway.json`
- Installer les dépendances avec `npm install`
- Générer le client Prisma avec `npx prisma generate`
- Appliquer les migrations avec `npx prisma migrate deploy`
- Démarrer avec `node server.js`

**B. Variables d'environnement optionnelles**
Si besoin, ajouter dans l'onglet "Variables" :
```
NODE_ENV=production
```

### 5. Déployer

**A. Premier déploiement**
Railway va automatiquement :
1. Builder l'application
2. Appliquer les migrations Prisma
3. Démarrer le serveur

Vous pouvez suivre les logs en temps réel dans l'onglet "Deployments"

**B. Vérifier le déploiement**
1. Attendre que le statut soit "Active" (vert)
2. Cliquer sur l'URL générée (ex: `https://mesrides-production.up.railway.app`)
3. Tester l'application :
   - La carte doit s'afficher
   - Importer un fichier GPX
   - Ajouter des libellés
   - Vérifier la persistance des données

### 6. Configuration du domaine (Optionnel)

**A. Domaine Railway**
Railway génère automatiquement un domaine `*.up.railway.app`

**B. Domaine personnalisé**
1. Aller dans "Settings" → "Domains"
2. Cliquer sur "Custom Domain"
3. Ajouter votre domaine (ex: `mesrides.mondomaine.com`)
4. Configurer les DNS chez votre registrar :
   ```
   Type: CNAME
   Name: mesrides
   Value: <votre-projet>.up.railway.app
   ```

## 🔍 Vérifications post-déploiement

### Logs de l'application
```
Railway Dashboard → Deployments → Cliquer sur le déploiement → Logs
```

Vérifier :
- ✅ "🚀 Server running on http://localhost:XXXX"
- ✅ "📁 GPX files: /app/uploads/gpx"
- ✅ "📸 Photos: /app/uploads/photos"
- ✅ "🗄️  Database: postgresql://..."

### Tests fonctionnels

1. **Upload GPX**
   - [ ] Cliquer sur le bouton "+"
   - [ ] Sélectionner un fichier GPX
   - [ ] Vérifier que la trace s'affiche sur la carte

2. **Libellés**
   - [ ] Cliquer sur une trace
   - [ ] Cliquer sur "Modifier"
   - [ ] Ajouter des libellés (ex: "Paris", "Vélo")
   - [ ] Sauvegarder et vérifier qu'ils sont conservés

3. **Téléchargement**
   - [ ] Cliquer sur une trace
   - [ ] Cliquer sur "Télécharger GPX"
   - [ ] Vérifier que le fichier se télécharge

4. **Persistance**
   - [ ] Redémarrer l'application (Settings → Restart)
   - [ ] Vérifier que les données sont toujours là

### API Health Check
```bash
curl https://votre-app.up.railway.app/api/health
```

Devrait retourner :
```json
{
  "status": "ok",
  "message": "Server and database are running"
}
```

## 🐛 Résolution des problèmes

### Le build échoue

**Problème: "Missing required environment variable: DATABASE_URL"**
```
Solution: C'est normal pendant le build. Le Dockerfile utilise une URL dummy.
Vérifier que .dockerignore exclut bien prisma.config.ts
```

**Problème: "Command failed: npx prisma migrate deploy"**
```
Solution: Vérifier que PostgreSQL est bien ajouté au projet
Aller dans l'onglet "Variables" et vérifier que DATABASE_URL existe
```

### L'application ne démarre pas

**Problème: "Port already in use"**
```
Solution: Railway gère automatiquement le PORT
Vérifier que server.js utilise process.env.PORT
```

**Problème: "Database connection error"**
```
Solution:
1. Vérifier que PostgreSQL est "Active"
2. Redémarrer l'application
3. Vérifier les logs de PostgreSQL
```

### Les fichiers ne persistent pas

**Problème: "Fichiers GPX/photos disparus après redémarrage"**
```
Solution: C'est normal sur Railway V1 (ephemeral filesystem)
Options:
1. Utiliser Railway Volumes (nouveau)
2. Utiliser un stockage externe (S3, Cloudinary)
3. Accepter que les fichiers soient temporaires
```

**Note importante**: Railway utilise un système de fichiers éphémère. Les fichiers uploadés dans `uploads/` seront perdus lors d'un redémarrage. Pour la production, il est recommandé d'utiliser :
- Railway Volumes (si disponible)
- AWS S3 / Google Cloud Storage
- Cloudinary pour les photos

Les **métadonnées** (titres, commentaires, libellés) sont stockées en base de données et **persistent correctement**.

## 🔄 Déploiements ultérieurs

Pour déployer de nouvelles modifications :

```bash
# 1. Faire vos modifications
# 2. Commit
git add .
git commit -m "feat: Description des modifications"

# 3. Push
git push origin main
```

Railway détectera automatiquement le push et redéploiera l'application.

## 📊 Monitoring

### Métriques disponibles
- CPU usage
- Memory usage
- Network traffic
- Request count

Disponibles dans : Railway Dashboard → Metrics

### Logs en temps réel
```bash
# Installer Railway CLI
npm i -g @railway/cli

# Se connecter
railway login

# Suivre les logs
railway logs
```

## 💰 Coûts

Railway offre :
- **$5 de crédits gratuits par mois**
- Ensuite facturation à l'usage :
  - ~$0.000463/GB-hour pour mémoire
  - ~$0.000463/vCPU-hour pour CPU

Estimation pour cette app :
- Base de données PostgreSQL : ~$5-10/mois
- Application Node.js : ~$3-7/mois
- Total : ~$8-17/mois (selon usage)

## 🔒 Sécurité

### Recommandations
1. ✅ Variables d'environnement automatiquement sécurisées
2. ✅ HTTPS automatique sur tous les domaines Railway
3. ⚠️ Ajouter une authentification utilisateur (TODO)
4. ⚠️ Limiter les uploads (déjà configuré à 50MB)
5. ⚠️ Ajouter rate limiting pour éviter les abus

## 📈 Optimisations futures

1. **Stockage externe**
   - Migrer les uploads vers S3/Cloudinary
   - Garder uniquement les métadonnées en DB

2. **CDN**
   - Utiliser Cloudflare devant Railway
   - Cache des assets statiques

3. **Scaling**
   - Railway scale automatiquement
   - Ajuster les limites de mémoire si besoin

4. **Monitoring avancé**
   - Ajouter Sentry pour error tracking
   - Ajouter analytics

## ✅ Checklist finale

Avant de considérer le déploiement comme réussi :

- [ ] Application accessible via l'URL Railway
- [ ] PostgreSQL connecté et fonctionnel
- [ ] Import de traces GPX fonctionne
- [ ] Système de libellés fonctionne
- [ ] Téléchargement GPX fonctionne
- [ ] Données persistent après redémarrage
- [ ] Pas d'erreurs dans les logs
- [ ] API /api/health retourne "ok"
- [ ] Performance acceptable (< 2s de chargement)

## 🎉 Félicitations !

Votre application MesRides est maintenant déployée en production sur Railway avec PostgreSQL !

URL à partager : `https://votre-app.up.railway.app`

---

**Besoin d'aide ?**
- Documentation Railway : https://docs.railway.app
- Discord Railway : https://discord.gg/railway
