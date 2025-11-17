# 🚨 Corrections de Sécurité Prioritaires

## ⚠️ À Faire IMMÉDIATEMENT (Cette Semaine)

### 1. Sanitisation des Noms de Fichiers (Path Traversal)
**Fichier** : `server.js`
**Lignes** : 299, 317, 393-413

```javascript
// Ajouter cette fonction en haut de server.js
function sanitizeFilename(filename) {
  // Retire le chemin et ne garde que le nom
  const basename = path.basename(filename);
  // Supprime tous les caractères dangereux
  return basename.replace(/[^a-zA-Z0-9._-]/g, '');
}

// Utiliser partout où on manipule des fichiers :
const filePath = path.join(gpxDir, sanitizeFilename(filename));
```

### 2. Configuration CORS Sécurisée
**Fichier** : `server.js`
**Ligne** : 23

```javascript
// Remplacer
app.use(cors());

// Par
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://memorides-production.up.railway.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));
```

### 3. Rate Limiting
**Fichier** : `server.js`
**Après ligne** : 25

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

// Rate limiter général
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes max
  message: 'Trop de requêtes, réessayez plus tard'
});

// Rate limiter strict pour uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // 20 uploads max par heure
  message: 'Trop d\'uploads, réessayez dans 1 heure'
});

app.use('/api', generalLimiter);
app.use('/api/gpx/upload', uploadLimiter);
app.use('/api/photos/upload', uploadLimiter);
```

### 4. Headers de Sécurité
**Fichier** : `server.js`
**Après ligne** : 25

```bash
npm install helmet
```

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false // Nécessaire pour Leaflet
}));

app.disable('x-powered-by');
```

### 5. Opérations Fichiers Asynchrones
**Fichier** : `server.js`
**Lignes** : 110, 203, 317, 354, 380, 405

```javascript
// Remplacer TOUS les fs.unlinkSync par :
await fs.promises.unlink(filePath);

// Remplacer fs.readFileSync par :
const content = await fs.promises.readFile(filePath, 'utf8');
```

### 6. Validation des Entrées
**Fichier** : `server.js`
**Après ligne** : 25

```bash
npm install express-validator
```

```javascript
const { body, validationResult } = require('express-validator');

// Middleware de validation
const validateTrack = [
  body('distance').isFloat({ min: 0, max: 10000 }),
  body('elevation').isFloat({ min: -500, max: 9000 }),
  body('color').matches(/^#[0-9A-Fa-f]{6}$/),
  body('type').isIn(['hiking', 'cycling', 'gravel', 'road']),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Utiliser dans les routes :
app.post('/api/gpx/upload', validateTrack, upload.single('gpx'), ...);
```

---

## 🟠 À Faire Ensuite (Ce Mois)

### 7. Protection CSRF
```bash
npm install csurf cookie-parser
```

### 8. Validation Contenu Fichiers
```bash
npm install file-type
```

### 9. Compression Réponses
```bash
npm install compression
```

### 10. Logging Structuré
```bash
npm install winston
```

---

## 📋 Checklist de Vérification

- [ ] Sanitisation filenames implémentée
- [ ] CORS configuré avec whitelist
- [ ] Rate limiting activé
- [ ] Helmet installé et configuré
- [ ] Opérations fichiers en async
- [ ] Validation des entrées
- [ ] Tests de sécurité effectués
- [ ] Variables d'environnement sécurisées
- [ ] Logs sensibles supprimés
- [ ] Documentation mise à jour

---

## 🧪 Tests de Sécurité

```bash
# 1. Tester path traversal
curl "http://localhost:8080/api/gpx/..%2F..%2Fetc%2Fpasswd"
# Doit retourner une erreur, pas le fichier

# 2. Tester rate limiting
for i in {1..150}; do curl http://localhost:8080/api/gpx/list; done
# Doit bloquer après 100 requêtes

# 3. Audit npm
npm audit
npm audit fix

# 4. Scan de vulnérabilités
npx snyk test
```

---

## 📚 Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
