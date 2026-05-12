import { json, error } from '@sveltejs/kit';
import { getTour, getSetting, setSetting } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

async function resolveTourId(params: { id: string }, locals: App.Locals): Promise<number> {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = await getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return id;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
    const tourId = await resolveTourId(params, locals);
    const key = url.searchParams.get('key');
    if (!key) error(400, 'key required');
    return json({ key, value: await getSetting(tourId, key) });
};

export const PUT: RequestHandler = async ({ params, locals, request }) => {
    const tourId = await resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { key, value } = body as { key: string; value: string };
    if (typeof key !== 'string' || !key) error(400, 'key required');
    if (typeof value !== 'string') error(400, 'value must be string');
    await setSetting(tourId, key, value);
    return json({ key, value });
};
