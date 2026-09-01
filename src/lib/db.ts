import { neon } from '@neondatabase/serverless';
import { DATABASE_URL } from '$env/static/private';
import type {
    User, Tour, NewTour,
    Session, NewSession,
    Segment, NewSegment,
    MapMarker, NewMapMarker,
    GpxData,
} from './types.js';

const sql = neon(DATABASE_URL);

// -- Users ---------------------------------------------------------

export async function createUser(username: string, passwordHash: string): Promise<User> {
    const rows = await sql`
        INSERT INTO users (username, password_hash)
        VALUES (${username}, ${passwordHash})
        RETURNING id, username, created_at
    `;
    return rows[0] as User;
}

export async function getUserByUsername(username: string): Promise<(User & { password_hash: string }) | null> {
    const rows = await sql`
        SELECT id, username, password_hash, created_at FROM users WHERE username = ${username}
    `;
    return (rows[0] as (User & { password_hash: string })) ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
    const rows = await sql`
        SELECT id, username, created_at FROM users WHERE id = ${id}
    `;
    return (rows[0] as User) ?? null;
}

// -- Auth Sessions -------------------------------------------------

export async function createAuthSession(token: string, userId: number, expiresAt: string): Promise<void> {
    await sql`
        INSERT INTO auth_sessions (token, user_id, expires_at)
        VALUES (${token}, ${userId}, ${expiresAt})
    `;
}

export async function getAuthSession(token: string): Promise<{ user_id: number; expires_at: string } | null> {
    const rows = await sql`
        SELECT user_id, expires_at FROM auth_sessions WHERE token = ${token}
    `;
    return (rows[0] as { user_id: number; expires_at: string }) ?? null;
}

export async function deleteAuthSession(token: string): Promise<void> {
    await sql`DELETE FROM auth_sessions WHERE token = ${token}`;
}

export async function deleteExpiredAuthSessions(): Promise<void> {
    await sql`DELETE FROM auth_sessions WHERE expires_at::timestamptz < NOW()`;
}

// -- Tours ---------------------------------------------------------

export async function getUserTours(userId: number): Promise<Tour[]> {
    return await sql`
        SELECT id, user_id, name, description, gpx_data, created_at
        FROM tours WHERE user_id = ${userId} ORDER BY created_at ASC
    ` as Tour[];
}

export async function getTour(id: number): Promise<Tour | null> {
    const rows = await sql`
        SELECT id, user_id, name, description, gpx_data, created_at FROM tours WHERE id = ${id}
    `;
    return (rows[0] as Tour) ?? null;
}

export async function createTour(data: NewTour): Promise<Tour> {
    const rows = await sql`
        INSERT INTO tours (user_id, name, description)
        VALUES (${data.user_id}, ${data.name}, ${data.description})
        RETURNING id, user_id, name, description, gpx_data, created_at
    `;
    return rows[0] as Tour;
}

export async function updateTour(id: number, data: Partial<Pick<Tour, 'name' | 'description'>>): Promise<Tour | null> {
    if (data.name !== undefined && data.description !== undefined) {
        const rows = await sql`
            UPDATE tours SET name = ${data.name}, description = ${data.description}
            WHERE id = ${id}
            RETURNING id, user_id, name, description, gpx_data, created_at
        `;
        return (rows[0] as Tour) ?? null;
    } else if (data.name !== undefined) {
        const rows = await sql`
            UPDATE tours SET name = ${data.name} WHERE id = ${id}
            RETURNING id, user_id, name, description, gpx_data, created_at
        `;
        return (rows[0] as Tour) ?? null;
    } else if (data.description !== undefined) {
        const rows = await sql`
            UPDATE tours SET description = ${data.description} WHERE id = ${id}
            RETURNING id, user_id, name, description, gpx_data, created_at
        `;
        return (rows[0] as Tour) ?? null;
    }
    return getTour(id);
}

export async function deleteTour(id: number): Promise<boolean> {
    const result = await sql`DELETE FROM tours WHERE id = ${id}`;
    return (result as unknown as { rowCount: number }).rowCount > 0;
}

// -- GPX -----------------------------------------------------------

export async function getTourGpx(tourId: number): Promise<GpxData | null> {
    const rows = await sql`SELECT gpx_data FROM tours WHERE id = ${tourId}`;
    const row = rows[0] as { gpx_data: string | null } | undefined;
    if (!row || !row.gpx_data) return null;
    try { return JSON.parse(row.gpx_data) as GpxData; } catch { return null; }
}

export async function setTourGpx(tourId: number, data: GpxData): Promise<void> {
    await sql`UPDATE tours SET gpx_data = ${JSON.stringify(data)} WHERE id = ${tourId}`;
}

export async function deleteTourGpx(tourId: number): Promise<void> {
    await sql`UPDATE tours SET gpx_data = NULL WHERE id = ${tourId}`;
}

// -- Training Sessions ---------------------------------------------

export async function getAllSessions(tourId: number): Promise<Session[]> {
    return await sql`
        SELECT * FROM sessions WHERE tour_id = ${tourId} ORDER BY date ASC, id ASC
    ` as Session[];
}

export async function insertSession(data: NewSession): Promise<Session> {
    const rows = await sql`
        INSERT INTO sessions (tour_id, date, name, distance, duration, elevation)
        VALUES (${data.tour_id}, ${data.date}, ${data.name}, ${data.distance}, ${data.duration}, ${data.elevation})
        RETURNING *
    `;
    return rows[0] as Session;
}

export async function deleteSession(tourId: number, id: number): Promise<boolean> {
    const result = await sql`DELETE FROM sessions WHERE id = ${id} AND tour_id = ${tourId}`;
    return (result as unknown as { rowCount: number }).rowCount > 0;
}

