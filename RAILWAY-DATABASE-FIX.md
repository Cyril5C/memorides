# Fix: Error P1001 - Can't reach database server

## 🔴 Erreur

```
Error: P1001: Can't reach database server at `localhost:5432`
```

Cette erreur signifie que Prisma essaie de se connecter à `localhost:5432` au lieu de la base PostgreSQL de Railway.

## 🔍 Cause

La variable d'environnement `DATABASE_URL` n'est pas correctement configurée ou accessible lors de l'exécution des migrations.

## ✅ Solution étape par étape

### 1. Vérifier que PostgreSQL est bien ajouté

**Dans Railway Dashboard:**

1. Ouvrez votre projet
2. Vous devriez voir **2 services** :
   - Un service pour l'application (app/web)
   - Un service pour PostgreSQL (postgres)

Si vous ne voyez qu'un seul service :
- Cliquez sur **"New"** → **"Database"** → **"Add PostgreSQL"**
- Railway va créer une base de données

### 2. Vérifier la variable DATABASE_URL

**Dans le service de l'application:**

1. Cliquez sur le service de l'application (pas PostgreSQL)
2. Allez dans l'onglet **"Variables"**
3. Vérifiez que `DATABASE_URL` existe

**La variable devrait ressembler à :**
```
postgresql://postgres:PASSWORD@containers-us-west-XXX.railway.app:5432/railway
```

**Si la variable n'existe pas ou pointe vers localhost:**

#### Option A: Référence automatique (Recommandé)

1. Dans l'onglet "Variables" de votre app
2. Cliquez sur **"New Variable"** → **"Add Reference"**
3. Sélectionnez le service PostgreSQL
4. Choisissez la variable **"DATABASE_URL"**
5. Railway va automatiquement créer une référence `${{Postgres.DATABASE_URL}}`

#### Option B: Copier manuellement

1. Allez dans le service **PostgreSQL**
2. Onglet **"Variables"**
3. Trouvez `DATABASE_URL` et copiez la valeur
4. Retournez dans le service de l'**application**
5. Onglet **"Variables"** → **"New Variable"**
6. Nom: `DATABASE_URL`
7. Valeur: Collez l'URL PostgreSQL

### 3. Vérifier que les services sont liés

**Railway doit savoir que l'app dépend de PostgreSQL:**

1. Dans votre projet, cliquez sur le service de l'application
2. Onglet **"Settings"**
3. Section **"Service Dependencies"**
4. Ajoutez PostgreSQL comme dépendance

Cela garantit que PostgreSQL démarre avant l'application.

### 4. Redéployer l'application

Après avoir configuré `DATABASE_URL`:

**Option 1: Redéploiement automatique**
- Railway redéploie automatiquement quand vous changez les variables
- Attendez quelques minutes

**Option 2: Forcer un redéploiement**
1. Onglet **"Deployments"**
2. Menu ⋮ du dernier déploiement
3. **"Redeploy"**

### 5. Vérifier les logs

Une fois redéployé, vérifiez les logs:

1. Onglet **"Deployments"**
2. Cliquez sur le dernier déploiement
3. Regardez les logs

**Logs à chercher:**

✅ **Succès - Migrations appliquées:**
```
Running migrations...
✓ Applied migration: 20251112153018_add_title_and_comments
✓ Applied migration: 20251112154037_add_photo_track_relation
✓ Applied migration: 20251113090108_add_labels_to_track
✓ Applied migration: 20251113101104_create_label_tables
🚀 Server running on http://0.0.0.0:XXXX
```

❌ **Erreur - Variable manquante:**
```
Error: Environment variable not found: DATABASE_URL
```
→ Retourner à l'étape 2

❌ **Erreur - Mauvaise URL:**
```
Error: P1001: Can't reach database server at localhost:5432
```
→ La variable DATABASE_URL pointe vers localhost au lieu de Railway

## 🔧 Solution alternative: Utiliser PGHOST et PGDATABASE

Si la référence automatique ne fonctionne pas, vous pouvez configurer les variables PostgreSQL séparément:

**Dans le service de l'application, Variables:**

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
PGHOST=${{Postgres.PGHOST}}
PGPORT=${{Postgres.PGPORT}}
PGDATABASE=${{Postgres.PGDATABASE}}
PGUSER=${{Postgres.PGUSER}}
PGPASSWORD=${{Postgres.PGPASSWORD}}
```

Railway reconstruit automatiquement la `DATABASE_URL` avec ces variables.

## 🐛 Problème persistant: DATABASE_URL non disponible pendant les migrations

Si les migrations échouent toujours, c'est probablement parce qu'elles s'exécutent avant que les variables soient disponibles.

**Solution: Simplifier la commande de démarrage**

Modifier `railway.json` pour ne PAS exécuter les migrations dans `startCommand`:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Puis utiliser le **Procfile** pour gérer les migrations:

```
web: node server.js
release: npx prisma migrate deploy
```

Railway exécutera automatiquement le hook `release` avant de démarrer `web`.

## ✅ Validation finale

Pour vérifier que tout fonctionne:

### 1. Tester l'API health
```bash
curl https://votre-app.up.railway.app/api/health
```

Devrait retourner:
```json
{
  "status": "ok",
  "message": "Server and database are running"
}
```

### 2. Vérifier les tables dans la base de données

**Via Railway CLI:**
```bash
# Installer Railway CLI
npm i -g @railway/cli

# Se connecter
railway login

# Lier le projet
railway link

# Se connecter à PostgreSQL
railway run psql $DATABASE_URL

# Lister les tables
\dt

# Devrait afficher:
# Track, Label, TrackLabel, Photo, _prisma_migrations
```

### 3. Tester l'upload d'une trace GPX

1. Ouvrir l'application
2. Cliquer sur "+"
3. Importer un fichier GPX
4. Vérifier que la trace s'affiche

## 📋 Checklist complète

- [ ] PostgreSQL ajouté au projet Railway
- [ ] PostgreSQL est "Active" (vert)
- [ ] Variable `DATABASE_URL` existe dans l'app
- [ ] `DATABASE_URL` pointe vers Railway (pas localhost)
- [ ] L'app a PostgreSQL comme dépendance
- [ ] Redéploiement effectué
- [ ] Logs montrent "Server running"
- [ ] Pas d'erreur P1001 dans les logs
- [ ] `/api/health` retourne "ok"
- [ ] Tables créées dans PostgreSQL

## 🆘 Dernier recours

Si rien ne fonctionne:

### Option 1: Reset complet

1. Supprimer le service PostgreSQL
2. Supprimer le service application
3. Recommencer depuis le début avec [RAILWAY-DEPLOY.md](RAILWAY-DEPLOY.md)

### Option 2: Utiliser le Dockerfile

Au lieu de Nixpacks, utiliser notre Dockerfile:

Dans `railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  }
}
```

Railway utilisera alors notre Dockerfile au lieu de Nixpacks.

### Option 3: Contacter le support Railway

Discord Railway: https://discord.gg/railway
Canal: #help

Informations à fournir:
- Les logs complets
- La configuration (railway.json, Procfile)
- Les variables d'environnement (sans les valeurs sensibles)
- Le message d'erreur exact

---

**Une fois résolu, l'application devrait fonctionner parfaitement avec PostgreSQL sur Railway!** 🚀
