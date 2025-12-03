require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const { PrismaClient } = require('@prisma/client');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const archiver = require('archiver');
const session = require('express-session');
const { body, param, validationResult } = require('express-validator');
const pgSession = require('connect-pg-simple')(session);

console.log('🔧 Initializing server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 3001);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Not set');

// Validate required environment variables in production
if (process.env.NODE_ENV === 'production') {
    const requiredVars = ['SESSION_SECRET', 'APP_PASSWORD', 'DATABASE_URL'];
    const missing = requiredVars.filter(v => !process.env[v]);

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables in production:', missing.join(', '));
        console.error('Please set these variables before starting the server.');
        process.exit(1);
    }

    // Warn if using default values
    if (process.env.SESSION_SECRET === 'your-secret-key-change-in-production') {
        console.error('❌ SESSION_SECRET is still set to default value!');
        process.exit(1);
    }

    if (process.env.APP_PASSWORD === 'rides2024') {
        console.error('⚠️  WARNING: APP_PASSWORD is set to default value "rides2024"');
        console.error('This is insecure! Please change it immediately.');
    }

    console.log('✅ Environment variables validated');
}

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🔌 Initializing database client...');
const prisma = new PrismaClient({
    log: ['error', 'warn']
});

// Security: Sanitize filenames to prevent path traversal attacks
function sanitizeFilename(filename) {
    // Extract basename to remove any path components (removes ../ attacks)
    const basename = path.basename(filename);
    // Remove ONLY dangerous characters (null bytes, path separators)
    // Keep Unicode characters, spaces, pipe, etc. for international filenames
    // Note: On Windows, | : * ? " < > are forbidden, but we allow | for Unix/Mac compatibility
    return basename.replace(/[\x00-\x1f\x7f\/\\:*?"<>]/g, '');
}

// Validation middleware: Check for validation errors
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
}

// Security: Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 500 : 1000, // Increased for loading many tracks
    message: 'Trop de requêtes, réessayez plus tard',
    standardHeaders: true,
    legacyHeaders: false
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: process.env.NODE_ENV === 'production' ? 100 : 200, // Increased for batch photo uploads
    message: 'Trop d\'uploads, réessayez dans 1 heure',
    standardHeaders: true,
    legacyHeaders: false
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: 'Trop de tentatives de connexion, réessayez dans 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // Only count failed attempts
});

// Middleware
// Trust proxy - Required for Railway/reverse proxies to get real client IP
app.set('trust proxy', 1);

// Security headers
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
    crossOriginEmbedderPolicy: false // Required for Leaflet
}));

// Disable X-Powered-By header
app.disable('x-powered-by');

// CORS configuration - restrict origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:8080'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
}));

// Compression
app.use(compression());

// Session configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// Use PostgreSQL session store in production
if (process.env.NODE_ENV === 'production') {
    sessionConfig.store = new pgSession({
        conString: process.env.DATABASE_URL,
        tableName: 'session', // Table name for sessions
        createTableIfMissing: true // Auto-create session table
    });
    console.log('✅ Using PostgreSQL session store');
} else {
    console.log('⚠️  Using MemoryStore (development only)');
}

app.use(session(sessionConfig));

// Rate limiting on API routes
app.use('/api', generalLimiter);

app.use(express.json());

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    // For page requests, redirect to login
    res.redirect('/login');
}

// Login route (no auth required) - with rate limiting and validation
app.post('/api/auth/login',
    loginLimiter,
    body('password').isString().trim().notEmpty().isLength({ min: 1, max: 100 }),
    handleValidationErrors,
    (req, res) => {
        const { password } = req.body;
        const correctPassword = process.env.APP_PASSWORD || 'rides2024';

        if (password === correctPassword) {
            req.session.authenticated = true;
            res.json({ success: true });
        } else {
            res.json({ success: false, message: 'Mot de passe incorrect' });
        }
    }
);

// Logout route
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.json({ success: false, message: 'Erreur lors de la déconnexion' });
        }
        res.json({ success: true });
    });
});

// Serve login page (no auth required)
app.get('/login', (req, res) => {
    // If already authenticated, redirect to home
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve robots.txt (no auth required)
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, 'robots.txt'));
});

// ============= PUBLIC SHARE ROUTE (NO AUTH REQUIRED) =============

// Serve the public share page (no authentication required)
app.get('/share/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find share link by token
        const shareLink = await prisma.shareLink.findUnique({
            where: { token },
            include: {
                track: {
                    include: {
                        labels: {
                            include: {
                                label: true
                            }
                        }
                    }
                }
            }
        });

        // Read the share.html template
        let html = fs.readFileSync(path.join(__dirname, 'share.html'), 'utf8');

        // Determine base URL - handle Railway proxy headers
        let baseUrl = process.env.BASE_URL;
        if (!baseUrl) {
            const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
            const host = req.get('x-forwarded-host') || req.get('host');
            baseUrl = `${protocol}://${host}`;
        }

        if (shareLink && shareLink.active && shareLink.expiresAt > new Date()) {
            const track = shareLink.track;
            const trackName = track.title || track.name;
            const distance = track.distance ? `${track.distance.toFixed(2)} km` : 'N/A';
            const elevation = track.elevation ? `${Math.round(track.elevation)} m` : 'N/A';

            // Calculate duration (assuming 15 km/h average speed)
            const durationHours = track.distance / 15;
            const hours = Math.floor(durationHours);
            const minutes = Math.round((durationHours - hours) * 60);
            const duration = hours > 0 ? `${hours}h${minutes}min` : `${minutes}min`;

            // Get labels as text
            const labels = track.labels && track.labels.length > 0
                ? track.labels.map(tl => tl.label.name).join(', ')
                : '';

            // Build description
            let description = `Distance: ${distance} • Dénivelé: ${elevation} • Durée estimée: ${duration}`;
            if (labels) {
                description += ` • Labels: ${labels}`;
            }

            // Inject Open Graph metadata
            const ogMetaTags = `
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${baseUrl}/share/${token}">
    <meta property="og:title" content="${trackName} - ${distance}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${baseUrl}/api/share/${token}/preview-image">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${baseUrl}/share/${token}">
    <meta property="twitter:title" content="${trackName} - ${distance}">
    <meta property="twitter:description" content="${description}">
    <meta property="twitter:image" content="${baseUrl}/api/share/${token}/preview-image">`;

            // Inject meta tags into HTML head
            html = html.replace('</head>', `${ogMetaTags}\n</head>`);

            // Update page title
            html = html.replace(
                '<title id="page-title">Trace partagée - Memorides</title>',
                `<title id="page-title">${trackName} - ${distance} - Memorides</title>`
            );
        }

        res.send(html);
    } catch (error) {
        console.error('Error generating share page:', error);
        // Fallback to static HTML if error
        res.sendFile(path.join(__dirname, 'share.html'));
    }
});

