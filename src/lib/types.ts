export interface User {
    id: number;
    username: string;
    created_at: string;
}

export interface Tour {
    id: number;
    user_id: number;
    name: string;
    description: string;
    gpx_data: string | null; // JSON-encoded GpxData
    created_at: string;
}

export type NewTour = Pick<Tour, 'user_id' | 'name' | 'description'>;

export interface Session {
    id: number;
    tour_id: number;
    date: string; // ISO date string e.g. "2026-05-05"
    name: string;
    distance: number; // meters
    duration: number; // seconds
    elevation: number; // meters uphill
}

export type NewSession = Omit<Session, 'id'>;

export interface TrackPoint {
    lat: number;
    lon: number;
    ele: number;
    cumDist: number; // cumulative distance in km from start
}

export interface Waypoint {
    lat: number;
    lon: number;
    name: string;
}

export interface GpxData {
    points: TrackPoint[];
    waypoints: Waypoint[];
    totalKm: number;
    totalUphill: number;
    totalDownhill: number;
    /** ~500 downsampled points for chart rendering */
    chartPoints: TrackPoint[];
}

export interface Segment {
    id: number;
    tour_id: number;
    position: number;   // 1-based sort order
    name: string;
    start_km: number;
    end_km: number;
    notes: string;
    sightseeing: number; // 0 = normal day, 1 = sightseeing (no km)
}

export type NewSegment = Omit<Segment, 'id'>;

export interface MapMarker {
    id: number;
    tour_id: number;
    name: string;
    orig_lat: number;
    orig_lon: number;
}
export type NewMapMarker = Omit<MapMarker, 'id'>;

export interface ProgressInfo {
    progressKm: number;
    progressRatio: number; // 0–1
    progressPoint: TrackPoint | null;
    /** Indices into GpxData.points: [0..progressIndex] = done */
    progressIndex: number;
}
