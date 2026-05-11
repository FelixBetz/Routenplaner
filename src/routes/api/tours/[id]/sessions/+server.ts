import { json, error } from '@sveltejs/kit';
import { getTour, getAllSessions, insertSession } from '$lib/db.js';
import type { NewSession } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

function resolveTourId(params: { id: string }, locals: App.Locals): number {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return id;
}

export const GET: RequestHandler = ({ params, locals }) => {
    return json(getAllSessions(resolveTourId(params, locals)));
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const tourId = resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const b = body as Record<string, unknown>;
    const required = ['date', 'name', 'distance', 'duration', 'elevation'] as const;
    for (const k of required) {
        if (b[k] === undefined || b[k] === null) error(400, `${k} required`);
    }
    const data: NewSession = {
        tour_id: tourId,
        date: String(b.date),
        name: String(b.name),
        distance: Number(b.distance),
        duration: Number(b.duration),
        elevation: Number(b.elevation ?? 0),
    };
    return json(insertSession(data), { status: 201 });
};
