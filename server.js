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

console.log('🔧 Initializing server...');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 3001);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ Set' : '✗ Not set');

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
    // Keep Unicode characters, spaces, etc. for international filenames
    return basename.replace(/[\x00-\x1f\x7f\/\\:*?"<>|]/g, '');
}

// Security: Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Trop de requêtes, réessayez plus tard',
    standardHeaders: true,
    legacyHeaders: false
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 uploads per hour
    message: 'Trop d\'uploads, réessayez dans 1 heure',
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware
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

// Rate limiting on API routes
app.use('/api', generalLimiter);

app.use(express.json());
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

// Create uploads directories if they don't exist
const uploadsDir = path.join(__dirname, 'uploads');
const gpxDir = path.join(uploadsDir, 'gpx');
const photosDir = path.join(uploadsDir, 'photos');

[uploadsDir, gpxDir, photosDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

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
        cb(null, uniqueSuffix + '-' + file.originalname);
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
        const { name, title, comments, type, direction, color, distance, elevation, duration } = req.body;

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
                type: type || 'hiking',
                direction: direction || 'one-way',
                color: color || '#2563eb',
                distance: parseFloat(distance) || 0,
                elevation: parseFloat(elevation) || 0,
                duration: duration ? parseFloat(duration) : null
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
        const { name, title, comments, labels, type, direction, color, completedAt } = req.body;

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
                for (const labelName of labels) {
                    // Create or get label
                    const label = await prisma.label.upsert({
                        where: { name: labelName },
                        create: { name: labelName },
                        update: {}
                    });

                    // Create track-label relation
                    await prisma.trackLabel.create({
                        data: {
                            trackId: existingTrack.id,
                            labelId: label.id
                        }
                    });
                }
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
app.post('/api/photos/upload', uploadLimiter, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Extract metadata from request body
        const { name, latitude, longitude, trackId } = req.body;

        if (!latitude || !longitude) {
            await fsPromises.unlink(req.file.path);
            return res.status(400).json({ error: 'GPS coordinates required' });
        }

        // Save to database
        const photo = await prisma.photo.create({
            data: {
                filename: req.file.filename,
                name: name || req.file.originalname,
                path: `/uploads/photos/${req.file.filename}`,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                trackId: trackId || null
            }
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
});

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
            orderBy: {
                name: 'asc'
            }
        });

        res.json({ success: true, labels });
    } catch (error) {
        console.error('Error listing labels:', error);
        res.status(500).json({ error: 'Error listing labels' });
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
app.delete('/api/gpx/:filename', async (req, res) => {
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
            for (const photo of track.photos) {
                const photoPath = path.join(photosDir, sanitizeFilename(photo.filename));
                console.log(`Deleting photo file: ${photoPath}`);
                if (fs.existsSync(photoPath)) {
                    await fsPromises.unlink(photoPath);
                }
                // Delete photo from database
                await prisma.photo.delete({
                    where: { id: photo.id }
                }).catch(err => console.error(`Error deleting photo ${photo.id}:`, err));
            }
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
});

// Delete photo and metadata
app.delete('/api/photos/:filename', async (req, res) => {
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
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

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

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📁 GPX files: ${gpxDir}`);
    console.log(`📸 Photos: ${photosDir}`);

    // Test database connection after server is up
    try {
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection verified');
    } catch (error) {
        console.error('⚠️  Database connection failed:', error.message);
        console.error('Server is running but database queries will fail');
    }
});
