import { error } from '@sveltejs/kit';
import { getTour, getAllSegments, getAllMarkers, getSetting, getTourGpx } from '$lib/db.js';
import type { PageServerLoad } from './$types.js';
import type { TrackPoint, Segment, MapMarker } from '$lib/types.js';

function segmentElevation(points: TrackPoint[], startKm: number, endKm: number) {
    let up = 0, down = 0;
    const pts = points.filter(p => p.cumDist >= startKm && p.cumDist <= endKm);
    for (let i = 1; i < pts.length; i++) {
        const diff = pts[i].ele - pts[i - 1].ele;
        if (diff > 0) up += diff;
        else down += Math.abs(diff);
    }
    return { up: Math.round(up), down: Math.round(down) };
}

const SVG_W = 200;
const SVG_H = 50;

function markersForSegment(
    markers: MapMarker[],
    gpxPoints: TrackPoint[],
    startKm: number,
    endKm: number,
) {
    return markers
        .map((m) => {
            // Snap marker to nearest GPX point
            let best = gpxPoints[0];
            let bestD = Infinity;
            for (const p of gpxPoints) {
                const d = (p.lat - m.orig_lat) ** 2 + (p.lon - m.orig_lon) ** 2;
                if (d < bestD) { bestD = d; best = p; }
            }
            return { name: m.name, km: best.cumDist };
        })
        .filter((m) => m.km >= startKm && m.km <= endKm)
        .sort((a, b) => a.km - b.km)
        .map((m) => ({ name: m.name, distFromStart: Math.round((m.km - startKm) * 10) / 10 }));
}

function sparklineData(
    points: TrackPoint[],
    startKm: number,
    endKm: number,
    globalMinEle: number,
    globalMaxEle: number,
    w = SVG_W,
    h = SVG_H,
) {
    const pts = points.filter(p => p.cumDist >= startKm && p.cumDist <= endKm);
    if (pts.length < 2) return '';

    const minEle = globalMinEle;
    const eleRange = (globalMaxEle - globalMinEle) || 1;
    const kmRange = endKm - startKm || 1;

    const toX = (km: number) => ((km - startKm) / kmRange) * w;
    const toY = (ele: number) => h - ((ele - minEle) / eleRange) * h;

    return pts
        .map(p => `${toX(p.cumDist).toFixed(1)},${toY(p.ele).toFixed(1)}`)
        .join(' ');
}

function segmentDate(startDate: string | null, position: number): string | null {
    if (!startDate) return null;
    const base = new Date(startDate);
    if (isNaN(base.getTime())) return null;
    const d = new Date(base);
    d.setDate(base.getDate() + position - 1);
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export const load: PageServerLoad = async ({ locals, params }) => {
    const user = locals.user!;
    const tourId = parseInt(params.id, 10);
    if (isNaN(tourId)) error(404, 'Tour not found');

    const tour = await getTour(tourId);
    if (!tour) error(404, 'Tour not found');
    if (tour.user_id !== user.id) error(403, 'Forbidden');

    const [segments, markers, startDate, gpx] = await Promise.all([
        getAllSegments(tourId),
        getAllMarkers(tourId),
        getSetting(tourId, 'planner-startDate'),
        getTourGpx(tourId),
    ]);

    const sorted = [...segments].sort((a, b) => a.position - b.position);

    // Global elevation range so all sparklines share the same scale
    const globalMinEle = gpx ? Math.min(...gpx.points.map(p => p.ele)) : 0;
    const globalMaxEle = gpx ? Math.max(...gpx.points.map(p => p.ele)) : 1;

    const enriched = sorted.map((seg) => {
        const isSightseeing = Boolean(seg.sightseeing);
        const startKm = seg.start_km;
        const endKm = seg.end_km;
        const elevation = gpx && !isSightseeing
            ? segmentElevation(gpx.points, startKm, endKm)
            : { up: 0, down: 0 };
        const waypoints = gpx
            ? markersForSegment(markers, gpx.points, startKm, endKm)
            : [];
        const sparkline = gpx && !isSightseeing
            ? sparklineData(gpx.points, startKm, endKm, globalMinEle, globalMaxEle)
            : '';
        const date = segmentDate(startDate, seg.position);
        return { ...seg, elevation, waypoints, sparkline, date };
    });

    return { tour, segments: enriched, gpx, startDate };
};