// Public route to access shared track (no authentication required)
app.get('/api/share/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find share link by token
        const shareLink = await prisma.shareLink.findUnique({
            where: { token },
            include: {
                track: {
                    include: {
                        labels: {
                            include: {
                                label: true
                            }
                        },
                        photos: true
                    }
                }
            }
        });

        if (!shareLink) {
            return res.status(404).json({ error: 'Share link not found' });
        }

        // Check if link is expired or inactive
        const now = new Date();
        if (!shareLink.active || shareLink.expiresAt < now) {
            return res.status(410).json({ error: 'This share link has expired' });
        }

        // Increment view count
        await prisma.shareLink.update({
            where: { id: shareLink.id },
            data: { viewCount: shareLink.viewCount + 1 }
        });

        // Return track data
        res.json({
            track: shareLink.track,
            shareInfo: {
                expiresAt: shareLink.expiresAt,
                viewCount: shareLink.viewCount + 1
            }
        });
    } catch (error) {
        console.error('Error accessing shared track:', error);
        res.status(500).json({ error: 'Failed to access shared track' });
    }
});

// Serve GPX file for shared track (no authentication required)
app.get('/api/share/:token/gpx', async (req, res) => {
    try {
        const { token } = req.params;

        // Find share link
        const shareLink = await prisma.shareLink.findUnique({
            where: { token },
            include: { track: true }
        });

        if (!shareLink) {
            return res.status(404).json({ error: 'Share link not found' });
        }

        // Check if link is expired or inactive
        const now = new Date();
        if (!shareLink.active || shareLink.expiresAt < now) {
            return res.status(410).json({ error: 'This share link has expired' });
        }

        // Serve GPX file
        const gpxFilePath = path.join(__dirname, 'uploads', 'gpx', shareLink.track.filename);

        if (!fs.existsSync(gpxFilePath)) {
            return res.status(404).json({ error: 'GPX file not found' });
        }

        res.setHeader('Content-Type', 'application/gpx+xml');
        res.sendFile(gpxFilePath);
    } catch (error) {
        console.error('Error serving shared GPX:', error);
        res.status(500).json({ error: 'Failed to serve GPX file' });
    }
});

// Generate preview image for social media sharing (no authentication required)
app.get('/api/share/:token/preview-image', async (req, res) => {
    try {
        const { token } = req.params;

        // Find share link with photos
        const shareLink = await prisma.shareLink.findUnique({
            where: { token },
            include: {
                track: {
                    include: {
                        photos: {
                            orderBy: {
                                createdAt: 'desc'
                            },
                            take: 1
                        }
                    }
                }
            }
        });

        if (!shareLink) {
            return res.status(404).json({ error: 'Share link not found' });
        }

        // Check if link is expired or inactive
        const now = new Date();
        if (!shareLink.active || shareLink.expiresAt < now) {
            return res.status(410).json({ error: 'This share link has expired' });
        }

        const track = shareLink.track;

        // If track has photos, use the last photo as preview
        if (track.photos && track.photos.length > 0) {
            const lastPhoto = track.photos[0];
            const photoPath = path.join(__dirname, lastPhoto.path);

            if (fs.existsSync(photoPath)) {
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
                return res.sendFile(photoPath);
            }
        }

        // Fallback: return a placeholder or default image
        // For now, return a simple error since we removed Canvas dependency
        res.status(404).json({ error: 'No preview image available' });

    } catch (error) {
        console.error('Error generating preview image:', error);
        res.status(500).json({ error: 'Failed to generate preview image' });
    }
});

// Create uploads directories variables (needed before requireAuth for public access)
const uploadsDir = path.join(__dirname, 'uploads');
const gpxDir = path.join(uploadsDir, 'gpx');
const photosDir = path.join(uploadsDir, 'photos');

// Serve uploaded files (no authentication required - needed for shared links)
app.use('/uploads', express.static(uploadsDir));

// Protect all other routes
app.use(requireAuth);

app.use(express.static('public'));

// Service Worker must never be cached - serve with no-cache headers
app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'sw.js'));
});

// Serve static files from root directory
app.use(express.static(__dirname));

