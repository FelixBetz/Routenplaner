import { json, error } from '@sveltejs/kit';
import { updateSegment } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

export const PATCH: RequestHandler = async ({ params, request }) => {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid id');

    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }

    const b = body as Record<string, unknown>;
    const data: { name?: string; notes?: string; start_km?: number; end_km?: number; sightseeing?: number } = {};
    if (typeof b.name === 'string') data.name = b.name;
    if (typeof b.notes === 'string') data.notes = b.notes;
    if (typeof b.start_km === 'number') data.start_km = b.start_km;
    if (typeof b.end_km === 'number') data.end_km = b.end_km;
    if (typeof b.sightseeing === 'number') data.sightseeing = b.sightseeing ? 1 : 0;
    if (data.start_km !== undefined && data.end_km !== undefined && data.start_km >= data.end_km)
        error(400, 'start_km must be less than end_km');

    const updated = updateSegment(id, data);
    if (!updated) error(404, 'Segment not found');
    return json(updated);
};
