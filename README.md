# Mes Rides

Application web full-stack pour gérer vos traces GPX de randonnée et vélo avec photos géotaggées.

## Fonctionnalités

- Import et visualisation de traces GPX sur carte interactive Leaflet
- Upload de photos géotaggées avec extraction automatique des coordonnées EXIF
- Calcul automatique de distance, dénivelé et durée pour chaque trace
- Changement de couleur personnalisé pour chaque trace
- Filtrage par type d'activité (randonnée/vélo)
- Interface responsive mobile-first
- Stockage persistant avec base de données
- Déployable sur Railway

## Technologies utilisées

### Frontend
- HTML5 / CSS3
- JavaScript vanilla
- Leaflet.js pour la cartographie
- EXIF.js pour l'extraction des données GPS des photos

### Backend
- Node.js + Express
- Prisma ORM
- SQLite (local) / PostgreSQL (production Railway)
- Multer pour l'upload de fichiers
- CORS

## Installation

### Prérequis
- Node.js (v18 ou supérieur)
- npm

### Développement local

1. Cloner le repository et installer les dépendances :
```bash
npm install
```

2. Créer un fichier `.env` (copier depuis `.env.example`) :
```bash
DATABASE_URL="file:./prisma/dev.db"
PORT=3001
NODE_ENV=development
```

3. Générer Prisma Client et créer la base de données :
```bash
npx prisma generate
npx prisma migrate dev
```

4. Lancer le serveur :
```bash
npm start
```

Ou en mode développement avec rechargement automatique :
```bash
npm run dev
```

5. Ouvrir votre navigateur à l'adresse :
```
http://localhost:3001
```

### Déploiement sur Railway

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
- id, filename, name, type, color
- distance, elevation, duration
- createdAt, updatedAt

**Photo** (Photo géotaggée)
- id, filename, name, path
- latitude, longitude
- createdAt

## Notes techniques

- Les fichiers GPX/photos sont stockés dans `uploads/` sur le filesystem
- Les métadonnées sont stockées dans la base de données (Prisma)
- Limite d'upload : 50 MB par fichier
- Compatible navigateurs modernes (ES6+)
- Architecture REST API
- Graceful shutdown pour fermer les connexions DB proprement

## Licence

MIT