// Initialize directories asynchronously (will be called during server startup)
async function ensureDirectories() {
    const dirs = [uploadsDir, gpxDir, photosDir];
    await Promise.all(
        dirs.map(dir =>
            fsPromises.mkdir(dir, { recursive: true })
                .catch(err => {
                    if (err.code !== 'EEXIST') throw err;
                })
        )
    );
    console.log('📁 Upload directories verified');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (_req, file, cb) {
        // Accept GPX files with various MIME types (iOS can send different types)
        if (file.mimetype === 'application/gpx+xml' ||
            file.mimetype === 'application/xml' ||
            file.mimetype === 'text/xml' ||
            file.mimetype === 'application/octet-stream' ||
            file.originalname.toLowerCase().endsWith('.gpx')) {
            cb(null, gpxDir);
        } else if (file.mimetype.startsWith('image/')) {
            cb(null, photosDir);
        } else {
            cb(new Error(`Invalid file type: ${file.mimetype} for ${file.originalname}`));
        }
    },
    filename: function (_req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

        // Fix UTF-8 encoding: browsers may send filename as ISO-8859-1
        let filename = file.originalname;
        try {
            // Try to decode as if it was incorrectly encoded as ISO-8859-1
            const buffer = Buffer.from(filename, 'binary');
            filename = buffer.toString('utf8');
        } catch (error) {
            // If decoding fails, keep original name
            console.log('Could not fix filename encoding:', filename);
        }

        cb(null, uniqueSuffix + '-' + filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Routes

// Upload GPX file with metadata
app.post('/api/gpx/upload', uploadLimiter, upload.single('gpx'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Extract metadata from request body
        const { name, title, comments, type, direction, color, distance, elevation } = req.body;

        // Read GPX file to extract name if title not provided
        let gpxName = null;
        if (!title) {
            try {
                const gpxContent = await fsPromises.readFile(req.file.path, 'utf8');
                // Extract <name> tag from GPX (first occurrence, typically metadata name)
                const nameMatch = gpxContent.match(/<name>(.*?)<\/name>/);
                if (nameMatch && nameMatch[1]) {
                    gpxName = nameMatch[1].trim();
                }
            } catch (error) {
                console.error('Error reading GPX for name extraction:', error);
                // Continue without GPX name
            }
        }

        // Save to database
        const track = await prisma.track.create({
            data: {
                filename: req.file.filename,
                name: name || req.file.originalname.replace('.gpx', ''),
                title: title || gpxName || null,
                comments: comments || null,
                type: type || 'gravel',
                direction: direction || 'one-way',
                color: color || '#2563eb',
                distance: parseFloat(distance) || 0,
                elevation: parseFloat(elevation) || 0
                // Duration is calculated dynamically on the client
            }
        });

        res.json({
            success: true,
            file: {
                id: track.id,
                filename: track.filename,
                path: `/uploads/gpx/${track.filename}`,
                size: req.file.size
            },
            track
        });
    } catch (error) {
        console.error('Error uploading GPX:', error);
        // Delete file if database save fails
        if (req.file) {
            try {
                await fsPromises.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting uploaded file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Error uploading file' });
    }
});

// Update track metadata
app.patch('/api/gpx/:filename', async (req, res) => {
        try {
            const { filename } = req.params;
            const { name, title, comments, labels, type, direction, color, roadmap, completedAt } = req.body;

        // First, get the track to get its ID
        const existingTrack = await prisma.track.findUnique({
            where: { filename }
        });

        if (!existingTrack) {
            return res.status(404).json({ error: 'Track not found' });
        }

        // Update basic track fields
        const track = await prisma.track.update({
            where: { filename },
            data: {
                ...(name !== undefined && { name }),
                ...(title !== undefined && { title }),
                ...(comments !== undefined && { comments }),
                ...(type && { type }),
                ...(direction && { direction }),
                ...(color && { color }),
                ...(roadmap !== undefined && { roadmap }),
                ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null })
            }
        });

        // Handle labels if provided
        if (labels !== undefined) {
            // Delete existing label relations
            await prisma.trackLabel.deleteMany({
                where: { trackId: existingTrack.id }
            });

            // Create new label relations if labels provided
            if (Array.isArray(labels) && labels.length > 0) {
                // Parallel upsert of all labels
                const labelRecords = await Promise.all(
                    labels.map(labelName =>
                        prisma.label.upsert({
                            where: { name: labelName },
                            create: { name: labelName },
                            update: {}
                        })
                    )
                );

                // Batch create track-label relations
                await prisma.trackLabel.createMany({
                    data: labelRecords.map(label => ({
                        trackId: existingTrack.id,
                        labelId: label.id
                    }))
                });
            }
        }

        // Fetch the updated track with labels
        const updatedTrack = await prisma.track.findUnique({
            where: { filename },
            include: {
                labels: {
                    include: {
                        label: true
                    }
                }
            }
        });

            res.json({ success: true, track: updatedTrack });
    } catch (error) {
        console.error('Error updating track:', error);
        res.status(500).json({ error: 'Error updating track' });
    }
});

// Upload photo with metadata
app.post('/api/photos/upload',
    uploadLimiter,
    upload.single('photo'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            // Extract metadata from request body
            const { name, latitude, longitude, trackId } = req.body;

            // Prepare photo data
            const photoData = {
                filename: req.file.filename,
                name: name || req.file.originalname,
                path: `/uploads/photos/${req.file.filename}`,
                trackId: trackId || null
            };

            // Add GPS coordinates only if provided
            if (latitude && longitude) {
                photoData.latitude = parseFloat(latitude);
                photoData.longitude = parseFloat(longitude);
            }

        // Save to database
        const photo = await prisma.photo.create({
            data: photoData
        });

        res.json({
            success: true,
            file: {
                id: photo.id,
                filename: photo.filename,
                path: photo.path,
                size: req.file.size
            },
            photo
            });
        } catch (error) {
            console.error('Error uploading photo:', error);
            // Delete file if database save fails
            if (req.file) {
                await fsPromises.unlink(req.file.path);
            }
            res.status(500).json({ error: 'Error uploading file' });
        }
    }
);

// List all GPX tracks with metadata
app.get('/api/gpx/list', async (_req, res) => {
    try {
        const tracks = await prisma.track.findMany({
            include: {
                photos: true,
                labels: {
                    include: {
                        label: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ success: true, tracks });
    } catch (error) {
        console.error('Error listing tracks:', error);
        res.status(500).json({ error: 'Error listing tracks' });
    }
});

// List all photos with metadata
app.get('/api/photos/list', async (_req, res) => {
    try {
        const photos = await prisma.photo.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ success: true, photos });
    } catch (error) {
        console.error('Error listing photos:', error);
        res.status(500).json({ error: 'Error listing photos' });
    }
});

// List all labels
app.get('/api/labels/list', async (_req, res) => {
    try {
        const labels = await prisma.label.findMany({
            include: {
                tracks: true
            },
            orderBy: {
                name: 'asc'
            }
        });

        // Add track count to each label
        const labelsWithCount = labels.map(label => ({
            ...label,
            trackCount: label.tracks.length,
            tracks: undefined // Remove the tracks array from response
        }));

        res.json({ success: true, labels: labelsWithCount });
    } catch (error) {
        console.error('Error listing labels:', error);
        res.status(500).json({ error: 'Error listing labels' });
    }
});

// Delete a label
app.delete('/api/labels/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // First, delete all TrackLabel associations
        await prisma.trackLabel.deleteMany({
            where: {
                labelId: id
            }
        });

        // Then delete the label itself
        await prisma.label.delete({
            where: {
                id: id
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting label:', error);
        res.status(500).json({ error: 'Error deleting label' });
    }
});

// Track Types API

// List all track types
app.get('/api/track-types/list', async (_req, res) => {
    try {
        const trackTypes = await prisma.trackType.findMany({
            orderBy: {
                order: 'asc'
            }
        });

        res.json({ success: true, trackTypes });
    } catch (error) {
        console.error('Error listing track types:', error);
        res.status(500).json({ error: 'Error listing track types' });
    }
});

// Create a new track type
app.post('/api/track-types', async (req, res) => {
    try {
        const { value, label, icon, order } = req.body;

        if (!value || !label || !icon) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const trackType = await prisma.trackType.create({
            data: {
                value,
                label,
                icon,
                order: order || 0
            }
        });

        res.json({ success: true, trackType });
    } catch (error) {
        console.error('Error creating track type:', error);
        res.status(500).json({ error: 'Error creating track type' });
    }
});

// Update a track type
app.put('/api/track-types/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { value, label, icon, order } = req.body;

        const trackType = await prisma.trackType.update({
            where: { id },
            data: {
                value,
                label,
                icon,
                order
            }
        });

        res.json({ success: true, trackType });
    } catch (error) {
        console.error('Error updating track type:', error);
        res.status(500).json({ error: 'Error updating track type' });
    }
});

// Get GPX file content
app.get('/api/gpx/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const sanitized = sanitizeFilename(filename);
        const filePath = path.join(gpxDir, sanitized);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get track metadata from database
        const track = await prisma.track.findUnique({
            where: { filename },
            include: {
                labels: {
                    include: {
                        label: true
                    }
                }
            }
        });

        const content = await fsPromises.readFile(filePath, 'utf8');
        res.json({ success: true, content, track });
    } catch (error) {
        console.error('Error reading GPX file:', error);
        res.status(500).json({ error: 'Error reading file' });
    }
});

