import { json, error } from '@sveltejs/kit';
import { getTour, getAllMarkers, insertMarker, deleteMarker } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

async function resolveTourId(params: { id: string }, locals: App.Locals): Promise<number> {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = await getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return id;
}

export const GET: RequestHandler = async ({ params, locals }) => {
    return json(await getAllMarkers(await resolveTourId(params, locals)));
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const tourId = await resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { name, orig_lat, orig_lon } = body as { name: string; orig_lat: number; orig_lon: number };
    if (typeof name !== 'string' || !name.trim()) error(400, 'name required');
    if (typeof orig_lat !== 'number' || typeof orig_lon !== 'number') error(400, 'orig_lat/orig_lon required');
    return json(await insertMarker({ tour_id: tourId, name: name.trim(), orig_lat, orig_lon }), { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
    const tourId = await resolveTourId(params, locals);
    const markerId = parseInt(url.searchParams.get('id') ?? '', 10);
    if (isNaN(markerId)) error(400, 'id required');
    await deleteMarker(tourId, markerId);
    return json({ ok: true });
};
