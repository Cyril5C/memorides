# Guide de déploiement - MesRides

## Déploiement avec Docker Compose (Recommandé pour la production)

### Prérequis
- Docker et Docker Compose installés
- Ports 8080 et 5432 disponibles

### Installation

1. **Cloner le projet**
```bash
git clone <your-repo>
cd MesRides
```

2. **Configurer les variables d'environnement**
```bash
cp .env.production .env
# Éditer .env et changer les mots de passe
```

3. **Lancer l'application**
```bash
./docker-start.sh
# ou manuellement :
docker-compose up -d
```

4. **Vérifier le déploiement**
```bash
docker-compose ps
docker-compose logs -f app
```

5. **Accéder à l'application**
Ouvrir http://localhost:8080

### Volumes persistants

Les données sont stockées dans des volumes Docker :
- `postgres_data` : Base de données PostgreSQL
- `./uploads` : Fichiers GPX et photos (monté depuis l'hôte)

### Commandes utiles

```bash
# Voir les logs
docker-compose logs -f

# Redémarrer l'application
docker-compose restart app

# Arrêter tout
docker-compose down

# Arrêter et supprimer les volumes (⚠️ perte de données)
docker-compose down -v

# Recréer la base de données
docker-compose down
docker volume rm mesrides_postgres_data
docker-compose up -d

# Accéder à la base de données
docker-compose exec postgres psql -U mesrides -d mesrides

# Sauvegarder la base de données
docker-compose exec postgres pg_dump -U mesrides mesrides > backup.sql

# Restaurer la base de données
docker-compose exec -T postgres psql -U mesrides mesrides < backup.sql
```

## Déploiement sans Docker (Alternative)

### Prérequis
- Node.js 20+
- PostgreSQL 16+

### Installation PostgreSQL

**macOS (avec Homebrew)**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb mesrides
```

**Linux (Ubuntu/Debian)**
```bash
sudo apt update
sudo apt install postgresql-16
sudo systemctl start postgresql
sudo -u postgres createdb mesrides
sudo -u postgres createuser mesrides -P
```

### Configuration

1. **Créer la base de données**
```sql
CREATE DATABASE mesrides;
CREATE USER mesrides WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE mesrides TO mesrides;
```

2. **Configurer les variables d'environnement**
```bash
# Créer .env
echo 'DATABASE_URL="postgresql://mesrides:your_password@localhost:5432/mesrides"' > .env
echo 'PORT=8080' >> .env
```

3. **Installer les dépendances**
```bash
npm install
```

4. **Appliquer les migrations**
```bash
npx prisma migrate deploy
```

5. **Démarrer l'application**
```bash
npm start
# ou pour le développement
npm run dev
```

## Test de la configuration PostgreSQL

Pour tester que PostgreSQL fonctionne correctement :

```bash
# Tester la connexion
npx prisma db push

# Vérifier les tables
npx prisma studio

# Créer une migration test
npx prisma migrate dev --name test_postgres
```

## Migration depuis SQLite

Si vous avez des données existantes en SQLite :

1. **Exporter les données**
```bash
# Utiliser sqlite3 pour exporter en SQL
sqlite3 prisma/dev.db .dump > data.sql
```

2. **Adapter le SQL pour PostgreSQL**
```bash
# Remplacer les types SQLite par PostgreSQL
sed -i '' 's/DATETIME/TIMESTAMP/g' data.sql
```

3. **Importer dans PostgreSQL**
```bash
docker-compose exec -T postgres psql -U mesrides mesrides < data.sql
```

## Surveillance et maintenance

### Logs de production
```bash
# Logs de l'application
docker-compose logs -f app

# Logs PostgreSQL
docker-compose logs -f postgres
```

### Santé de l'application
```bash
curl http://localhost:8080/api/health
```

### Sauvegardes automatiques

Créer un cron job pour les sauvegardes :
```bash
# Ajouter dans crontab -e
0 2 * * * cd /path/to/MesRides && docker-compose exec -T postgres pg_dump -U mesrides mesrides | gzip > backups/backup-$(date +\%Y\%m\%d).sql.gz
```

## Résolution de problèmes

### L'application ne démarre pas
```bash
# Vérifier les logs
docker-compose logs app

# Vérifier la connexion à PostgreSQL
docker-compose exec app npx prisma db push
```

### PostgreSQL ne démarre pas
```bash
# Vérifier le statut
docker-compose ps postgres

# Voir les logs
docker-compose logs postgres

# Réinitialiser
docker-compose down
docker volume rm mesrides_postgres_data
docker-compose up -d postgres
```

### Problèmes de permissions sur uploads
```bash
# Corriger les permissions
chmod -R 755 uploads/
```

## Sécurité en production

1. **Changer tous les mots de passe par défaut**
2. **Utiliser HTTPS** (via reverse proxy comme Nginx)
3. **Limiter les connexions PostgreSQL** aux conteneurs internes uniquement
4. **Mettre à jour régulièrement** les images Docker
5. **Activer les sauvegardes automatiques**

## Performance

Pour améliorer les performances en production :

1. **Ajuster les paramètres PostgreSQL** dans `docker-compose.yml`
2. **Ajouter un reverse proxy** (Nginx) pour le cache et HTTPS
3. **Optimiser les index Prisma** selon vos requêtes
4. **Utiliser un CDN** pour les fichiers statiques

## Support multi-environnements

Pour gérer plusieurs environnements (dev, staging, prod) :

```bash
# Créer des fichiers de configuration
.env.development
.env.staging
.env.production

# Utiliser avec Docker Compose
docker-compose --env-file .env.staging up -d
```