// Delete GPX file and metadata
app.delete('/api/gpx/:filename',
    param('filename').isString().trim().notEmpty(),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { filename } = req.params;
        const sanitized = sanitizeFilename(filename);
        const filePath = path.join(gpxDir, sanitized);

        // Get track with associated photos first
        const track = await prisma.track.findUnique({
            where: { filename },
            include: {
                photos: true,
                labels: true
            }
        });

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        console.log(`Deleting track: ${track.filename} (ID: ${track.id})`);
        console.log(`- Photos to delete: ${track.photos?.length || 0}`);
        console.log(`- Labels to delete: ${track.labels?.length || 0}`);

        // Delete associated photo files and database entries
        if (track.photos && track.photos.length > 0) {
            // Delete photo files in parallel
            await Promise.all(
                track.photos.map(async (photo) => {
                    const photoPath = path.join(photosDir, sanitizeFilename(photo.filename));
                    console.log(`Deleting photo file: ${photoPath}`);
                    if (fs.existsSync(photoPath)) {
                        try {
                            await fsPromises.unlink(photoPath);
                        } catch (err) {
                            console.error(`Error deleting photo file ${photo.filename}:`, err);
                        }
                    }
                })
            );

            // Batch delete photos from database
            const photoIds = track.photos.map(p => p.id);
            await prisma.photo.deleteMany({
                where: { id: { in: photoIds } }
            });
        }

        // Delete track-label relations
        if (track.labels && track.labels.length > 0) {
            console.log('Deleting track-label relations...');
            await prisma.trackLabel.deleteMany({
                where: { trackId: track.id }
            });
        }

        // Delete from database
        console.log('Deleting track from database...');
        await prisma.track.delete({
            where: { filename }
        });

        // Delete GPX file
        if (fs.existsSync(filePath)) {
            console.log(`Deleting GPX file: ${filePath}`);
            await fsPromises.unlink(filePath);
        }

            console.log('Track deleted successfully');
            res.json({ success: true, message: 'Track and associated data deleted' });
        } catch (error) {
            console.error('Error deleting GPX file:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({ error: 'Error deleting file', details: error.message });
        }
    }
);

// Delete photo and metadata
app.delete('/api/photos/:filename',
    param('filename').isString().trim().notEmpty(),
    handleValidationErrors,
    async (req, res) => {
        try {
        const { filename } = req.params;
        const sanitized = sanitizeFilename(filename);
        const filePath = path.join(photosDir, sanitized);

        // Delete from database
        await prisma.photo.delete({
            where: { filename }
        });

        // Delete file
        if (fs.existsSync(filePath)) {
            await fsPromises.unlink(filePath);
        }

            res.json({ success: true, message: 'Photo deleted' });
        } catch (error) {
            console.error('Error deleting photo:', error);
            res.status(500).json({ error: 'Error deleting file' });
        }
    }
);

