import { json, error } from '@sveltejs/kit';
import { getTour, updateTour, deleteTour } from '$lib/db.js';
import type { RequestHandler } from './$types.js';

async function resolveTour(params: { id: string }, locals: App.Locals) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) error(400, 'Invalid tour id');
    const tour = await getTour(id);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== locals.user!.id) error(403, 'Forbidden');
    return tour;
}

export const GET: RequestHandler = async ({ params, locals }) => {
    return json(await resolveTour(params, locals));
};

export const PUT: RequestHandler = async ({ params, locals, request }) => {
    const tour = await resolveTour(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { name, description } = body as { name?: string; description?: string };
    const updated = await updateTour(tour.id, {
        name: typeof name === 'string' ? name.trim() : undefined,
        description: typeof description === 'string' ? description.trim() : undefined,
    });
    return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const tour = await resolveTour(params, locals);
    await deleteTour(tour.id);
    return json({ ok: true });
};
