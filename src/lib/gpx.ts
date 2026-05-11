import { readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { GpxData, TrackPoint, Waypoint } from './types.js';

const GPX_PATH = join(process.cwd(), 'static', 'tour.gpx');
const CACHE_PATH = join(process.cwd(), 'data', 'gpx-cache.json');
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

function parseGpx(): GpxData {
    const xml = readFileSync(GPX_PATH, 'utf-8');

    // Parse waypoints
    const waypoints: Waypoint[] = [];
    const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/wpt>/g;
    let wptMatch;
    while ((wptMatch = wptRegex.exec(xml)) !== null) {
        waypoints.push({
            lat: parseFloat(wptMatch[1]),
            lon: parseFloat(wptMatch[2]),
            name: wptMatch[3]
        });
    }

    // Parse track points
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

    // Calculate totals
    let totalUphill = 0;
    let totalDownhill = 0;
    for (let i = 1; i < points.length; i++) {
        const diff = points[i].ele - points[i - 1].ele;
        if (diff > 0) totalUphill += diff;
        else totalDownhill += Math.abs(diff);
    }

    const data: GpxData = {
        points,
        waypoints,
        totalKm: points.at(-1)?.cumDist ?? 0,
        totalUphill,
        totalDownhill,
        chartPoints: downsample(points, DOWNSAMPLE_COUNT)
    };

    return data;
}

let _cached: GpxData | null = null;

export function getGpxData(): GpxData {
    if (_cached) return _cached;

    // Check file-based cache
    try {
        if (existsSync(CACHE_PATH)) {
            const gpxMtime = statSync(GPX_PATH).mtimeMs;
            const cacheMtime = statSync(CACHE_PATH).mtimeMs;
            if (cacheMtime > gpxMtime) {
                const raw = readFileSync(CACHE_PATH, 'utf-8');
                _cached = JSON.parse(raw) as GpxData;
                console.log('[gpx] loaded from cache');
                return _cached;
            }
        }
    } catch {
        // fall through to parse
    }

    console.log('[gpx] parsing GPX file...');
    const data = parseGpx();
    console.log(`[gpx] parsed ${data.points.length} points, ${data.totalKm.toFixed(1)} km`);

    // Write cache
    try {
        mkdirSync(join(process.cwd(), 'data'), { recursive: true });
        writeFileSync(CACHE_PATH, JSON.stringify(data));
        console.log('[gpx] cache written');
    } catch (e) {
        console.warn('[gpx] could not write cache:', e);
    }

    _cached = data;
    return data;
}

/** Returns the track point nearest to the given cumulative km distance. */
export function getProgressPoint(gpx: GpxData, trainedKm: number): { point: TrackPoint; index: number } {
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
