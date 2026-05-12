import { json, error } from '@sveltejs/kit';
import { getTour, getTourGpx, setTourGpx, deleteTourGpx } from '$lib/db.js';
import type { GpxData } from '$lib/types.js';
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
    const tourId = await resolveTourId(params, locals);
    const gpx = await getTourGpx(tourId);
    if (!gpx) error(404, 'No GPX data');
    return json(gpx);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const tourId = await resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const data = body as GpxData;
    if (!data?.points?.length) error(400, 'Invalid GPX data');
    await setTourGpx(tourId, data);
    return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const tourId = await resolveTourId(params, locals);
    await deleteTourGpx(tourId);
    return json({ ok: true });
};
