import { json, error } from '@sveltejs/kit';
import { getTour, deleteSession, updateSession } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

function resolveTourId(params: { id: string }, locals: App.Locals): number {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return id;
}

export const DELETE: RequestHandler = ({ params, locals }) => {
    const tourId = resolveTourId(params, locals);
    const sessionId = parseInt(params.sessionId, 10);
    if (isNaN(sessionId)) error(400, 'Invalid session id');
    const deleted = deleteSession(tourId, sessionId);
    if (!deleted) error(404, 'Session not found');
    return json({ ok: true });
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    const tourId = resolveTourId(params, locals);
    const sessionId = parseInt(params.sessionId, 10);
    if (isNaN(sessionId)) error(400, 'Invalid session id');
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const b = body as Record<string, unknown>;
    const updated = updateSession(tourId, sessionId, {
        date: String(b.date),
        name: String(b.name),
        distance: Number(b.distance),
        duration: Number(b.duration),
        elevation: Number(b.elevation ?? 0),
    });
    if (!updated) error(404, 'Session not found');
    return json(updated);
};
