# Test en production - MesRides

## Résumé des fichiers créés pour la production

✅ **Configuration Docker**
- `docker-compose.yml` - Orchestration PostgreSQL + App
- `Dockerfile` - Image de l'application
- `.dockerignore` - Exclusions pour le build
- `docker-start.sh` - Script de démarrage automatique

✅ **Configuration Base de données**
- `prisma/schema.prisma` - Configuré pour PostgreSQL
- Migrations existantes prêtes pour PostgreSQL

✅ **Variables d'environnement**
- `.env.production` - Template pour la production

✅ **Documentation**
- `DEPLOYMENT.md` - Guide complet de déploiement
- `README.md` - Mis à jour avec nouvelles fonctionnalités

## 🧪 Plan de test en production

### Test 1: Déploiement Docker local (avec PostgreSQL)

**Objectif**: Vérifier que l'application fonctionne avec PostgreSQL en environnement conteneurisé

**Prérequis**: Docker Desktop installé et démarré

```bash
# 1. Arrêter le serveur de dev
lsof -ti :8080 | xargs kill -9

# 2. Configurer l'environnement
cp .env.production .env.test
# Éditer .env.test si nécessaire

# 3. Démarrer avec Docker Compose
docker-compose up -d

# 4. Attendre que PostgreSQL soit prêt (10-15 secondes)
sleep 15

# 5. Vérifier les conteneurs
docker-compose ps

# 6. Voir les logs
docker-compose logs -f app

# 7. Tester l'API
curl http://localhost:8080/api/health

# 8. Ouvrir dans le navigateur
open http://localhost:8080
```

**Tests fonctionnels à effectuer**:
- [ ] Importer un fichier GPX
- [ ] Ajouter un titre et des commentaires
- [ ] Ajouter des libellés (ex: "Paris", "Vélo", "Weekend")
- [ ] Cliquer sur la trace pour voir la modal d'info
- [ ] Télécharger le fichier GPX
- [ ] Modifier la trace et vérifier que les libellés sont conservés
- [ ] Fermer et relancer Docker Compose
- [ ] Vérifier que les données sont persistées

**Vérification des volumes**:
```bash
# Voir les volumes Docker
docker volume ls | grep mesrides

# Inspecter le volume PostgreSQL
docker volume inspect mesrides_postgres_data

# Vérifier les fichiers uploads
ls -la uploads/gpx/
ls -la uploads/photos/
```

**Nettoyage**:
```bash
# Arrêter les conteneurs
docker-compose down

# Supprimer les volumes (⚠️ perte de données)
docker-compose down -v
```

### Test 2: Vérification de la persistance des données

**Objectif**: Confirmer que les volumes Docker persistent les données

```bash
# 1. Démarrer l'application
docker-compose up -d

# 2. Ajouter des données de test
# - Importer 2 traces GPX
# - Ajouter des libellés ("Test1", "Test2")
# - Ajouter des commentaires

# 3. Arrêter l'application (SANS supprimer les volumes)
docker-compose down

# 4. Redémarrer l'application
docker-compose up -d

# 5. Vérifier que les données sont toujours là
open http://localhost:8080
```

**Tests à effectuer**:
- [ ] Les traces GPX sont toujours visibles
- [ ] Les libellés sont conservés
- [ ] Les commentaires sont conservés
- [ ] Les fichiers dans uploads/ sont toujours là

### Test 3: Sauvegarde et restauration de la base de données

**Objectif**: Vérifier que les sauvegardes PostgreSQL fonctionnent

```bash
# 1. Créer une sauvegarde
docker-compose exec postgres pg_dump -U mesrides mesrides > backup-test.sql

# 2. Vérifier le contenu
cat backup-test.sql | grep -E "(CREATE TABLE|INSERT INTO)"

# 3. Simuler une perte de données
docker-compose down -v
docker-compose up -d postgres
sleep 10

# 4. Restaurer la sauvegarde
docker-compose exec -T postgres psql -U mesrides mesrides < backup-test.sql

# 5. Redémarrer l'app
docker-compose restart app

# 6. Vérifier que les données sont restaurées
open http://localhost:8080
```

### Test 4: Migration depuis SQLite vers PostgreSQL

**Objectif**: Migrer les données existantes de dev vers PostgreSQL

**Note**: Vous avez actuellement des données en SQLite (prisma/prisma/dev.db)

