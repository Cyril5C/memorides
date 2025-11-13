# Memorides

Application web full-stack pour gérer vos traces GPX avec photos géotaggées.

## Fonctionnalités

- 🗺️ Import et visualisation de traces GPX sur carte interactive Leaflet
- 📸 Upload de photos géotaggées avec extraction automatique des coordonnées EXIF
- 📊 Calcul automatique de distance, dénivelé et durée pour chaque trace
- 🏷️ **Système de libellés/tags** pour organiser vos traces
- ✏️ Titres et commentaires personnalisables pour chaque trace
- 🎨 Changement de couleur personnalisé pour chaque trace
- 📱 Interface responsive mobile-first
- 💾 Stockage persistant avec base de données
- 🐳 Déployable avec Docker Compose
- 🚀 Déployable sur Railway

## Technologies utilisées

### Frontend
- HTML5 / CSS3
- JavaScript vanilla
- Leaflet.js pour la cartographie
- EXIF.js pour l'extraction des données GPS des photos

### Backend
- Node.js + Express
- Prisma ORM
- PostgreSQL (production) / SQLite (développement)
- Multer pour l'upload de fichiers
- CORS

### Base de données
- **PostgreSQL** avec architecture relationnelle pour les libellés
- Tables: Track, Label, TrackLabel, Photo
- Relations many-to-many pour les libellés
- Migrations Prisma pour la gestion du schéma

## Installation

### 🚀 Déploiement rapide avec Docker (Recommandé)

**Prérequis**: Docker et Docker Compose installés

```bash
# 1. Cloner le projet
git clone <your-repo>
cd MesRides

# 2. Configurer l'environnement
cp .env.production .env
# Éditer .env et changer les mots de passe

# 3. Démarrer avec Docker Compose
./docker-start.sh
# ou manuellement :
docker-compose up -d

# 4. Accéder à l'application
open http://localhost:8080
```

Les données sont automatiquement persistées dans des volumes Docker.

📖 **Guide complet**: Voir [DEPLOYMENT.md](DEPLOYMENT.md) pour tous les détails

### 🛠️ Développement local (sans Docker)

**Prérequis**: Node.js 20+ et PostgreSQL 16+

1. Cloner le repository et installer les dépendances :
```bash
git clone <your-repo>
cd MesRides
npm install
```

2. Créer un fichier `.env` :
```bash
DATABASE_URL="postgresql://mesrides:password@localhost:5432/mesrides"
PORT=8080
NODE_ENV=development
```

3. Créer la base de données PostgreSQL :
```bash
createdb mesrides
```

4. Appliquer les migrations :
```bash
npx prisma migrate deploy
# ou en mode dev :
npx prisma migrate dev
```

5. Lancer le serveur :
```bash
npm start
# ou en mode dev :
npm run dev
```

6. Ouvrir http://localhost:8080

### ☁️ Déploiement sur Railway

1. Créer un nouveau projet sur [Railway](https://railway.app)

2. Ajouter une base de données PostgreSQL au projet

3. Connecter votre repository GitHub

4. Railway détectera automatiquement les fichiers `railway.json` et `Procfile`

5. Ajouter les variables d'environnement :
   - `DATABASE_URL` sera automatiquement défini par Railway
   - `PORT` sera automatiquement défini par Railway
   - `NODE_ENV=production`

6. Railway déploiera automatiquement votre application

**Note** : Pour production, modifiez `prisma/schema.prisma` pour utiliser PostgreSQL :
```prisma
datasource db {
  provider = "postgresql"  // au lieu de "sqlite"
  url      = env("DATABASE_URL")
}
```

## Structure du projet

```
MesRides/
├── index.html          # Interface principale
├── style.css           # Styles CSS (mobile-first)
├── app.js              # Logique frontend
├── server.js           # Serveur Node.js/Express avec Prisma
├── package.json        # Dépendances npm
├── prisma/
│   ├── schema.prisma   # Schéma de base de données
│   └── migrations/     # Migrations SQL
├── uploads/            # Fichiers uploadés (créé automatiquement)
│   ├── gpx/           # Traces GPX
│   └── photos/        # Photos géotaggées
├── railway.json        # Configuration Railway
├── Procfile            # Configuration Heroku/Railway
├── .env.example        # Exemple de variables d'environnement
└── README.md          # Documentation
```

## API Endpoints

### GPX
- `POST /api/gpx/upload` - Upload GPX avec métadonnées (name, type, color, distance, elevation, duration)
- `GET /api/gpx/list` - Liste toutes les traces avec métadonnées
- `GET /api/gpx/:filename` - Contenu GPX et métadonnées
- `PATCH /api/gpx/:filename` - Mise à jour métadonnées (name, type, color)
- `DELETE /api/gpx/:filename` - Suppression fichier et métadonnées

### Photos
- `POST /api/photos/upload` - Upload photo avec GPS (name, latitude, longitude)
- `GET /api/photos/list` - Liste toutes les photos avec métadonnées
- `DELETE /api/photos/:filename` - Suppression fichier et métadonnées

### Autres
- `GET /api/health` - Vérification serveur et base de données

## Utilisation

1. **Importer des traces GPX** : Cliquez sur "Importer GPX" et sélectionnez vos fichiers
2. **Ajouter des photos** : Cliquez sur "Ajouter Photos" (les photos doivent contenir des données GPS EXIF)
3. **Visualiser une trace** : Cliquez sur "Voir" dans la liste des traces
4. **Changer la couleur** : Utilisez le sélecteur de couleur dans chaque trace
5. **Filtrer** : Utilisez le filtre pour afficher uniquement rando ou vélo

## Base de données

L'application utilise Prisma ORM avec :
- **SQLite** en développement local (fichier `prisma/dev.db`)
- **PostgreSQL** en production sur Railway

### Modèles de données

**Track** (Trace GPX)
- id, filename, name, title, comments, type, color
- distance, elevation, duration
- createdAt, updatedAt
- Relations: photos[], labels[]

**Label** (Libellé/Tag)
- id, name (unique)
- createdAt
- Relations: tracks[]

**TrackLabel** (Table de jonction many-to-many)
- id, trackId, labelId
- createdAt
- Relations: track, label

**Photo** (Photo géotaggée)
- id, filename, name, path
- latitude, longitude, trackId (optional)
- createdAt
- Relations: track

## Notes techniques

- Les fichiers GPX/photos sont stockés dans `uploads/` sur le filesystem
- Les métadonnées sont stockées dans la base de données (Prisma)
- Limite d'upload : 50 MB par fichier
- Compatible navigateurs modernes (ES6+)
- Architecture REST API
- Graceful shutdown pour fermer les connexions DB proprement

## Licence

MIT
