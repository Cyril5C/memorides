# Guide de Développement

## Environnements

### Local (SQLite)
En local, l'app utilise SQLite pour la base de données.

**Démarrer le serveur local :**
```bash
npm run dev
```

Ce script :
1. Switch automatiquement le schema Prisma vers SQLite
2. Régénère le client Prisma
3. Lance le serveur sur http://localhost:8080

### Production (PostgreSQL)
En production sur Railway, l'app utilise PostgreSQL.

**Important :** Le fichier `prisma/schema.prisma` doit **toujours** être configuré avec `provider = "postgresql"` avant de commiter !

## Workflow

### 1. Développement local
```bash
npm run dev
```
→ Le schema passe automatiquement en SQLite

### 2. Avant de commiter
```bash
npm run restore-schema
```
→ Le schema repasse en PostgreSQL

### 3. Vérifier le schema
```bash
head prisma/schema.prisma
```
→ Doit afficher `provider = "postgresql"`

### 4. Commit et push
```bash
git add .
git commit -m "..."
git push
```
→ Railway déploie avec PostgreSQL

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Lance le serveur local avec SQLite |
| `npm start` | Lance le serveur (utilise le schema tel quel) |
| `npm run restore-schema` | Restaure le provider PostgreSQL dans le schema |
| `npm run build` | Régénère le client Prisma |

## Troubleshooting

### Erreur "the URL must start with the protocol postgresql://"
→ Le schema est en mode PostgreSQL mais tu utilises SQLite
→ Solution : `npm run dev`

### Le schema est resté en SQLite après dev
→ Solution : `npm run restore-schema`

### L'app ne fonctionne pas en prod après un push
→ Vérifier que le schema est bien en PostgreSQL
→ `git diff prisma/schema.prisma`
