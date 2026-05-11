import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join } from 'path';
import type {
    User, Tour, NewTour,
    Session, NewSession,
    Segment, NewSegment,
    MapMarker, NewMapMarker,
    GpxData,
} from './types.js';

const DB_PATH = join(process.cwd(), 'data', 'training.db');

let _db: ReturnType<typeof Database> | null = null;

function getDb() {
    if (_db) return _db;
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    _db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE,
            password_hash TEXT    NOT NULL,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            token      TEXT    PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tours (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name        TEXT    NOT NULL,
            description TEXT    NOT NULL DEFAULT '',
            gpx_data    TEXT    DEFAULT NULL,
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            tour_id   INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
            date      TEXT    NOT NULL,
            name      TEXT    NOT NULL,
            distance  INTEGER NOT NULL,
            duration  INTEGER NOT NULL,
            elevation INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS segments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tour_id     INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
            position    INTEGER NOT NULL,
            name        TEXT    NOT NULL DEFAULT '',
            start_km    REAL    NOT NULL,
            end_km      REAL    NOT NULL,
            notes       TEXT    NOT NULL DEFAULT '',
            sightseeing INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
            tour_id INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
            key     TEXT    NOT NULL,
            value   TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (tour_id, key)
        );

        CREATE TABLE IF NOT EXISTS markers (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            tour_id  INTEGER NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
            name     TEXT    NOT NULL DEFAULT '',
            orig_lat REAL    NOT NULL DEFAULT 0,
            orig_lon REAL    NOT NULL DEFAULT 0
        );
    `);

    return _db;
}

// -- Users ---------------------------------------------------------

export function createUser(username: string, passwordHash: string): User {
    const result = getDb().prepare(
        'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    ).run(username, passwordHash);
    return getDb().prepare('SELECT id, username, created_at FROM users WHERE id=?')
        .get(result.lastInsertRowid) as User;
}

export function getUserByUsername(username: string): (User & { password_hash: string }) | null {
    return getDb().prepare('SELECT id, username, password_hash, created_at FROM users WHERE username=?')
        .get(username) as (User & { password_hash: string }) | null;
}

export function getUserById(id: number): User | null {
    return getDb().prepare('SELECT id, username, created_at FROM users WHERE id=?')
        .get(id) as User | null;
}

// -- Auth Sessions -------------------------------------------------

export function createAuthSession(token: string, userId: number, expiresAt: string): void {
    getDb().prepare(
        'INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(token, userId, expiresAt);
}

export function getAuthSession(token: string): { user_id: number; expires_at: string } | null {
    return getDb().prepare(
        'SELECT user_id, expires_at FROM auth_sessions WHERE token=?'
    ).get(token) as { user_id: number; expires_at: string } | null;
}

export function deleteAuthSession(token: string): void {
    getDb().prepare('DELETE FROM auth_sessions WHERE token=?').run(token);
}

export function deleteExpiredAuthSessions(): void {
    getDb().prepare("DELETE FROM auth_sessions WHERE expires_at < datetime('now')").run();
}

// -- Tours ---------------------------------------------------------

export function getUserTours(userId: number): Tour[] {
    return getDb().prepare(
        'SELECT id, user_id, name, description, gpx_data, created_at FROM tours WHERE user_id=? ORDER BY created_at ASC'
    ).all(userId) as Tour[];
}

export function getTour(id: number): Tour | null {
    return getDb().prepare(
        'SELECT id, user_id, name, description, gpx_data, created_at FROM tours WHERE id=?'
    ).get(id) as Tour | null;
}

export function createTour(data: NewTour): Tour {
    const result = getDb().prepare(
        'INSERT INTO tours (user_id, name, description) VALUES (@user_id, @name, @description)'
    ).run(data);
    return getDb().prepare('SELECT id, user_id, name, description, gpx_data, created_at FROM tours WHERE id=?')
        .get(result.lastInsertRowid) as Tour;
}

export function updateTour(id: number, data: Partial<Pick<Tour, 'name' | 'description'>>): Tour | null {
    const fields: string[] = [];
    if (data.name !== undefined) fields.push('name=@name');
    if (data.description !== undefined) fields.push('description=@description');
    if (fields.length === 0) return getTour(id);
    const result = getDb().prepare(`UPDATE tours SET ${fields.join(', ')} WHERE id=@id`).run({ ...data, id });
    if (result.changes === 0) return null;
    return getTour(id);
}

export function deleteTour(id: number): boolean {
    return getDb().prepare('DELETE FROM tours WHERE id=?').run(id).changes > 0;
}

// -- GPX -----------------------------------------------------------

export function getTourGpx(tourId: number): GpxData | null {
    const row = getDb().prepare('SELECT gpx_data FROM tours WHERE id=?').get(tourId) as { gpx_data: string | null } | null;
    if (!row || !row.gpx_data) return null;
    try { return JSON.parse(row.gpx_data) as GpxData; } catch { return null; }
}

export function setTourGpx(tourId: number, data: GpxData): void {
    getDb().prepare('UPDATE tours SET gpx_data=? WHERE id=?').run(JSON.stringify(data), tourId);
}

export function deleteTourGpx(tourId: number): void {
    getDb().prepare('UPDATE tours SET gpx_data=NULL WHERE id=?').run(tourId);
}

// -- Training Sessions ---------------------------------------------

export function getAllSessions(tourId: number): Session[] {
    return getDb().prepare(
        'SELECT * FROM sessions WHERE tour_id=? ORDER BY date ASC, id ASC'
    ).all(tourId) as Session[];
}

export function insertSession(data: NewSession): Session {
    const result = getDb().prepare(`
        INSERT INTO sessions (tour_id, date, name, distance, duration, elevation)
        VALUES (@tour_id, @date, @name, @distance, @duration, @elevation)
    `).run(data);
    return getDb().prepare('SELECT * FROM sessions WHERE id=?').get(result.lastInsertRowid) as Session;
}

export function deleteSession(tourId: number, id: number): boolean {
    return getDb().prepare('DELETE FROM sessions WHERE id=? AND tour_id=?').run(id, tourId).changes > 0;
}

export function updateSession(tourId: number, id: number, data: Omit<NewSession, 'tour_id'>): Session | null {
    const result = getDb().prepare(`
        UPDATE sessions SET date=@date, name=@name, distance=@distance, duration=@duration, elevation=@elevation
        WHERE id=@id AND tour_id=@tour_id
    `).run({ ...data, id, tour_id: tourId });
    if (result.changes === 0) return null;
    return getDb().prepare('SELECT * FROM sessions WHERE id=?').get(id) as Session;
}

// -- Segments ------------------------------------------------------

export function getAllSegments(tourId: number): Segment[] {
    return getDb().prepare(
        'SELECT * FROM segments WHERE tour_id=? ORDER BY position ASC'
    ).all(tourId) as Segment[];
}

export function replaceSegments(tourId: number, segments: NewSegment[]): Segment[] {
    const db = getDb();
    db.prepare('DELETE FROM segments WHERE tour_id=?').run(tourId);
    const insert = db.prepare(`
        INSERT INTO segments (tour_id, position, name, start_km, end_km, notes, sightseeing)
        VALUES (@tour_id, @position, @name, @start_km, @end_km, @notes, @sightseeing)
    `);
    const insertMany = db.transaction((rows: NewSegment[]) => {
        for (const row of rows) insert.run(row);
    });
    insertMany(segments);
    return getAllSegments(tourId);
}

export function updateSegment(
    tourId: number,
    id: number,
    data: Partial<Pick<Segment, 'name' | 'notes' | 'start_km' | 'end_km' | 'sightseeing'>>
): Segment | null {
    const fields: string[] = [];
    if (data.name !== undefined) fields.push('name=@name');
    if (data.notes !== undefined) fields.push('notes=@notes');
    if (data.start_km !== undefined) fields.push('start_km=@start_km');
    if (data.end_km !== undefined) fields.push('end_km=@end_km');
    if (data.sightseeing !== undefined) fields.push('sightseeing=@sightseeing');
    if (fields.length === 0) {
        return getDb().prepare('SELECT * FROM segments WHERE id=? AND tour_id=?').get(id, tourId) as Segment | null;
    }
    const result = getDb().prepare(`UPDATE segments SET ${fields.join(', ')} WHERE id=@id AND tour_id=@tour_id`)
        .run({ ...data, id, tour_id: tourId });
    if (result.changes === 0) return null;
    return getDb().prepare('SELECT * FROM segments WHERE id=?').get(id) as Segment;
}

// -- Settings ------------------------------------------------------

export function getSetting(tourId: number, key: string): string {
    const row = getDb().prepare('SELECT value FROM settings WHERE tour_id=? AND key=?').get(tourId, key) as { value: string } | undefined;
    return row?.value ?? '';
}

export function setSetting(tourId: number, key: string, value: string): void {
    getDb().prepare(
        'INSERT INTO settings (tour_id, key, value) VALUES (?, ?, ?) ON CONFLICT(tour_id, key) DO UPDATE SET value=excluded.value'
    ).run(tourId, key, value);
}

// -- Markers -------------------------------------------------------

export function getAllMarkers(tourId: number): MapMarker[] {
    return getDb().prepare(
        'SELECT * FROM markers WHERE tour_id=? ORDER BY name ASC'
    ).all(tourId) as MapMarker[];
}

export function insertMarker(data: NewMapMarker): MapMarker {
    const result = getDb().prepare(
        'INSERT INTO markers (tour_id, name, orig_lat, orig_lon) VALUES (@tour_id, @name, @orig_lat, @orig_lon)'
    ).run(data);
    return getDb().prepare('SELECT * FROM markers WHERE id=?').get(result.lastInsertRowid) as MapMarker;
}

export function deleteMarker(tourId: number, id: number): boolean {
    return getDb().prepare('DELETE FROM markers WHERE id=? AND tour_id=?').run(id, tourId).changes > 0;
}
