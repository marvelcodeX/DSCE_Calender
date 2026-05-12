const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'calendar.db');
let db = null;

// Initialize database connection
function getDatabase() {
    if (!db) {
        db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
            console.log('✅ Connected to SQLite database');
        });
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
    }
    return db;
}

// Initialize database schema
function initialize() {
    return new Promise((resolve, reject) => {
        const database = getDatabase();
        
        // Create tables
        const createTables = `
            -- Calendars table
            CREATE TABLE IF NOT EXISTS calendars (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                semester TEXT NOT NULL,
                academic_year TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                sem_end_exam_date TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP

            );

            CREATE TRIGGER IF NOT EXISTS trg_calendars_updated
                AFTER UPDATE ON calendars
                FOR EACH ROW
                BEGIN
                    UPDATE calendars
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = OLD.id;
                    END;
                    
            -- Events table (IAT, Lab assessments)
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                calendar_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                event_name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
            );

            -- Holidays table
            CREATE TABLE IF NOT EXISTS holidays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                calendar_id INTEGER,
                holiday_name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT,
                source TEXT DEFAULT 'custom',
                is_government BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE
            );

            -- Holiday cache table (for Google Calendar API)
            CREATE TABLE IF NOT EXISTS holiday_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year INTEGER NOT NULL UNIQUE,
                holidays_json TEXT NOT NULL,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- Index for performance
            CREATE INDEX IF NOT EXISTS idx_calendars_academic_year ON calendars(academic_year);
            CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);
            CREATE INDEX IF NOT EXISTS idx_holidays_calendar ON holidays(calendar_id);
            CREATE INDEX IF NOT EXISTS idx_holiday_cache_year ON holiday_cache(year);
        `;

        database.exec(createTables, (err) => {
            if (err) {
                console.error('Error creating tables:', err.message);
                reject(err);
            } else {
                console.log('✅ Database schema initialized');
                resolve();
            }
        });
    });
}

