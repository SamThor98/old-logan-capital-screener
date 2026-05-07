const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const db = require('./database');
const discord = require('./discord');

const app = express();
const PORT = process.env.PORT || 3000;

// Use persistent disk path on Render, local path otherwise
const dataDir = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
const uploadsDir = path.join(dataDir, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8081',
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.use(session({
    secret: 'OLC-watchlist-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.doc', '.docx', '.csv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
}

// ===== AUTHENTICATION ROUTES =====

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const users = db.query('SELECT * FROM users WHERE username = ?', [username]);

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.fullName = user.full_name;

        res.json({
            id: user.id,
            username: user.username,
            fullName: user.full_name
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({
        id: req.session.userId,
        username: req.session.username,
        fullName: req.session.fullName
    });
});

// ===== SUBMISSION ROUTES =====

app.post('/api/submissions', requireAuth, upload.array('attachments', 5), async (req, res) => {
    try {
        const {
            ticker,
            companyName,
            confidenceLevel,
            reasoning,
            priceTarget,
            timeHorizon,
            sector
        } = req.body;

        // Insert submission
        db.run(`
            INSERT INTO submissions (
                ticker, company_name, submitter_id, submitter_name,
                confidence_level, reasoning, price_target, time_horizon, sector, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')
        `, [
            ticker.toUpperCase(),
            companyName,
            req.session.userId,
            req.session.fullName,
            confidenceLevel,
            reasoning,
            priceTarget || null,
            timeHorizon,
            sector || null
        ]);

        const submissionId = db.getLastInsertId();

        // Handle file attachments
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                db.run(`
                    INSERT INTO attachments (submission_id, filename, filepath, file_type, file_size)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    submissionId,
                    file.originalname,
                    file.filename,
                    file.mimetype,
                    file.size
                ]);
            });
        }

        // Send Discord notification
        await discord.sendNewSubmissionNotification(ticker.toUpperCase(), req.session.fullName);

        res.json({ success: true, submissionId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/submissions', requireAuth, (req, res) => {
    try {
        const submissions = db.query(`
            SELECT
                s.*,
                (SELECT COUNT(*) FROM reviews WHERE submission_id = s.id) as review_count,
                (SELECT AVG(confidence_level) FROM reviews WHERE submission_id = s.id) as avg_confidence
            FROM submissions s
            ORDER BY s.created_at DESC
        `);

        res.json(submissions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/submissions/:id', requireAuth, (req, res) => {
    try {
        const submissionId = req.params.id;

        const submission = db.query('SELECT * FROM submissions WHERE id = ?', [submissionId]);

        if (submission.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        const attachments = db.query('SELECT * FROM attachments WHERE submission_id = ?', [submissionId]);
        const reviews = db.query('SELECT * FROM reviews WHERE submission_id = ?', [submissionId]);

        // Check if all reviews are complete (3 reviews needed)
        const reviewsComplete = reviews.length >= 3;

        res.json({
            ...submission[0],
            attachments,
            reviews: reviewsComplete ? reviews : [],
            reviewsComplete
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== REVIEW ROUTES =====

app.post('/api/reviews', requireAuth, upload.array('attachments', 5), async (req, res) => {
    try {
        const {
            submissionId,
            confidenceLevel,
            reasoning,
            priceTarget,
            timeHorizon,
            sector
        } = req.body;

        // Check if user already reviewed this
        const existing = db.query(
            'SELECT * FROM reviews WHERE submission_id = ? AND reviewer_id = ?',
            [submissionId, req.session.userId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ error: 'You already reviewed this submission' });
        }

        // Check if user is the submitter
        const submission = db.query('SELECT * FROM submissions WHERE id = ?', [submissionId]);
        if (submission[0].submitter_id === req.session.userId) {
            return res.status(400).json({ error: 'Cannot review your own submission' });
        }

        // Insert review
        db.run(`
            INSERT INTO reviews (
                submission_id, reviewer_id, reviewer_name,
                confidence_level, reasoning, price_target, time_horizon, sector
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            submissionId,
            req.session.userId,
            req.session.fullName,
            confidenceLevel,
            reasoning,
            priceTarget || null,
            timeHorizon,
            sector || null
        ]);

        const reviewId = db.getLastInsertId();

        // Handle file attachments
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                db.run(`
                    INSERT INTO attachments (review_id, filename, filepath, file_type, file_size)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    reviewId,
                    file.originalname,
                    file.filename,
                    file.mimetype,
                    file.size
                ]);
            });
        }

        // Check review progress
        const reviews = db.query('SELECT * FROM reviews WHERE submission_id = ?', [submissionId]);
        const reviewsNeeded = 3; // All 3 other team members

        // Send Discord notification
        await discord.sendReviewCompleteNotification(
            submission[0].ticker,
            req.session.fullName,
            reviews.length,
            reviewsNeeded
        );

        // If all reviews complete, send final notification
        if (reviews.length >= reviewsNeeded) {
            const avgConfidence = reviews.reduce((sum, r) => sum + r.confidence_level, 0) / reviews.length;

            // Update submission status
            db.run('UPDATE submissions SET status = ? WHERE id = ?', ['under_review', submissionId]);

            await discord.sendAllReviewsCompleteNotification(
                submission[0].ticker,
                avgConfidence
            );
        }

        res.json({ success: true, reviewId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/pending-reviews', requireAuth, (req, res) => {
    try {
        // Get submissions that need review from current user
        const pending = db.query(`
            SELECT s.*
            FROM submissions s
            WHERE s.submitter_id != ?
            AND s.id NOT IN (
                SELECT submission_id FROM reviews WHERE reviewer_id = ?
            )
            ORDER BY s.created_at DESC
        `, [req.session.userId, req.session.userId]);

        res.json(pending);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== WATCHLIST ROUTES =====

app.post('/api/watchlist/approve/:id', requireAuth, (req, res) => {
    try {
        const submissionId = req.params.id;

        // Calculate average confidence
        const reviews = db.query('SELECT * FROM reviews WHERE submission_id = ?', [submissionId]);
        const submission = db.query('SELECT * FROM submissions WHERE id = ?', [submissionId]);

        if (submission.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Include submitter's confidence in average
        const allConfidenceLevels = [submission[0].confidence_level, ...reviews.map(r => r.confidence_level)];
        const avgConfidence = allConfidenceLevels.reduce((sum, c) => sum + c, 0) / allConfidenceLevels.length;

        // Add to watchlist
        db.run(`
            INSERT INTO watchlist (submission_id, avg_confidence)
            VALUES (?, ?)
        `, [submissionId, avgConfidence]);

        // Update submission status
        db.run(`
            UPDATE submissions SET status = 'approved', approved_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [submissionId]);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/watchlist', requireAuth, (req, res) => {
    try {
        const watchlist = db.query(`
            SELECT
                w.*,
                s.ticker,
                s.company_name,
                s.submitter_name,
                s.sector,
                s.time_horizon,
                s.created_at
            FROM watchlist w
            JOIN submissions s ON w.submission_id = s.id
            ORDER BY w.avg_confidence DESC, w.added_at DESC
        `);

        res.json(watchlist);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== FILE DOWNLOAD ROUTE =====

app.get('/api/files/:filename', requireAuth, (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadsDir, filename);

    if (fs.existsSync(filepath)) {
        res.download(filepath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// ===== START SERVER =====

async function startServer() {
    try {
        await db.initDatabase();
        console.log('Database initialized');

        app.listen(PORT, () => {
            console.log(`\n✅ Watchlist Management Server running on http://localhost:${PORT}`);
            console.log(`\n📊 Default login credentials:`);
            console.log(`   Username: paxton | sam | alex | garett`);
            console.log(`   Password: OLCTeam2025\n`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