export async function updateSession(tourId: number, id: number, data: Omit<NewSession, 'tour_id'>): Promise<Session | null> {
    const rows = await sql`
        UPDATE sessions
        SET date = ${data.date}, name = ${data.name}, distance = ${data.distance},
            duration = ${data.duration}, elevation = ${data.elevation}
        WHERE id = ${id} AND tour_id = ${tourId}
        RETURNING *
    `;
    return (rows[0] as Session) ?? null;
}

// -- Segments ------------------------------------------------------

export async function getAllSegments(tourId: number): Promise<Segment[]> {
    return await sql`
        SELECT * FROM segments WHERE tour_id = ${tourId} ORDER BY position ASC
    ` as Segment[];
}

export async function replaceSegments(tourId: number, segments: NewSegment[]): Promise<Segment[]> {
    await sql`DELETE FROM segments WHERE tour_id = ${tourId}`;
    if (segments.length > 0) {
        for (const seg of segments) {
            await sql`
                INSERT INTO segments (tour_id, position, name, start_km, end_km, notes, sightseeing)
                VALUES (${seg.tour_id}, ${seg.position}, ${seg.name}, ${seg.start_km}, ${seg.end_km}, ${seg.notes}, ${seg.sightseeing})
            `;
        }
    }
    return getAllSegments(tourId);
}

export async function updateSegment(
    tourId: number,
    id: number,
    data: Partial<Pick<Segment, 'name' | 'notes' | 'start_km' | 'end_km' | 'sightseeing'>>
): Promise<Segment | null> {
    const fields = Object.keys(data) as (keyof typeof data)[];
    if (fields.length === 0) {
        const rows = await sql`SELECT * FROM segments WHERE id = ${id} AND tour_id = ${tourId}`;
        return (rows[0] as Segment) ?? null;
    }
    // Build update with only provided fields
    if (data.name !== undefined && data.notes !== undefined && data.start_km !== undefined && data.end_km !== undefined && data.sightseeing !== undefined) {
        const rows = await sql`UPDATE segments SET name=${data.name}, notes=${data.notes}, start_km=${data.start_km}, end_km=${data.end_km}, sightseeing=${data.sightseeing} WHERE id=${id} AND tour_id=${tourId} RETURNING *`;
        return (rows[0] as Segment) ?? null;
    }
    // Partial updates — fetch current, merge, update
    const current = await sql`SELECT * FROM segments WHERE id = ${id} AND tour_id = ${tourId}`;
    if (!current[0]) return null;
    const cur = current[0] as Segment;
    const rows = await sql`
        UPDATE segments
        SET name       = ${data.name ?? cur.name},
            notes      = ${data.notes ?? cur.notes},
            start_km   = ${data.start_km ?? cur.start_km},
            end_km     = ${data.end_km ?? cur.end_km},
            sightseeing = ${data.sightseeing ?? cur.sightseeing}
        WHERE id = ${id} AND tour_id = ${tourId}
        RETURNING *
    `;
    return (rows[0] as Segment) ?? null;
}

// -- Settings ------------------------------------------------------

export async function getSetting(tourId: number, key: string): Promise<string> {
    const rows = await sql`SELECT value FROM settings WHERE tour_id = ${tourId} AND key = ${key}`;
    return (rows[0] as { value: string } | undefined)?.value ?? '';
}

export async function setSetting(tourId: number, key: string, value: string): Promise<void> {
    await sql`
        INSERT INTO settings (tour_id, key, value) VALUES (${tourId}, ${key}, ${value})
        ON CONFLICT (tour_id, key) DO UPDATE SET value = EXCLUDED.value
    `;
}

// -- Markers -------------------------------------------------------

export async function getAllMarkers(tourId: number): Promise<MapMarker[]> {
    return await sql`
        SELECT * FROM markers WHERE tour_id = ${tourId} ORDER BY name ASC
    ` as MapMarker[];
}

export async function insertMarker(data: NewMapMarker): Promise<MapMarker> {
    const rows = await sql`
        INSERT INTO markers (tour_id, name, orig_lat, orig_lon)
        VALUES (${data.tour_id}, ${data.name}, ${data.orig_lat}, ${data.orig_lon})
        RETURNING *
    `;
    return rows[0] as MapMarker;
}

/**
 * Legt mehrere Marker in einer Transaktion an (Bulk-Import aus GPX-Wegpunkten).
 * Ein einzelner Round-Trip statt einem pro Wegpunkt.
 */
export async function insertMarkers(data: NewMapMarker[]): Promise<MapMarker[]> {
    if (!data.length) return [];
    const results = (await sql.transaction(
        data.map((d) => sql`
            INSERT INTO markers (tour_id, name, orig_lat, orig_lon)
            VALUES (${d.tour_id}, ${d.name}, ${d.orig_lat}, ${d.orig_lon})
            RETURNING *
        `),
    )) as unknown as MapMarker[][];
    return results.map((rows) => rows[0]);
}

export async function deleteMarker(tourId: number, id: number): Promise<boolean> {
    const result = await sql`DELETE FROM markers WHERE id = ${id} AND tour_id = ${tourId}`;
    return (result as unknown as { rowCount: number }).rowCount > 0;
}

/** Loescht alle Marker einer Tour und liefert die Anzahl der geloeschten Zeilen. */
export async function deleteAllMarkers(tourId: number): Promise<number> {
    const result = await sql`DELETE FROM markers WHERE tour_id = ${tourId}`;
    return (result as unknown as { rowCount: number }).rowCount;
}
