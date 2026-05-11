import { json, error } from '@sveltejs/kit';
import { getAllSessions, insertSession } from '$lib/db.js';
import type { NewSession } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = () => {
    const sessions = getAllSessions();
    return json(sessions);
};

export const POST: RequestHandler = async ({ request }) => {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        error(400, 'Invalid JSON');
    }

    const b = body as Record<string, unknown>;
    const required: (keyof NewSession)[] = ['date', 'name', 'distance', 'duration', 'elevation'];

    for (const key of required) {
        if (b[key] === undefined || b[key] === null || b[key] === '') {
            error(400, `Missing field: ${key}`);
        }
    }

    const data: NewSession = {
        date: String(b.date),
        name: String(b.name),
        distance: Math.round(Number(b.distance)),
        duration: Math.round(Number(b.duration)),
        elevation: Math.round(Number(b.elevation))
    };

    const session = insertSession(data);
    return json(session, { status: 201 });
};
