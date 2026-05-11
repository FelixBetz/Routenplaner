import { json, error } from '@sveltejs/kit';
import { getTour, getSetting, setSetting } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

function resolveTourId(params: { id: string }, locals: App.Locals): number {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return id;
}

export const GET: RequestHandler = ({ params, locals, url }) => {
    const tourId = resolveTourId(params, locals);
    const key = url.searchParams.get('key');
    if (!key) error(400, 'key required');
    return json({ key, value: getSetting(tourId, key) });
};

export const PUT: RequestHandler = async ({ params, locals, request }) => {
    const tourId = resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { key, value } = body as { key: string; value: string };
    if (typeof key !== 'string' || !key) error(400, 'key required');
    if (typeof value !== 'string') error(400, 'value must be string');
    setSetting(tourId, key, value);
    return json({ key, value });
};
