import { json, error } from '@sveltejs/kit';
import { getAllSegments, replaceSegments } from '$lib/db.js';
import type { NewSegment } from '$lib/types.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = () => {
    return json(getAllSegments());
};

/** POST { count: number, totalKm: number }  → generate equal segments */
export const POST: RequestHandler = async ({ request }) => {
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }

    const { count, totalKm } = body as { count: number; totalKm: number };
    if (!Number.isInteger(count) || count < 1 || count > 100) error(400, 'count must be 1–100');
    if (typeof totalKm !== 'number' || totalKm <= 0) error(400, 'totalKm required');

    const segKm = totalKm / count;
    const segments: NewSegment[] = Array.from({ length: count }, (_, i) => ({
        position: i + 1,
        name: `Etappe ${i + 1}`,
        start_km: Math.round(i * segKm * 10) / 10,
        end_km: Math.round((i + 1) * segKm * 10) / 10,
        notes: '',
        sightseeing: 0,
    }));
    // fix last end_km to exact total
    segments[segments.length - 1].end_km = Math.round(totalKm * 10) / 10;

    const created = replaceSegments(segments);
    return json(created, { status: 201 });
};

/** PUT [{position,name,start_km,end_km,notes}] → replace all with explicit data */
export const PUT: RequestHandler = async ({ request }) => {
    let body: unknown;
    try { body = await request.json(); } catch { error(400, 'Invalid JSON'); }
    if (!Array.isArray(body)) error(400, 'Expected array');
    const segs = body as Array<{ position: number; name: string; start_km: number; end_km: number; notes: string }>;
    const newSegments: NewSegment[] = segs.map((s, i) => ({
        position: typeof s.position === 'number' ? s.position : i + 1,
        name: typeof s.name === 'string' ? s.name : '',
        start_km: typeof s.start_km === 'number' ? s.start_km : 0,
        end_km: typeof s.end_km === 'number' ? s.end_km : 0,
        notes: typeof s.notes === 'string' ? s.notes : '',
        sightseeing: (s as any).sightseeing ? 1 : 0,
    }));
    return json(replaceSegments(newSegments));
};

/** DELETE → remove all segments */
export const DELETE: RequestHandler = () => {
    replaceSegments([]);
    return json({ ok: true });
};