```bash
# 1. Sauvegarder les données SQLite actuelles
cp prisma/prisma/dev.db prisma/prisma/dev.db.backup

# 2. Exporter les données
sqlite3 prisma/prisma/dev.db .dump > sqlite-export.sql

# 3. Démarrer PostgreSQL
docker-compose up -d postgres
sleep 10

# 4. Adapter et importer les données
# (nécessite des ajustements manuels du SQL)

# 5. Vérifier l'import
docker-compose exec postgres psql -U mesrides mesrides -c "SELECT COUNT(*) FROM \"Track\";"
docker-compose exec postgres psql -U mesrides mesrides -c "SELECT COUNT(*) FROM \"Label\";"
```

### Test 5: Performance et charge

**Objectif**: Vérifier que PostgreSQL gère bien la charge

```bash
# 1. Importer plusieurs traces GPX (10+)

# 2. Ajouter beaucoup de libellés (20+)

# 3. Effectuer des recherches
# - Cliquer sur plusieurs traces rapidement
# - Ouvrir/fermer les modals
# - Modifier plusieurs traces

# 4. Vérifier les logs de performance
docker-compose logs postgres | grep "duration"
```

## 📊 Checklist de validation

### Fonctionnalités
- [ ] Import de traces GPX
- [ ] Affichage sur la carte
- [ ] Ajout de titres et commentaires
- [ ] Système de libellés fonctionnel
- [ ] Suggestions de libellés existants
- [ ] Téléchargement de fichiers GPX
- [ ] Photos géolocalisées (si applicable)

### Base de données PostgreSQL
- [ ] Connexion réussie
- [ ] Tables créées correctement
- [ ] Relations many-to-many fonctionnelles
- [ ] Données persistées après redémarrage
- [ ] Sauvegardes fonctionnelles

### Volumes Docker
- [ ] Volume PostgreSQL créé et persistant
- [ ] Dossier uploads/ monté correctement
- [ ] Fichiers GPX accessibles
- [ ] Photos accessibles (si applicable)

### Performance
- [ ] Temps de chargement < 2 secondes
- [ ] Requêtes base de données rapides
- [ ] Pas de memory leaks
- [ ] Logs propres (pas d'erreurs)

## 🚨 Problèmes potentiels et solutions

### Problème: PostgreSQL ne démarre pas
```bash
# Solution 1: Vérifier les logs
docker-compose logs postgres

# Solution 2: Réinitialiser le volume
docker-compose down -v
docker-compose up -d postgres
```

### Problème: L'application ne se connecte pas à PostgreSQL
```bash
# Vérifier la DATABASE_URL
docker-compose exec app env | grep DATABASE_URL

# Tester la connexion
docker-compose exec app npx prisma db push
```

### Problème: Port 5432 déjà utilisé
```bash
# Option 1: Arrêter PostgreSQL local
brew services stop postgresql

# Option 2: Changer le port dans docker-compose.yml
# ports:
#   - "5433:5432"  # au lieu de 5432:5432
```

### Problème: Fichiers uploads non accessibles
```bash
# Vérifier les permissions
ls -la uploads/

# Corriger si nécessaire
chmod -R 755 uploads/
```

## 📝 Notes importantes

1. **Mots de passe**: Changez TOUJOURS les mots de passe par défaut en production réelle
2. **Sauvegardes**: Configurez des sauvegardes automatiques quotidiennes
3. **Monitoring**: Ajoutez un système de monitoring (ex: Prometheus + Grafana)
4. **HTTPS**: En production réelle, utilisez un reverse proxy avec certificat SSL
5. **Logs**: Configurez la rotation des logs pour éviter de remplir le disque

## ✅ Validation finale

Si tous les tests passent, l'application est prête pour :
- ✅ Déploiement sur un serveur dédié
- ✅ Déploiement sur cloud (AWS, GCP, Azure)
- ✅ Déploiement sur PaaS (Railway, Heroku, Render)

## 🚀 Prochaines étapes suggérées

1. Mettre en place un CI/CD (GitHub Actions)
2. Ajouter des tests automatisés (Jest)
3. Ajouter un système de monitoring
4. Optimiser les requêtes Prisma
5. Ajouter un cache Redis pour les performances
6. Implémenter l'authentification utilisateur
7. Ajouter un système de filtrage par libellés
