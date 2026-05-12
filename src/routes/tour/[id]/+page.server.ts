import { error } from '@sveltejs/kit';
import { getTour, getAllSessions, getAllSegments, getAllMarkers, getSetting, getTourGpx } from '$lib/db.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals, params }) => {
    const user = locals.user!;
    const tourId = parseInt(params.id, 10);
    if (isNaN(tourId)) error(404, 'Tour nicht gefunden');

    const tour = await getTour(tourId);
    if (!tour) error(404, 'Tour nicht gefunden');
    if (tour.user_id !== user.id) error(403, 'Nicht berechtigt');

    const [sessions, segments, markers, startDate, gpx] = await Promise.all([
        getAllSessions(tourId),
        getAllSegments(tourId),
        getAllMarkers(tourId),
        getSetting(tourId, 'planner-startDate'),
        getTourGpx(tourId),
    ]);

    return { tour, sessions, segments, markers, startDate, gpx };
};
