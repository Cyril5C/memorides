# GitHub Actions Workflows

## 📦 Weekly Backup

Backup automatique hebdomadaire de la base de données de production.

### Configuration

1. **Créer un Railway Token** :
   - Aller sur https://railway.app/account/tokens
   - Cliquer "Create Token"
   - Nommer : `GitHub Actions Backup`
   - Copier le token (vous ne pourrez plus le voir après !)

2. **Dans GitHub** → Settings → Secrets and variables → Actions :
   - Cliquer "New repository secret"
   - Nom : `RAILWAY_TOKEN`
   - Valeur : Coller le token créé
   - Cliquer "Add secret"

### Exécution

- **Automatique** : Tous les dimanches à 3h00 UTC
- **Manuelle** : Actions → Weekly Backup → Run workflow

### Télécharger un backup

1. Aller dans Actions
2. Cliquer sur un workflow "Weekly Backup" terminé
3. Télécharger l'artifact "memorides-backup-YYYY-MM-DD"
4. Les artifacts sont conservés 90 jours

### Contenu du backup

- `database.json` : Export complet de la BDD (traces, labels, photos metadata)
- `README.md` : Instructions de restauration

⚠️ **Note** : Les fichiers GPX et photos ne sont pas inclus dans ce backup GitHub Actions.
Pour un backup complet avec fichiers, utiliser le script local `npm run backup`.
