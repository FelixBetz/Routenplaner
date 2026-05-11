import { json, error } from '@sveltejs/kit';
import { getTour, getAllSegments, replaceSegments } from '$lib/db.js';
import type { NewSegment } from '$lib/types.js';
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
    return json(getAllSegments(resolveTourId(params, locals)));
};

/** POST { count, totalKm } → generate equal segments */
export const POST: RequestHandler = async ({ params, locals, request }) => {
    const tourId = resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    const { count, totalKm } = body as { count: number; totalKm: number };
    if (!Number.isInteger(count) || count < 1 || count > 100) error(400, 'count must be 1–100');
    if (typeof totalKm !== 'number' || totalKm <= 0) error(400, 'totalKm required');
    const segKm = totalKm / count;
    const segments: NewSegment[] = Array.from({ length: count }, (_, i) => ({
        tour_id: tourId,
        position: i + 1,
        name: `Etappe ${i + 1}`,
        start_km: Math.round(i * segKm * 10) / 10,
        end_km: Math.round((i + 1) * segKm * 10) / 10,
        notes: '',
        sightseeing: 0,
    }));
    segments[segments.length - 1].end_km = Math.round(totalKm * 10) / 10;
    return json(replaceSegments(tourId, segments), { status: 201 });
};

/** PUT [{...}] → replace all */
export const PUT: RequestHandler = async ({ params, locals, request }) => {
    const tourId = resolveTourId(params, locals);
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    if (!Array.isArray(body)) error(400, 'Expected array');
    const segs = body as Array<Record<string, unknown>>;
    const newSegments: NewSegment[] = segs.map((s, i) => ({
        tour_id: tourId,
        position: typeof s.position === 'number' ? s.position : i + 1,
        name: typeof s.name === 'string' ? s.name : '',
        start_km: typeof s.start_km === 'number' ? s.start_km : 0,
        end_km: typeof s.end_km === 'number' ? s.end_km : 0,
        notes: typeof s.notes === 'string' ? s.notes : '',
        sightseeing: s.sightseeing ? 1 : 0,
    }));
    return json(replaceSegments(tourId, newSegments));
};

export const DELETE: RequestHandler = ({ params, locals }) => {
    const tourId = resolveTourId(params, locals);
    replaceSegments(tourId, []);
    return json({ ok: true });
};
