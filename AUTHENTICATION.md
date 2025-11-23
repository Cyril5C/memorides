# Configuration de l'authentification

L'application est maintenant protégée par un mot de passe.

## Variables d'environnement

Vous devez configurer ces variables d'environnement :

### `APP_PASSWORD`
Le mot de passe pour accéder à l'application.
- **Par défaut** : `rides2024`
- **Recommandé** : Changez-le en production !

### `SESSION_SECRET`
Une clé secrète pour chiffrer les sessions.
- **Par défaut** : `your-secret-key-change-in-production`
- **Recommandé** : Générez une clé aléatoire longue et complexe en production

## Configuration Railway

Pour déployer sur Railway, ajoutez ces variables dans les paramètres de votre projet :

1. Allez dans votre projet Railway
2. Cliquez sur "Variables"
3. Ajoutez :
   - `APP_PASSWORD` : votre mot de passe choisi
   - `SESSION_SECRET` : une clé secrète aléatoire (ex: généré avec `openssl rand -base64 32`)

## Développement local

Pour le développement local, ajoutez ces lignes dans votre fichier `.env` :

```bash
APP_PASSWORD=rides2024
SESSION_SECRET=your-random-secret-key-change-in-production
```

## Page de connexion

L'application redirige automatiquement vers `/login` si l'utilisateur n'est pas authentifié.

## Déconnexion

Un bouton de déconnexion (🚪) est disponible en haut à gauche de l'application.
