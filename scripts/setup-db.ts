/**
 * Run once to create all tables in your Neon Postgres database.
 * Usage: npm run setup-db
 * Requires DATABASE_URL in .env
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually (tsx doesn't load it automatically)
try {
    const env = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
    for (const line of env.split('\n')) {
        const match = line.match(/^([^#=\s][^=]*)=(.+)$/);
        if (match) process.env[match[1].trim()] = match[2].trim();
    }
} catch {
    // .env not found – rely on environment variables already set
}

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is not set. Add it to .env or set it as an environment variable.');
    process.exit(1);
}

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      TEXT   NOT NULL UNIQUE,
        password_hash TEXT   NOT NULL,
        created_at    TEXT   NOT NULL DEFAULT (NOW()::TEXT)
    )
`;

await sql`
    CREATE TABLE IF NOT EXISTS auth_sessions (
        token      TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT    NOT NULL
    )
`;

await sql`
    CREATE TABLE IF NOT EXISTS tours (
        id          SERIAL  PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL DEFAULT '',
        gpx_data    TEXT    DEFAULT NULL,
        created_at  TEXT    NOT NULL DEFAULT (NOW()::TEXT)
    )
`;

await sql`
    CREATE TABLE IF NOT EXISTS sessions (
        id        SERIAL  PRIMARY KEY,
        tour_id   INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
        date      TEXT    NOT NULL,
        name      TEXT    NOT NULL,
        distance  INTEGER NOT NULL,
        duration  INTEGER NOT NULL,
        elevation INTEGER NOT NULL DEFAULT 0
    )
`;

await sql`
    CREATE TABLE IF NOT EXISTS segments (
        id          SERIAL  PRIMARY KEY,
        tour_id     INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL,
        name        TEXT    NOT NULL DEFAULT '',
        start_km    REAL    NOT NULL,
        end_km      REAL    NOT NULL,
        notes       TEXT    NOT NULL DEFAULT '',
        sightseeing INTEGER NOT NULL DEFAULT 0
    )
`;

await sql`
    CREATE TABLE IF NOT EXISTS settings (
        tour_id INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
        key     TEXT    NOT NULL,
        value   TEXT    NOT NULL DEFAULT '',
        PRIMARY KEY (tour_id, key)
    )
`;

await sql`
    CREATE TABLE IF NOT EXISTS markers (
        id       SERIAL  PRIMARY KEY,
        tour_id  INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
        name     TEXT    NOT NULL DEFAULT '',
        orig_lat REAL    NOT NULL DEFAULT 0,
        orig_lon REAL    NOT NULL DEFAULT 0
    )
`;

console.log('Database schema created successfully.');
