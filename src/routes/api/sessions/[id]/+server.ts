import { json, error } from '@sveltejs/kit';
import { deleteSession, updateSession } from '$lib/db.js';
import type { NewSession } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const DELETE: RequestHandler = ({ params }) => {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid id');

    const deleted = deleteSession(id);
    if (!deleted) error(404, 'Session not found');

    return json({ success: true });
};

export const PATCH: RequestHandler = async ({ params, request }) => {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid id');

    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }

    const b = body as Record<string, unknown>;
    const data: NewSession = {
        date: String(b.date),
        name: String(b.name),
        distance: Math.round(Number(b.distance)),
        duration: Math.round(Number(b.duration)),
        elevation: Math.round(Number(b.elevation)),
    };

    const updated = updateSession(id, data);
    if (!updated) error(404, 'Session not found');
    return json(updated);
};
