# Résolution du problème "Application failed to respond" sur Railway

## 🔍 Diagnostic

Erreur : **Application failed to respond**
Request ID: `Lfdl4nHsSWOri-inw9P4nw`

Cette erreur indique que l'application ne répond pas aux requêtes HTTP. Plusieurs causes possibles :

## 📋 Checklist de diagnostic

### 1. Vérifier les logs de déploiement

**Dans Railway Dashboard:**
1. Aller dans votre projet
2. Cliquer sur le service "app" ou "web"
3. Onglet "Deployments" → Cliquer sur le dernier déploiement
4. Regarder les logs

**Ce qu'il faut chercher:**

#### ✅ Build réussi
```
✓ Built in XXs
✓ Pushed to registry
```

#### ✅ Migrations appliquées
```
npx prisma migrate deploy
✓ Migrations applied
```

#### ❌ Erreurs possibles

**Erreur 1: Port incorrect**
```
Error: listen EADDRINUSE: address already in use
```
**Solution:** Vérifier que `server.js` utilise `process.env.PORT`

**Erreur 2: DATABASE_URL manquante**
```
Error: Environment variable not found: DATABASE_URL
```
**Solution:** Vérifier que PostgreSQL est bien ajouté au projet

**Erreur 3: Migration échoue**
```
Error: P3009: Migrate failed
```
**Solution:** Problème avec les migrations Prisma

**Erreur 4: Application crash au démarrage**
```
Error: Cannot find module
```
**Solution:** Dépendances manquantes ou problème de build

### 2. Vérifier le PORT dans server.js

Ouvrir `server.js` et vérifier que le port est bien dynamique :

```javascript
const PORT = process.env.PORT || 8080;
```

Railway attribue un port dynamique via `process.env.PORT`.

### 3. Vérifier que PostgreSQL est connecté

**Dans Railway Dashboard:**
1. Vérifier que le service PostgreSQL est "Active" (vert)
2. Aller dans "Variables" du service app
3. Vérifier que `DATABASE_URL` existe et pointe vers PostgreSQL

La variable devrait ressembler à :
```
postgresql://postgres:xxx@containers-us-west-xxx.railway.app:5432/railway
```

### 4. Vérifier les migrations Prisma

**Problème potentiel:** Les migrations ne s'appliquent pas correctement

**Solutions:**

#### Option A: Forcer les migrations manuellement
```bash
# Installer Railway CLI
npm i -g @railway/cli

# Se connecter
railway login

# Lier le projet
railway link

# Exécuter les migrations
railway run npx prisma migrate deploy
```

#### Option B: Reset de la base de données
⚠️ **Attention: Cela supprime toutes les données!**

Dans Railway Dashboard:
1. Aller sur le service PostgreSQL
2. Variables → Trouver DATABASE_URL
3. Se connecter avec un client PostgreSQL
4. Supprimer toutes les tables
5. Redéployer l'application

### 5. Vérifier la configuration railway.json

Notre `railway.json` actuel :
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npx prisma generate && npx prisma migrate deploy"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Problème possible:** Les migrations dans `buildCommand` peuvent échouer si la DB n'est pas disponible pendant le build.

**Solution:** Utiliser le Procfile pour les migrations au runtime.

### 6. Tester avec le Procfile

Supprimer ou modifier `railway.json` pour utiliser le `Procfile` :

Notre `Procfile` :
```
web: node server.js
release: npx prisma migrate deploy
```

Le `release` hook exécute les migrations AVANT de démarrer le serveur.

## 🔧 Solutions rapides

### Solution 1: Utiliser uniquement le Procfile

Renommer ou supprimer `railway.json` temporairement :

```bash
mv railway.json railway.json.backup
git add .
git commit -m "test: Use Procfile instead of railway.json"
git push origin main
```

Railway utilisera alors automatiquement le `Procfile`.

### Solution 2: Simplifier railway.json

Modifier `railway.json` pour ne pas exécuter les migrations pendant le build :

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm install && npx prisma generate"
  },
  "deploy": {
    "startCommand": "npx prisma migrate deploy && node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Les migrations s'exécuteront au démarrage avec `&&`.

### Solution 3: Vérifier les dépendances

S'assurer que Prisma est dans `dependencies` et non `devDependencies` :

```json
{
  "dependencies": {
    "@prisma/client": "^6.19.0",
    "prisma": "^6.19.0"
  }
}
```

**⚠️ Important:** `prisma` doit être dans `dependencies` pour la production!

Vérifier `package.json` :

```bash
cat package.json | grep -A 10 dependencies
```

Si `prisma` est dans `devDependencies`, le déplacer :

```json
{
  "dependencies": {
    "@prisma/client": "^6.19.0",
    "cors": "^2.8.5",
    "dotenv": "^17.2.3",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "prisma": "^6.19.0"  // <-- Ajouter ici
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
    // Retirer prisma d'ici
  }
}
```

### Solution 4: Ajouter des logs de démarrage

Modifier `server.js` pour ajouter plus de logs :

```javascript
console.log('🔍 Environment:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT || 8080,
    DATABASE_URL: process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'
});

// Avant app.listen
console.log('🚀 Starting server...');

app.listen(PORT, '0.0.0.0', () => {  // Important: écouter sur 0.0.0.0
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 GPX files: ${gpxDir}`);
    console.log(`📸 Photos: ${photosDir}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL}`);
});
```

**Important:** Railway nécessite que l'app écoute sur `0.0.0.0`, pas seulement `localhost`.

## 🚀 Plan d'action recommandé

### Étape 1: Vérifier server.js

Modifier `server.js` ligne 302:

```javascript
// AVANT
app.listen(PORT, () => {

// APRÈS
app.listen(PORT, '0.0.0.0', () => {
```

### Étape 2: Déplacer prisma dans dependencies

```bash
# Ouvrir package.json et déplacer "prisma" de devDependencies vers dependencies
```

### Étape 3: Simplifier railway.json

Utiliser cette version simplifiée :

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npx prisma migrate deploy && node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Étape 4: Commit et push

```bash
git add .
git commit -m "fix: Configure Railway deployment with proper host binding"
git push origin main
```

### Étape 5: Surveiller les logs

Dans Railway Dashboard:
1. Aller dans Deployments
2. Cliquer sur le nouveau déploiement
3. Regarder les logs en temps réel
4. Chercher "🚀 Server running"

## 📞 Si ça ne fonctionne toujours pas

### Obtenir les logs complets

```bash
# Installer Railway CLI
npm i -g @railway/cli

# Se connecter
railway login

# Voir les logs en temps réel
railway logs --follow
```

### Créer un ticket de support

Si le problème persiste:
1. Copier les logs complets
2. Aller sur Discord Railway: https://discord.gg/railway
3. Canal #help
4. Partager:
   - Les logs
   - Le Request ID
   - La configuration (railway.json, Procfile)

## ✅ Checklist de validation

Une fois que ça fonctionne, vérifier :

- [ ] L'application répond sur l'URL Railway
- [ ] Les logs montrent "🚀 Server running"
- [ ] GET /api/health retourne {"status":"ok"}
- [ ] L'import de GPX fonctionne
- [ ] Les données persistent
- [ ] Pas d'erreurs dans les logs

---

**Prochaines étapes:** Une fois l'application démarrée, tester toutes les fonctionnalités et configurer un domaine personnalisé si besoin.
