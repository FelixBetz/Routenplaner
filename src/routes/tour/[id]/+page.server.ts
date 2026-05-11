import { error } from '@sveltejs/kit';
import { getTour, getAllSessions, getAllSegments, getAllMarkers, getSetting, getTourGpx } from '$lib/db.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = ({ locals, params }) => {
    const user = locals.user!;
    const tourId = parseInt(params.id, 10);
    if (isNaN(tourId)) error(404, 'Tour nicht gefunden');

    const tour = getTour(tourId);
    if (!tour) error(404, 'Tour nicht gefunden');
    if (tour.user_id !== user.id) error(403, 'Nicht berechtigt');

    const sessions = getAllSessions(tourId);
    const segments = getAllSegments(tourId);
    const markers = getAllMarkers(tourId);
    const startDate = getSetting(tourId, 'planner-startDate');
    const gpx = getTourGpx(tourId);

    return { tour, sessions, segments, markers, startDate, gpx };
};