// Calendar operations
const calendarDb = {
    // Create new calendar
    create: (calendarData) => {
        return new Promise((resolve, reject) => {
            const { semester, academic_year, start_date, end_date, sem_end_exam_date } = calendarData;
            const sql = `
                INSERT INTO calendars (semester, academic_year, start_date, end_date, sem_end_exam_date)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            getDatabase().run(sql, [semester, academic_year, start_date, end_date, sem_end_exam_date], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, ...calendarData });
            });
        });
    },

    // Get all calendars
    getAll: () => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM calendars ORDER BY created_at DESC';
            getDatabase().all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Get calendar by ID
    getById: (id) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM calendars WHERE id = ?';
            getDatabase().get(sql, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    // Delete calendar
    delete: (id) => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM calendars WHERE id = ?';
            getDatabase().run(sql, [id], function(err) {
                if (err) reject(err);
                else resolve({ deleted: this.changes > 0 });
            });
        });
    },

    // Get calendar with all related data
    getWithDetails: async (id) => {
        const calendar = await calendarDb.getById(id);
        if (!calendar) return null;
    
        const events = await eventDb.getByCalendarId(id);
        const holidays = await holidayDb.getByCalendarId(id);
    
        return {
            ...calendar,
            events,
            holidays
        };
    }
    
};

// Event operations
const eventDb = {
    // Create event
    create: (eventData) => {
        return new Promise((resolve, reject) => {
            const { calendar_id, event_type, event_name, start_date, end_date } = eventData;
            const sql = `
                INSERT INTO events (calendar_id, event_type, event_name, start_date, end_date)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            getDatabase().run(sql, [calendar_id, event_type, event_name, start_date, end_date], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, ...eventData });
            });
        });
    },

    // Create multiple events
    createBatch: (events) => {
        return new Promise((resolve, reject) => {
            const db = getDatabase();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                const stmt = db.prepare(`
                    INSERT INTO events (calendar_id, event_type, event_name, start_date, end_date)
                    VALUES (?, ?, ?, ?, ?)
                `);

                let errors = [];
                events.forEach(event => {
                    stmt.run([
                        event.calendar_id,
                        event.event_type,
                        event.event_name,
                        event.start_date,
                        event.end_date
                    ], (err) => {
                        if (err) errors.push(err);
                    });
                });

                stmt.finalize((err) => {
                    if (err || errors.length > 0) {
                        db.run('ROLLBACK');
                        reject(err || errors[0]);
                    } else {
                        db.run('COMMIT');
                        resolve({ count: events.length });
                    }
                });
            });
        });
    },

    // Get events by calendar ID
    getByCalendarId: (calendarId) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM events WHERE calendar_id = ? ORDER BY start_date';
            getDatabase().all(sql, [calendarId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

// Holiday operations
const holidayDb = {
    // Create holiday
    create: (holidayData) => {
        return new Promise((resolve, reject) => {
            const { calendar_id, holiday_name, start_date, end_date, source, is_government } = holidayData;
            const sql = `
                INSERT INTO holidays (calendar_id, holiday_name, start_date, end_date, source, is_government)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            getDatabase().run(sql, [
                calendar_id || null, 
                holiday_name, 
                start_date, 
                end_date || null, 
                source || 'custom', 
                Boolean(is_government) ? 1 : 0
            ], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, ...holidayData });
            });
        });
    },

    // Create multiple holidays
    createBatch: (holidays) => {
        return new Promise((resolve, reject) => {
            const db = getDatabase();
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                const stmt = db.prepare(`
                    INSERT INTO holidays (calendar_id, holiday_name, start_date, end_date, source, is_government)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                let errors = [];
                holidays.forEach(holiday => {
                    stmt.run([
                        holiday.calendar_id || null,
                        holiday.holiday_name,
                        holiday.start_date,
                        holiday.end_date || null,
                        holiday.source || 'custom',
                        holiday.is_government ? 1 : 0
                    ], (err) => {
                        if (err) errors.push(err);
                    });
                });

                stmt.finalize((err) => {
                    if (err || errors.length > 0) {
                        db.run('ROLLBACK');
                        reject(err || errors[0]);
                    } else {
                        db.run('COMMIT');
                        resolve({ count: holidays.length });
                    }
                });
            });
        });
    },

    // Get holidays by calendar ID
    getByCalendarId: (calendarId) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM holidays WHERE calendar_id = ? ORDER BY start_date';
            getDatabase().all(sql, [calendarId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Get all holidays (no calendar association)
    getAll: () => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM holidays ORDER BY start_date';
            getDatabase().all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

// Holiday cache operations
const holidayCacheDb = {
    // Get cached holidays for a year
    get: (year) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM holiday_cache WHERE year = ?';
            getDatabase().get(sql, [year], (err, row) => {
                if (err) reject(err);
                else if (row) {
                    resolve({
                        year: row.year,
                        holidays: JSON.parse(row.holidays_json),
                        fetchedAt: row.fetched_at
                    });
                } else {
                    resolve(null);
                }
            });
        });
    },

    // Set cache for a year
    set: (year, holidays) => {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT OR REPLACE INTO holiday_cache (year, holidays_json, fetched_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `;
            const holidaysJson = JSON.stringify(holidays);
            
            getDatabase().run(sql, [year, holidaysJson], function(err) {
                if (err) reject(err);
                else resolve({ year, count: holidays.length });
            });
        });
    },

    // Clear old cache (older than 7 days)
    clearOld: () => {
        return new Promise((resolve, reject) => {
            const sql = `
                DELETE FROM holiday_cache 
                WHERE fetched_at < datetime('now', '-30 days')
            `;
            getDatabase().run(sql, [], function(err) {
                if (err) reject(err);
                else resolve({ deleted: this.changes });
            });
        });
    }
};

// Close database connection
function close() {
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('✅ Database connection closed');
            }
        });
    }
}

module.exports = {
    initialize,
    close,
    calendar: calendarDb,
    event: eventDb,
    holiday: holidayDb,
    holidayCache: holidayCacheDb
};