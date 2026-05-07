const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.RENDER ? '/opt/render/project/src/data' : __dirname;
const dbPath = path.join(dataDir, 'watchlist.db');

async function migrate() {
    const SQL = await initSqlJs();

    if (!fs.existsSync(dbPath)) {
        console.log('No database found - will be created with new schema');
        return;
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    console.log('🔄 Starting migration: Remove UNIQUE constraint from reviews table');

    // Get existing reviews
    const reviews = db.exec('SELECT * FROM reviews');
    const reviewCount = reviews.length > 0 ? reviews[0].values.length : 0;
    console.log(`Found ${reviewCount} existing reviews`);

    // Drop old reviews table
    db.run('DROP TABLE IF EXISTS reviews');

    // Recreate with UNIQUE on (submission_id, reviewer_name) instead
    db.run(`
        CREATE TABLE reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL,
            reviewer_id INTEGER NOT NULL,
            reviewer_name TEXT NOT NULL,
            confidence_level INTEGER NOT NULL,
            reasoning TEXT NOT NULL,
            price_target TEXT,
            time_horizon TEXT NOT NULL,
            sector TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id),
            FOREIGN KEY (reviewer_id) REFERENCES users(id),
            UNIQUE(submission_id, reviewer_name)
        )
    `);

    // Restore reviews if any existed
    if (reviews.length > 0 && reviews[0].values.length > 0) {
        reviews[0].values.forEach(row => {
            db.run(
                `INSERT INTO reviews (id, submission_id, reviewer_id, reviewer_name, confidence_level, reasoning, price_target, time_horizon, sector, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                row
            );
        });
        console.log(`✅ Restored ${reviews[0].values.length} reviews`);
    }

    // Save database
    const data = db.export();
    const newBuffer = Buffer.from(data);
    fs.writeFileSync(dbPath, newBuffer);

    console.log('✅ Migration complete: UNIQUE constraint now on (submission_id, reviewer_name)');
    db.close();
}

migrate().catch(console.error);
