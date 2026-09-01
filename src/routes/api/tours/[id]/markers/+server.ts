import { json, error } from '@sveltejs/kit';
import {
    getTour, getAllMarkers, insertMarker, insertMarkers, deleteMarker, deleteAllMarkers,
} from '$lib/db.js';
import type { RequestHandler } from './$types.js';
import type { NewMapMarker } from '$lib/types.js';

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
    // Bulk-Variante: ein Array von Wegpunkten, z.B. aus einer GPX-Datei.
    // Bereits vorhandene Namen werden uebersprungen, damit ein zweiter
    // Import-Klick keine Dubletten anlegt.
    if (Array.isArray(body)) {
        const existing = await getAllMarkers(tourId);
        const known = new Set(existing.map((m) => m.name.trim().toLowerCase()));
        const toInsert: NewMapMarker[] = [];
        for (const raw of body) {
            const item = raw as { name?: unknown; orig_lat?: unknown; orig_lon?: unknown };
            const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
            if (!itemName) continue;
            if (typeof item.orig_lat !== 'number' || typeof item.orig_lon !== 'number') continue;
            const key = itemName.toLowerCase();
            if (known.has(key)) continue;
            known.add(key); // faengt auch Dubletten innerhalb desselben Imports ab
            toInsert.push({
                tour_id: tourId,
                name: itemName,
                orig_lat: item.orig_lat,
                orig_lon: item.orig_lon,
            });
        }
        const created = await insertMarkers(toInsert);
        return json({ created, skipped: body.length - created.length }, { status: 201 });
    }

    const { name, orig_lat, orig_lon } = body as { name: string; orig_lat: number; orig_lon: number };
    if (typeof name !== 'string' || !name.trim()) error(400, 'name required');
    if (typeof orig_lat !== 'number' || typeof orig_lon !== 'number') error(400, 'orig_lat/orig_lon required');
    return json(await insertMarker({ tour_id: tourId, name: name.trim(), orig_lat, orig_lon }), { status: 201 });
};

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
    const tourId = await resolveTourId(params, locals);
    // Alle Marker der Tour loeschen.
    // Bewusst ein eigenes Flag statt "id fehlt = alles loeschen": ein vergessener
    // id-Parameter soll weiterhin ein 400 ergeben und nicht den ganzen Bestand raeumen.
    if (url.searchParams.get('all') === '1') {
        const deleted = await deleteAllMarkers(tourId);
        return json({ ok: true, deleted });
    }

    const markerId = parseInt(url.searchParams.get('id') ?? '', 10);
    if (isNaN(markerId)) error(400, 'id required');
    await deleteMarker(tourId, markerId);
    return json({ ok: true });
};
