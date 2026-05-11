import { json, error } from '@sveltejs/kit';
import { getSetting, setSetting } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

/** GET /api/settings?key=... */
export const GET: RequestHandler = ({ url }) => {
    const key = url.searchParams.get('key');
    if (!key) error(400, 'key required');
    return json({ key, value: getSetting(key) });
};

/** PUT /api/settings  { key, value } */
export const PUT: RequestHandler = async ({ request }) => {
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { key, value } = body as { key: string; value: string };
    if (typeof key !== 'string' || !key) error(400, 'key required');
    if (typeof value !== 'string') error(400, 'value must be string');
    setSetting(key, value);
    return json({ key, value });
};
