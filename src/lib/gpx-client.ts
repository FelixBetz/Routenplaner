import type { GpxData, TrackPoint, Waypoint } from './types.js';

const CACHE_KEY = 'road-to-slovenia:gpx-cache';
const DOWNSAMPLE_COUNT = 500;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLon = ((lon2 - lon1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
		Math.cos((lat2 * Math.PI) / 180) *
		Math.sin(dLon / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function downsample(points: TrackPoint[], targetCount: number): TrackPoint[] {
	if (points.length <= targetCount) return points;
	const result: TrackPoint[] = [];
	const step = (points.length - 1) / (targetCount - 1);
	for (let i = 0; i < targetCount; i++) {
		result.push(points[Math.round(i * step)]);
	}
	return result;
}

export function parseGpxString(xml: string): GpxData {
	const waypoints: Waypoint[] = [];
	const wptRegex =
		/<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/wpt>/g;
	let wptMatch;
	while ((wptMatch = wptRegex.exec(xml)) !== null) {
		waypoints.push({
			lat: parseFloat(wptMatch[1]),
			lon: parseFloat(wptMatch[2]),
			name: wptMatch[3]
		});
	}

	const points: TrackPoint[] = [];
	const trkRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>\s*<ele>([^<]+)<\/ele>/g;
	let trkMatch;
	let cumDist = 0;
	let prevLat: number | null = null;
	let prevLon: number | null = null;

	while ((trkMatch = trkRegex.exec(xml)) !== null) {
		const lat = parseFloat(trkMatch[1]);
		const lon = parseFloat(trkMatch[2]);
		const ele = parseFloat(trkMatch[3]);
		if (prevLat !== null && prevLon !== null) {
			cumDist += haversineKm(prevLat, prevLon, lat, lon);
		}
		points.push({ lat, lon, ele, cumDist });
		prevLat = lat;
		prevLon = lon;
	}

	if (points.length === 0) throw new Error('Keine Trackpunkte in der GPX-Datei gefunden');

	let totalUphill = 0;
	let totalDownhill = 0;
	for (let i = 1; i < points.length; i++) {
		const diff = points[i].ele - points[i - 1].ele;
		if (diff > 0) totalUphill += diff;
		else totalDownhill += Math.abs(diff);
	}

	return {
		points,
		waypoints,
		totalKm: points.at(-1)!.cumDist,
		totalUphill,
		totalDownhill,
		chartPoints: downsample(points, DOWNSAMPLE_COUNT)
	};
}

export function loadGpxFromCache(): GpxData | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as GpxData;
	} catch {
		return null;
	}
}

export function saveGpxToCache(data: GpxData): void {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		console.warn('[gpx] localStorage voll, Cache nicht gespeichert');
	}
}

export function clearGpxCache(): void {
	localStorage.removeItem(CACHE_KEY);
}

export function getProgressPoint(
	gpx: GpxData,
	trainedKm: number
): { point: TrackPoint; index: number } {
	const clamped = Math.min(trainedKm, gpx.totalKm);
	let lo = 0;
	let hi = gpx.points.length - 1;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (gpx.points[mid].cumDist < clamped) lo = mid + 1;
		else hi = mid;
	}
	return { point: gpx.points[lo], index: lo };
}

export interface ActivityData {
	name: string;
	/** ISO datetime string of first trackpoint, e.g. "2026-05-05T10:30" */
	datetime: string;
	/** total distance in meters */
	distanceM: number;
	/** total uphill elevation in meters */
	elevationM: number;
	/** duration in seconds */
	durationS: number;
}

export function parseActivityGpx(xml: string): ActivityData {
	// Track name
	const nameMatch = xml.match(/<trk[^>]*>[\s\S]*?<name>([^<]+)<\/name>/);
	const name = nameMatch ? nameMatch[1].trim() : 'Training';

	// Trackpoints with time + ele
	const trkRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
	let match;
	let totalDist = 0;
	let totalUphill = 0;
	let prevLat: number | null = null;
	let prevLon: number | null = null;
	let prevEle: number | null = null;
	let firstTime: Date | null = null;
	let lastTime: Date | null = null;
	let datetime = '';

	while ((match = trkRegex.exec(xml)) !== null) {
		const lat = parseFloat(match[1]);
		const lon = parseFloat(match[2]);
		const inner = match[3];

		const eleMatch = inner.match(/<ele>([^<]+)<\/ele>/);
		const timeMatch = inner.match(/<time>([^<]+)<\/time>/);
		const ele = eleMatch ? parseFloat(eleMatch[1]) : null;
		const t = timeMatch ? new Date(timeMatch[1]) : null;

		if (prevLat !== null && prevLon !== null) {
			totalDist += haversineKm(prevLat, prevLon, lat, lon) * 1000; // in meters
		}
		if (ele !== null && prevEle !== null) {
			const diff = ele - prevEle;
			if (diff > 0) totalUphill += diff;
		}
		if (t && !firstTime) {
			firstTime = t;
			// Format as "YYYY-MM-DDTHH:MM" in local time
			const pad = (n: number) => String(n).padStart(2, '0');
			datetime = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
		}
		if (t) lastTime = t;

		prevLat = lat;
		prevLon = lon;
		if (ele !== null) prevEle = ele;
	}

	if (totalDist === 0) throw new Error('Keine Trackpunkte in der GPX-Datei gefunden');

	const durationS =
		firstTime && lastTime ? Math.round((lastTime.getTime() - firstTime.getTime()) / 1000) : 0;

	return {
		name,
		datetime: datetime || new Date().toISOString().slice(0, 16),
		distanceM: Math.round(totalDist),
		elevationM: Math.round(totalUphill),
		durationS
	};
}
