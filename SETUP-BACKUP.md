# 🔧 Configuration du Backup Automatique - Guide Étape par Étape

## Étape 1 : Obtenir le Railway Token

1. **Aller sur Railway Dashboard** :
   - Ouvrir https://railway.app/account/tokens

2. **Créer un nouveau token** :
   - Cliquer sur **"Create Token"**
   - **Name** : `GitHub Actions Backup` (ou un nom descriptif)
   - Cliquer sur **"Create"**

3. **Copier le token** :
   - Le token s'affiche une seule fois (format: `XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)
   - ⚠️ **IMPORTANT** : Copier et sauvegarder immédiatement, vous ne pourrez plus le voir après !
   - Le token ne devrait pas expirer

## Étape 2 : Configurer le Secret GitHub

1. **Aller sur GitHub** :
   - Ouvrir votre repository : https://github.com/Cyril5C/memorides

2. **Accéder aux Secrets** :
   - Cliquer sur **Settings** (en haut)
   - Dans le menu de gauche : **Secrets and variables** → **Actions**

3. **Ajouter le secret** :
   - Cliquer sur **New repository secret**
   - **Name** : `RAILWAY_TOKEN`
   - **Secret** : Coller le token obtenu à l'étape 1
   - Cliquer sur **Add secret**

## Étape 3 : Pousser le Workflow en Production

Les fichiers suivants doivent être commités et poussés :
- `.github/workflows/weekly-backup.yml`
- `backup-scheduler.js`
- `BACKUP.md`
- `SETUP-BACKUP.md`
- `.github/workflows/README.md`
- `package.json` (modifié)

```bash
git add .github/workflows/weekly-backup.yml
git add backup-scheduler.js
git add BACKUP.md
git add SETUP-BACKUP.md
git add .github/workflows/README.md
git add package.json
git commit -m "feat: Add automatic weekly backup system"
git push
```

## Étape 4 : Tester le Workflow

### Test Manuel (Recommandé)

1. **Aller sur GitHub** :
   - Repository → **Actions**

2. **Lancer le workflow** :
   - Cliquer sur **Weekly Backup** dans la liste de gauche
   - Cliquer sur **Run workflow** (bouton à droite)
   - Sélectionner la branch `main`
   - Cliquer sur **Run workflow**

3. **Suivre l'exécution** :
   - Le workflow apparaît dans la liste
   - Cliquer dessus pour voir les logs en temps réel
   - ✅ = Succès
   - ❌ = Échec (voir les logs pour débugger)

### Vérifier le Backup

1. **Une fois terminé** :
   - Cliquer sur le workflow terminé
   - Section **Artifacts** en bas de page
   - Télécharger `memorides-backup-YYYY-MM-DD.zip`

2. **Vérifier le contenu** :
   - Décompresser le ZIP
   - Vérifier `database.json`
   - Vérifier `README.md`

## Étape 5 : Planification Automatique

Une fois configuré, le backup s'exécute automatiquement :
- **Fréquence** : Tous les dimanches à 3h00 UTC (4h heure française hiver, 5h été)
- **Rétention** : 90 jours
- **Notification** : Vous recevrez un email si le backup échoue (si notifications GitHub activées)

## 🔍 Vérification de la Configuration

```bash
# Vérifier que Railway CLI fonctionne
railway whoami

# Vérifier que le projet Railway est lié
railway status

# Tester l'export en local (nécessite d'être dans le projet)
railway link
railway run node export-data-prod.js
```

**Note** : Le token créé dans le dashboard Railway est différent du token CLI local.
Le token du dashboard est utilisé pour GitHub Actions et les intégrations externes.

## ⚙️ Personnalisation

### Changer la fréquence du backup

Éditer `.github/workflows/weekly-backup.yml` :

```yaml
schedule:
  # Format cron: minute heure jour mois jour-semaine
  - cron: '0 3 * * 0'  # Dimanche 3h

  # Exemples :
  # - cron: '0 2 * * 1'  # Lundi 2h
  # - cron: '0 4 * * 3'  # Mercredi 4h
  # - cron: '0 3 * * *'  # Tous les jours 3h
```

### Changer la rétention

Éditer `.github/workflows/weekly-backup.yml` :

```yaml
- name: Upload backup artifacts
  uses: actions/upload-artifact@v4
  with:
    retention-days: 90  # Modifier ici (max 90 jours sur plan gratuit)
```

## 🚨 Dépannage

### Erreur : "RAILWAY_TOKEN not found"
- Vérifier que le secret est bien créé dans GitHub
- Vérifier l'orthographe exacte : `RAILWAY_TOKEN`

### Erreur : "railway: command not found"
- Normal, l'installation se fait dans le workflow
- Si l'erreur persiste, vérifier les logs de l'étape "Install Railway CLI"

### Erreur : "Authentication failed"
- Le token Railway est peut-être invalide
- Régénérer un nouveau token sur https://railway.app/account/tokens
- Mettre à jour le secret `RAILWAY_TOKEN` dans GitHub

### Backup vide ou incomplet
- Vérifier que le projet Railway est bien accessible
- Vérifier les permissions du token
- Tester en local avec `railway run node export-data-prod.js`

## 📧 Notifications

Pour recevoir des notifications par email :

1. **GitHub** → Settings → Notifications
2. Activer **Actions** dans "Email"
3. Vous recevrez un email en cas d'échec du workflow

## 🎯 Prochaines Étapes

Après configuration :

1. ✅ Tester le workflow manuellement une première fois
2. ✅ Vérifier le contenu du backup téléchargé
3. ✅ Attendre le prochain backup automatique (dimanche 3h)
4. ✅ (Optionnel) Configurer un backup complet mensuel avec `npm run backup`
5. ✅ (Optionnel) Stocker les backups sur un cloud externe (Google Drive, etc.)

## 📞 Support

En cas de problème :
- Consulter les logs GitHub Actions
- Vérifier `BACKUP.md` pour plus d'infos
- Tester en local avec `railway run node export-data-prod.js`
