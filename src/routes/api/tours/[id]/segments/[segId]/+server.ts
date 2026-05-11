import { json, error } from '@sveltejs/kit';
import { getTour, updateSegment } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

function resolveTourId(params: { id: string }, locals: App.Locals): number {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return id;
}

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    const tourId = resolveTourId(params, locals);
    const segId = parseInt(params.segId, 10);
    if (isNaN(segId)) error(400, 'Invalid segment id');
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const b = body as Record<string, unknown>;
    const updated = updateSegment(tourId, segId, {
        name: typeof b.name === 'string' ? b.name : undefined,
        notes: typeof b.notes === 'string' ? b.notes : undefined,
        start_km: typeof b.start_km === 'number' ? b.start_km : undefined,
        end_km: typeof b.end_km === 'number' ? b.end_km : undefined,
        sightseeing: typeof b.sightseeing === 'number' ? b.sightseeing : undefined,
    });
    if (!updated) error(404, 'Segment not found');
    return json(updated);
};
