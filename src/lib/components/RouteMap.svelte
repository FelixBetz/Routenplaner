<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { TrackPoint, Waypoint, Session } from "$lib/types.js";
  import { SESSION_COLORS } from "$lib/colors.js";

  interface Props {
    points: TrackPoint[];
    waypoints: Waypoint[];
    progressIndex: number;
    progressPoint: TrackPoint | null;
    sessions: Session[];
  }

  let { points, waypoints, progressIndex, progressPoint, sessions }: Props =
    $props();

  let mapEl: HTMLDivElement;
  let map = $state<any>(null);
  let sessionPolylines: any[] = [];
  let remainingPolyline: any = null;
  let progressMarker: any = null;
  let L = $state<any>(null);

  onMount(async () => {
    L = (await import("leaflet")).default;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    map = L.map(mapEl).setView([47.5, 14.8], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    }).addTo(map);

    renderRoute();

    for (const wp of waypoints) {
      L.marker([wp.lat, wp.lon], {
        icon: L.divIcon({
          html: `<div class="wp-marker">${wp.name}</div>`,
          className: "",
          iconAnchor: [0, 10],
        }),
      })
        .bindPopup(wp.name)
        .addTo(map);
    }
  });

  onDestroy(() => {
    map?.remove();
  });

  /** Binary search: index of first point with cumDist >= targetKm */
  function findIndex(targetKm: number): number {
    if (!points.length) return 0;
    const clamped = Math.min(targetKm, points[points.length - 1].cumDist);
    let lo = 0,
      hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid].cumDist < clamped) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function formatDuration(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function renderRoute() {
    if (!map || !L) return;

    sessionPolylines.forEach((p) => p.remove());
    sessionPolylines = [];
    remainingPolyline?.remove();
    progressMarker?.remove();

    // Draw one colored polyline per session
    let cumKm = 0;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const startKm = cumKm;
      const endKm = cumKm + s.distance / 1000;
      const startIdx = findIndex(startKm);
      const endIdx = findIndex(endKm);
      const latlngs = points
        .slice(startIdx, endIdx + 1)
        .map((p) => [p.lat, p.lon]);
      if (latlngs.length > 1) {
        const color = SESSION_COLORS[i % SESSION_COLORS.length];
        const poly = L.polyline(latlngs, { color, weight: 5 })
          .bindPopup(
            `<b>${s.name}</b><br>${s.date}<br>${(s.distance / 1000).toFixed(1)} km · ${formatDuration(s.duration)}`,
          )
          .addTo(map);
        sessionPolylines.push(poly);
      }
      cumKm = endKm;
    }

    // Remaining (gray)
    const remainLatLngs = points
      .slice(progressIndex)
      .map((p) => [p.lat, p.lon]);
    if (remainLatLngs.length > 1) {
      remainingPolyline = L.polyline(remainLatLngs, {
        color: "#9ca3af",
        weight: 3,
        opacity: 0.6,
      }).addTo(map);
    }

    // Progress marker
    if (progressPoint && progressIndex > 0) {
      const lastSession = sessions[sessions.length - 1];
      const markerColor =
        SESSION_COLORS[(sessions.length - 1) % SESSION_COLORS.length];
      progressMarker = L.circleMarker([progressPoint.lat, progressPoint.lon], {
        radius: 10,
        fillColor: markerColor,
        color: "#fff",
        weight: 2,
        fillOpacity: 1,
      })
        .bindPopup(`Fortschritt: ${progressPoint.cumDist.toFixed(1)} km`)
        .addTo(map);
    }
  }

  $effect(() => {
    if (!map || !L) return;
    renderRoute();
  });
</script>

<div bind:this={mapEl} class="map-container"></div>

<style>
  .map-container {
    width: 100%;
    height: 450px;
    border-radius: 8px;
    overflow: hidden;
  }

  :global(.wp-marker) {
    background: #1d4ed8;
    color: white;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }
</style>
