require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

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
        if (file.mimetype === 'application/gpx+xml' || file.originalname.endsWith('.gpx')) {
            cb(null, gpxDir);
        } else if (file.mimetype.startsWith('image/')) {
            cb(null, photosDir);
        } else {
            cb(new Error('Invalid file type'));
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
app.post('/api/gpx/upload', upload.single('gpx'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Extract metadata from request body
        const { name, title, comments, type, direction, color, distance, elevation, duration } = req.body;

        // Save to database
        const track = await prisma.track.create({
            data: {
                filename: req.file.filename,
                name: name || req.file.originalname.replace('.gpx', ''),
                title: title || null,
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
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Error uploading file' });
    }
});

// Update track metadata
app.patch('/api/gpx/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const { name, title, comments, labels, type, direction, color } = req.body;

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
                ...(color && { color })
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
app.post('/api/photos/upload', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Extract metadata from request body
        const { name, latitude, longitude, trackId } = req.body;

        if (!latitude || !longitude) {
            fs.unlinkSync(req.file.path);
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
            fs.unlinkSync(req.file.path);
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

// Get GPX file content
app.get('/api/gpx/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(gpxDir, filename);

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

        const content = fs.readFileSync(filePath, 'utf8');
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
        const filePath = path.join(gpxDir, filename);

        // Delete from database
        await prisma.track.delete({
            where: { filename }
        });

        // Delete file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true, message: 'Track deleted' });
    } catch (error) {
        console.error('Error deleting GPX file:', error);
        res.status(500).json({ error: 'Error deleting file' });
    }
});

// Delete photo and metadata
app.delete('/api/photos/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(photosDir, filename);

        // Delete from database
        await prisma.photo.delete({
            where: { filename }
        });

        // Delete file
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true, message: 'Photo deleted' });
    } catch (error) {
        console.error('Error deleting photo:', error);
        res.status(500).json({ error: 'Error deleting file' });
    }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

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