// Admin list files endpoint (temporary)
app.get('/api/admin/list-files', async (_req, res) => {
    try {
        const gpxFiles = await fsPromises.readdir(gpxDir).catch(() => []);
        res.json({ files: gpxFiles.sort() });
    } catch (error) {
        console.error('List files error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get detailed list of GPX files with metadata
app.get('/api/gpx-files/list', async (_req, res) => {
    try {
        const gpxFiles = await fsPromises.readdir(gpxDir).catch(() => []);

        // Get file stats and track info for each file
        const filesWithDetails = await Promise.all(
            gpxFiles.map(async (filename) => {
                try {
                    const filePath = path.join(gpxDir, filename);
                    const stats = await fsPromises.stat(filePath);

                    // Check if this file is linked to a track
                    const track = await prisma.track.findFirst({
                        where: { filename },
                        select: {
                            id: true,
                            name: true,
                            title: true
                        }
                    });

                    return {
                        filename,
                        size: stats.size,
                        createdAt: stats.birthtime,
                        modifiedAt: stats.mtime,
                        hasTrack: !!track,
                        trackInfo: track || null
                    };
                } catch (error) {
                    return {
                        filename,
                        size: 0,
                        createdAt: null,
                        modifiedAt: null,
                        hasTrack: false,
                        trackInfo: null,
                        error: error.message
                    };
                }
            })
        );

        // Sort by modified date (most recent first)
        filesWithDetails.sort((a, b) => {
            if (!a.modifiedAt) return 1;
            if (!b.modifiedAt) return -1;
            return b.modifiedAt - a.modifiedAt;
        });

        res.json({ files: filesWithDetails });
    } catch (error) {
        console.error('List GPX files error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete a GPX file
app.delete('/api/gpx-files/:filename',
    param('filename').isString().trim().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { filename } = req.params;
            const filePath = path.join(gpxDir, filename);

            // Check if file exists
            const fileExists = await fsPromises.access(filePath)
                .then(() => true)
                .catch(() => false);

            if (!fileExists) {
                return res.status(404).json({ error: 'File not found' });
            }

            // Check if there's a track using this file
            const track = await prisma.track.findFirst({
                where: { filename }
            });

            if (track) {
                return res.status(400).json({
                    error: 'Cannot delete file: it is linked to a track. Delete the track first.',
                    trackId: track.id,
                    trackName: track.name || track.title
                });
            }

            // Delete the file
            await fsPromises.unlink(filePath);

            res.json({
                success: true,
                message: `File ${filename} deleted successfully`
            });
        } catch (error) {
            console.error('Delete GPX file error:', error);
            res.status(500).json({ error: error.message });
        }
    }
);

// Admin cleanup orphaned entries endpoint (temporary)
app.post('/api/admin/cleanup-orphans', async (_req, res) => {
    try {
        // Read GPX files from disk
        const gpxFiles = await fsPromises.readdir(gpxDir).catch(() => []);
        const fileSet = new Set(gpxFiles);

        // Find tracks without corresponding files
        const tracks = await prisma.track.findMany({
            select: {
                id: true,
                filename: true,
                name: true,
                title: true
            }
        });

        const orphanedTracks = tracks.filter(t => !fileSet.has(t.filename));

        if (orphanedTracks.length === 0) {
            return res.json({
                success: true,
                message: 'No orphaned tracks found',
                deleted: []
            });
        }

        // Delete orphaned tracks (cascade will delete related TrackLabel entries)
        const deletedIds = [];
        for (const track of orphanedTracks) {
            await prisma.track.delete({
                where: { id: track.id }
            });
            deletedIds.push({
                id: track.id,
                filename: track.filename,
                name: track.title || track.name
            });
        }

        console.log(`✅ Cleaned up ${deletedIds.length} orphaned track entries`);

        res.json({
            success: true,
            message: `Successfully deleted ${deletedIds.length} orphaned tracks`,
            deleted: deletedIds
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Admin consistency check endpoint (temporary)
app.get('/api/admin/consistency', async (_req, res) => {
    try {
        // Read GPX files from disk
        const gpxFiles = await fsPromises.readdir(gpxDir).catch(() => []);

        // Read photos from disk
        const photoFiles = await fsPromises.readdir(photosDir).catch(() => []);

        // Read tracks from DB
        const tracks = await prisma.track.findMany({
            select: {
                id: true,
                filename: true,
                name: true,
                title: true
            }
        });

        // Read photos from DB
        const photos = await prisma.photo.findMany({
            select: {
                id: true,
                filename: true,
                name: true
            }
        });

        // Find orphaned files and DB entries
        const dbFilenames = new Set(tracks.map(t => t.filename));
        const fileSet = new Set(gpxFiles);

        const orphanedFiles = gpxFiles.filter(f => !dbFilenames.has(f));
        const orphanedEntries = tracks.filter(t => !fileSet.has(t.filename));

        const dbPhotoFilenames = new Set(photos.map(p => p.filename));
        const photoFileSet = new Set(photoFiles);

        const orphanedPhotoFiles = photoFiles.filter(f => !dbPhotoFilenames.has(f));
        const orphanedPhotoEntries = photos.filter(p => !photoFileSet.has(p.filename));

        res.json({
            gpx: {
                filesOnDisk: gpxFiles.length,
                entriesInDB: tracks.length,
                orphanedFiles: orphanedFiles,
                orphanedEntries: orphanedEntries.map(t => ({
                    filename: t.filename,
                    id: t.id,
                    name: t.title || t.name
                }))
            },
            photos: {
                filesOnDisk: photoFiles.length,
                entriesInDB: photos.length,
                orphanedFiles: orphanedPhotoFiles,
                orphanedEntries: orphanedPhotoEntries.map(p => ({
                    filename: p.filename,
                    id: p.id,
                    name: p.name
                }))
            },
            summary: {
                totalIssues: orphanedFiles.length + orphanedEntries.length +
                           orphanedPhotoFiles.length + orphanedPhotoEntries.length,
                isConsistent: (orphanedFiles.length + orphanedEntries.length +
                             orphanedPhotoFiles.length + orphanedPhotoEntries.length) === 0
            }
        });
    } catch (error) {
        console.error('Consistency check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', message: 'Server and database are running' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Database connection failed' });
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
});

// Export/Backup endpoint - creates a ZIP with GPX files, photos, and database CSV
app.get('/api/export/backup', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const zipFilename = `memorides-backup-${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).send('Error creating backup');
        });

        archive.pipe(res);

        // Add GPX files
        if (fs.existsSync(gpxDir)) {
            archive.directory(gpxDir, 'gpx');
        }

        // Add photos
        if (fs.existsSync(photosDir)) {
            archive.directory(photosDir, 'photos');
        }

        // Generate and add database CSVs
        // Tracks CSV
        const tracks = await prisma.track.findMany({
            include: {
                labels: {
                    include: {
                        label: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const tracksCSV = [
            'ID,Filename,Name,Title,Type,Direction,Color,Distance,Elevation,Duration,CompletedAt,Comments,Labels,CreatedAt,UpdatedAt',
            ...tracks.map(t => [
                t.id,
                `"${t.filename}"`,
                `"${t.name || ''}"`,
                `"${t.title || ''}"`,
                t.type,
                t.direction,
                t.color,
                t.distance,
                t.elevation,
                t.duration || '',
                t.completedAt ? new Date(t.completedAt).toISOString() : '',
                `"${(t.comments || '').replace(/"/g, '""')}"`,
                `"${t.labels.map(l => l.label.name).join(', ')}"`,
                new Date(t.createdAt).toISOString(),
                new Date(t.updatedAt).toISOString()
            ].join(','))
        ].join('\n');

        archive.append(tracksCSV, { name: 'database/tracks.csv' });

        // Labels CSV
        const labels = await prisma.label.findMany({
            orderBy: { name: 'asc' }
        });

        const labelsCSV = [
            'ID,Name,CreatedAt',
            ...labels.map(l => [
                l.id,
                `"${l.name}"`,
                new Date(l.createdAt).toISOString()
            ].join(','))
        ].join('\n');

        archive.append(labelsCSV, { name: 'database/labels.csv' });

        // Photos CSV
        const photos = await prisma.photo.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const photosCSV = [
            'ID,Filename,Name,Path,Latitude,Longitude,TrackID,CreatedAt',
            ...photos.map(p => [
                p.id,
                `"${p.filename}"`,
                `"${p.name}"`,
                `"${p.path}"`,
                p.latitude,
                p.longitude,
                p.trackId || '',
                new Date(p.createdAt).toISOString()
            ].join(','))
        ].join('\n');

        archive.append(photosCSV, { name: 'database/photos.csv' });

        // Generate SQL dump for easy reimport
        const sqlDump = [];

        // SQL Header
        sqlDump.push('-- Memorides Database Backup');
        sqlDump.push(`-- Generated: ${new Date().toISOString()}`);
        sqlDump.push('-- PostgreSQL/SQLite compatible\n');

        // Labels
        sqlDump.push('-- Labels');
        sqlDump.push('DELETE FROM "TrackLabel";');
        sqlDump.push('DELETE FROM "Label";\n');
        for (const label of labels) {
            const id = label.id.replace(/'/g, "''");
            const name = label.name.replace(/'/g, "''");
            const createdAt = new Date(label.createdAt).toISOString();
            sqlDump.push(`INSERT INTO "Label" ("id", "name", "createdAt") VALUES ('${id}', '${name}', '${createdAt}');`);
        }

        // Tracks
        sqlDump.push('\n-- Tracks');
        sqlDump.push('DELETE FROM "Photo" WHERE "trackId" IS NOT NULL;');
        sqlDump.push('DELETE FROM "Track";\n');
        for (const track of tracks) {
            const id = track.id.replace(/'/g, "''");
            const filename = track.filename.replace(/'/g, "''");
            const name = (track.name || '').replace(/'/g, "''");
            const title = (track.title || '').replace(/'/g, "''");
            const type = track.type.replace(/'/g, "''");
            const direction = track.direction.replace(/'/g, "''");
            const color = track.color.replace(/'/g, "''");
            const comments = (track.comments || '').replace(/'/g, "''");
            const completedAt = track.completedAt ? `'${new Date(track.completedAt).toISOString()}'` : 'NULL';
            const duration = track.duration !== null ? track.duration : 'NULL';
            const createdAt = new Date(track.createdAt).toISOString();
            const updatedAt = new Date(track.updatedAt).toISOString();

            sqlDump.push(`INSERT INTO "Track" ("id", "filename", "name", "title", "type", "direction", "color", "distance", "elevation", "duration", "completedAt", "comments", "createdAt", "updatedAt") VALUES ('${id}', '${filename}', '${name}', '${title}', '${type}', '${direction}', '${color}', ${track.distance}, ${track.elevation}, ${duration}, ${completedAt}, '${comments}', '${createdAt}', '${updatedAt}');`);
        }

        // Track Labels (many-to-many)
        sqlDump.push('\n-- Track Labels');
        for (const track of tracks) {
            for (const trackLabel of track.labels) {
                const id = trackLabel.id.replace(/'/g, "''");
                const trackId = track.id.replace(/'/g, "''");
                const labelId = trackLabel.labelId.replace(/'/g, "''");
                const createdAt = new Date(trackLabel.createdAt).toISOString();
                sqlDump.push(`INSERT INTO "TrackLabel" ("id", "trackId", "labelId", "createdAt") VALUES ('${id}', '${trackId}', '${labelId}', '${createdAt}');`);
            }
        }

        // Photos
        sqlDump.push('\n-- Photos\n');
        for (const photo of photos) {
            const id = photo.id.replace(/'/g, "''");
            const filename = photo.filename.replace(/'/g, "''");
            const name = photo.name.replace(/'/g, "''");
            const photoPath = photo.path.replace(/'/g, "''");
            const trackId = photo.trackId ? `'${photo.trackId.replace(/'/g, "''")}'` : 'NULL';
            const createdAt = new Date(photo.createdAt).toISOString();

            sqlDump.push(`INSERT INTO "Photo" ("id", "filename", "name", "path", "latitude", "longitude", "trackId", "createdAt") VALUES ('${id}', '${filename}', '${name}', '${photoPath}', ${photo.latitude}, ${photo.longitude}, ${trackId}, '${createdAt}');`);
        }

        const sqlContent = sqlDump.join('\n');
        archive.append(sqlContent, { name: 'database/backup.sql' });

        // Finalize the archive
        await archive.finalize();

        console.log(`📦 Backup created: ${zipFilename}`);
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// Human-readable export - organized by tracks with photos
app.get('/api/export/organized', async (req, res) => {
    try {
        const timestamp = new Date().toISOString().split('T')[0];
        const zipFilename = `memorides-export-${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).send('Error creating export');
        });

        archive.pipe(res);

        // Get all tracks with their photos
        const tracks = await prisma.track.findMany({
            include: {
                photos: true,
                labels: {
                    include: {
                        label: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Create a directory for each track
        for (const track of tracks) {
            // Sanitize track name for folder name
            const trackName = (track.name || track.title || track.filename.replace('.gpx', ''))
                .replace(/[/\\:*?"<>|]/g, '_')
                .substring(0, 100); // Limit length

            const trackFolder = `traces/${trackName}`;

            // Add GPX file
            const gpxPath = path.join(gpxDir, track.filename);
            if (fs.existsSync(gpxPath)) {
                archive.file(gpxPath, { name: `${trackFolder}/trace.gpx` });
            }

            // Add track info as README
            const trackInfo = [
                `# ${track.name || track.title || 'Sans titre'}`,
                '',
                `**Type:** ${track.type || 'Non défini'}`,
                `**Direction:** ${track.direction || 'Non défini'}`,
                `**Distance:** ${track.distance ? (track.distance / 1000).toFixed(2) + ' km' : 'Non calculé'}`,
                `**Dénivelé:** ${track.elevation ? track.elevation.toFixed(0) + ' m' : 'Non calculé'}`,
                `**Durée:** ${track.duration ? (track.duration / 60).toFixed(0) + ' min' : 'Non calculé'}`,
                `**Complétée:** ${track.completedAt ? new Date(track.completedAt).toLocaleDateString('fr-FR') : 'Non'}`,
                '',
                track.labels.length > 0 ? `**Libellés:** ${track.labels.map(l => l.label.name).join(', ')}` : '',
                '',
                track.comments ? `## Commentaires\n\n${track.comments}` : '',
                '',
                `---`,
                `*Créé le ${new Date(track.createdAt).toLocaleDateString('fr-FR')}*`
            ].filter(line => line !== '').join('\n');

            archive.append(trackInfo, { name: `${trackFolder}/README.md` });

            // Add photos
            if (track.photos && track.photos.length > 0) {
                for (let i = 0; i < track.photos.length; i++) {
                    const photo = track.photos[i];
                    const photoPath = path.join(__dirname, photo.path);
                    if (fs.existsSync(photoPath)) {
                        const ext = path.extname(photo.filename);
                        const photoName = `photo-${String(i + 1).padStart(2, '0')}${ext}`;
                        archive.file(photoPath, { name: `${trackFolder}/photos/${photoName}` });
                    }
                }
            }
        }

        // Add database exports as CSV
        const tracksCSV = [
            'ID,Filename,Name,Title,Type,Direction,Color,Distance(m),Elevation(m),Duration(min),CompletedAt,Comments,Labels,CreatedAt,UpdatedAt',
            ...tracks.map(t => [
                t.id,
                `"${t.filename}"`,
                `"${t.name || ''}"`,
                `"${t.title || ''}"`,
                t.type || '',
                t.direction || '',
                t.color || '',
                t.distance || '',
                t.elevation || '',
                t.duration || '',
                t.completedAt ? new Date(t.completedAt).toISOString() : '',
                `"${(t.comments || '').replace(/"/g, '""')}"`,
                `"${t.labels.map(l => l.label.name).join(', ')}"`,
                new Date(t.createdAt).toISOString(),
                new Date(t.updatedAt).toISOString()
            ].join(','))
        ].join('\n');

        archive.append(tracksCSV, { name: 'database/tracks.csv' });

        // Labels CSV
        const labels = await prisma.label.findMany({
            orderBy: { name: 'asc' }
        });

        const labelsCSV = [
            'ID,Name,CreatedAt',
            ...labels.map(l => [
                l.id,
                `"${l.name}"`,
                new Date(l.createdAt).toISOString()
            ].join(','))
        ].join('\n');

        archive.append(labelsCSV, { name: 'database/labels.csv' });

        // Photos CSV
        const allPhotos = await prisma.photo.findMany({
            orderBy: { createdAt: 'desc' }
        });

        const photosCSV = [
            'ID,Filename,Name,Path,Latitude,Longitude,TrackID,CreatedAt',
            ...allPhotos.map(p => [
                p.id,
                `"${p.filename}"`,
                `"${p.name}"`,
                `"${p.path}"`,
                p.latitude,
                p.longitude,
                p.trackId || '',
                new Date(p.createdAt).toISOString()
            ].join(','))
        ].join('\n');

        archive.append(photosCSV, { name: 'database/photos.csv' });

        // Add a main README
        const mainReadme = [
            '# Memorides Export',
            '',
            `Export créé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`,
            '',
            '## Structure',
            '',
            '- **traces/** : Un dossier par trace contenant :',
            '  - `trace.gpx` : Le fichier GPX de la trace',
            '  - `README.md` : Informations détaillées sur la trace',
            '  - `photos/` : Photos associées à la trace (si présentes)',
            '',
            '- **database/** : Exports CSV de la base de données :',
            '  - `tracks.csv` : Liste de toutes les traces',
            '  - `photos.csv` : Liste de toutes les photos',
            '  - `labels.csv` : Liste des libellés',
            '',
            `## Statistiques`,
            '',
            `- **${tracks.length}** traces`,
            `- **${allPhotos.length}** photos`,
            `- **${labels.length}** libellés`,
            '',
            '---',
            '*Généré par Memorides - https://github.com/Cyril5C/memorides*'
        ].join('\n');

        archive.append(mainReadme, { name: 'README.md' });

        // Finalize
        await archive.finalize();

        console.log(`📦 Organized export created: ${zipFilename}`);
    } catch (error) {
        console.error('Error creating organized export:', error);
        res.status(500).json({ error: 'Failed to create export' });
    }
});

// Admin endpoint to cleanup orphaned tracks
app.post('/api/admin/cleanup-orphaned-tracks', async (req, res) => {
    try {
        const tracks = await prisma.track.findMany({
            select: { id: true, filename: true, name: true }
        });

        let deleted = 0;
        const deletedTracks = [];

        for (const track of tracks) {
            const filePath = path.join(gpxDir, track.filename);

            if (!fs.existsSync(filePath)) {
                await prisma.track.delete({ where: { id: track.id } });
                deleted++;
                deletedTracks.push({ id: track.id, name: track.name || track.filename });
            }
        }

        res.json({
            success: true,
            message: `${deleted} orphaned tracks deleted`,
            deletedTracks
        });
    } catch (error) {
        console.error('Error cleaning orphaned tracks:', error);
        res.status(500).json({ error: 'Failed to cleanup orphaned tracks' });
    }
});

// ============= SHARE LINKS ENDPOINTS =============

// Create a share link for a track
app.post('/api/share-links', async (req, res) => {
    try {
        const { trackId } = req.body;

        if (!trackId) {
            return res.status(400).json({ error: 'Track ID is required' });
        }

        // Verify track exists
        const track = await prisma.track.findUnique({
            where: { id: trackId }
        });

        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        // Generate unique token
        const crypto = require('crypto');
        const token = crypto.randomBytes(16).toString('hex');

        // Set expiration date to 15 days from now
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 15);

        // Create share link
        const shareLink = await prisma.shareLink.create({
            data: {
                token,
                trackId,
                expiresAt
            },
            include: {
                track: {
                    select: {
                        id: true,
                        name: true,
                        filename: true
                    }
                }
            }
        });

        res.json({
            success: true,
            shareLink,
            url: `/share/${token}`
        });
    } catch (error) {
        console.error('Error creating share link:', error);
        res.status(500).json({ error: 'Failed to create share link' });
    }
});

// List all share links (admin only)
app.get('/api/share-links', async (req, res) => {
    try {
        const shareLinks = await prisma.shareLink.findMany({
            include: {
                track: {
                    select: {
                        id: true,
                        name: true,
                        filename: true,
                        distance: true,
                        elevation: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Add expiration status to each link
        const now = new Date();
        const enrichedLinks = shareLinks.map(link => ({
            ...link,
            isExpired: link.expiresAt < now || !link.active
        }));

        res.json({ shareLinks: enrichedLinks });
    } catch (error) {
        console.error('Error fetching share links:', error);
        res.status(500).json({ error: 'Failed to fetch share links' });
    }
});

// Delete a share link (admin only)
app.delete('/api/share-links/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('Attempting to delete share link with ID:', id);

        // Check if share link exists
        const existingLink = await prisma.shareLink.findUnique({
            where: { id }
        });

        if (!existingLink) {
            console.log('Share link not found:', id);
            return res.status(404).json({ error: 'Share link not found' });
        }

        // Delete the share link
        await prisma.shareLink.delete({
            where: { id }
        });

        console.log('Successfully deleted share link:', id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting share link:', error);
        console.error('Error details:', error.message);
        res.status(500).json({ error: 'Failed to delete share link', details: error.message });
    }
});

// Get share links for a specific track
app.get('/api/tracks/:trackId/share-links', async (req, res) => {
    try {
        const { trackId } = req.params;

        const shareLinks = await prisma.shareLink.findMany({
            where: { trackId },
            orderBy: { createdAt: 'desc' }
        });

        // Add expiration status
        const now = new Date();
        const enrichedLinks = shareLinks.map(link => ({
            ...link,
            isExpired: link.expiresAt < now || !link.active
        }));

        res.json({ shareLinks: enrichedLinks });
    } catch (error) {
        console.error('Error fetching track share links:', error);
        res.status(500).json({ error: 'Failed to fetch share links' });
    }
});

// Start server with async initialization
async function startServer() {
    try {
        // Ensure directories exist before starting server
        await ensureDirectories();

        // Start listening
        app.listen(PORT, '0.0.0.0', async () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
            console.log(`📁 GPX files: ${gpxDir}`);
            console.log(`📸 Photos: ${photosDir}`);

            // Test database connection after server is up
            try {
                await prisma.$queryRaw`SELECT 1`;
                console.log('✅ Database connection verified');

        // Check if TrackType table exists and seed if needed
        try {
            const trackTypesCount = await prisma.trackType.count();
            if (trackTypesCount === 0) {
                console.log('🌱 Seeding track types...');
                const trackTypes = [
                    { value: 'hiking', label: 'Randonnée', icon: '🥾', order: 1 },
                    { value: 'cycling', label: 'Vélo route', icon: '🚴', order: 2 },
                    { value: 'gravel', label: 'Gravel', icon: '🚵', order: 3 }
                ];

                for (const type of trackTypes) {
                    await prisma.trackType.create({ data: type });
                }
                console.log('✅ Track types seeded successfully');
            }
        } catch (tableError) {
            console.log('⚠️  TrackType table not found, it will be created on next deploy with prisma db push');
            console.log('   Run "npx prisma db push" manually in production to create the table');
        }
            } catch (error) {
                console.error('⚠️  Database connection failed:', error.message);
                console.error('Server is running but database queries will fail');
            }
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();
