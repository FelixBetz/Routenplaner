import { json, error } from '@sveltejs/kit';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types.js';
import type { GpxData } from '$lib/types.js';

const CACHE_PATH = join(process.cwd(), 'data', 'gpx-cache.json');

export const GET: RequestHandler = () => {
	if (!existsSync(CACHE_PATH)) {
		error(404, 'Kein GPX-Cache vorhanden');
	}
	const raw = readFileSync(CACHE_PATH, 'utf-8');
	return json(JSON.parse(raw) as GpxData);
};

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON');
	}
	const data = body as GpxData;
	if (!data?.points?.length) {
		error(400, 'Ungültige GPX-Daten');
	}
	mkdirSync(join(process.cwd(), 'data'), { recursive: true });
	writeFileSync(CACHE_PATH, JSON.stringify(data));
	return json({ ok: true });
};

export const DELETE: RequestHandler = () => {
	if (existsSync(CACHE_PATH)) unlinkSync(CACHE_PATH);
	return json({ ok: true });
};
