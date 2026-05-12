import { json, error } from '@sveltejs/kit';
import { getUserTours, createTour } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals }) => {
    const user = locals.user!;
    return json(await getUserTours(user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
    const user = locals.user!;
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { name, description } = body as { name: string; description?: string };
    if (typeof name !== 'string' || !name.trim()) error(400, 'name required');
    const tour = await createTour({ user_id: user.id, name: name.trim(), description: description?.trim() ?? '' });
    return json(tour, { status: 201 });
};
