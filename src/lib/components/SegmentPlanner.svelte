<script lang="ts">
  import type { GpxData, Segment, MapMarker } from "$lib/types.js";
  import { SESSION_COLORS, hexToRgba } from "$lib/colors.js";
  import { onMount, onDestroy } from "svelte";

  interface Props {
    tourId: number;
    gpx: GpxData;
    segments: Segment[];
    markers: MapMarker[];
    startDate: string;
    onSegmentsChanged: (segs: Segment[]) => void;
    onMarkersChanged: (markers: MapMarker[]) => void;
  }

  let {
    tourId,
    gpx,
    segments = $bindable(),
    markers = $bindable(),
    startDate: initialStartDate,
    onSegmentsChanged,
    onMarkersChanged,
  }: Props = $props();

  let segmentCount = $state(segments.length > 0 ? segments.length : 5);
  let generating = $state(false);
  let reordering = $state(false);
  let equalizing = $state(false);
  let editStates = $state<
    Record<
      number,
      { name: string; notes: string; length_km: number; sightseeing: boolean }
    >
  >({});
  let startDate = $state("");
  $effect.pre(() => {
    startDate = initialStartDate ?? "";
  });

  $effect(() => {
    fetch(`/api/tours/${tourId}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "planner-startDate", value: startDate }),
    });
  });

  // Date per segment index (0-based): startDate + i days
  const segmentDates = $derived.by(() => {
    if (!startDate) return [] as string[];
    const base = new Date(startDate);
    return segments.map((_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
      });
    });
  });

  // Map
  let mapEl: HTMLDivElement;
  let leafletMap: import("leaflet").Map | null = $state(null);
  let segmentLayers: import("leaflet").Polyline[] = [];
  let markerLayers: import("leaflet").Marker[] = [];

  // Marker add form
  let markerSearch = $state("");
  let markerAdding = $state(false);
  let markerImporting = $state(false);
  let markerClearing = $state(false);

  // GPX-Wegpunkte, die noch nicht als Marker existieren.
  // Abgleich ueber den Namen, damit ein erneuter Import nichts doppelt anlegt.
  const importableWaypoints = $derived.by(() => {
    const known = new Set(markers.map((m) => m.name.trim().toLowerCase()));
    return gpx.waypoints.filter((w) => {
      const name = w.name.trim();
      if (!name || known.has(name.toLowerCase())) return false;
      known.add(name.toLowerCase());
      return true;
    });
  });

  // Timeline resize
  let timelineEl: HTMLDivElement = $state() as unknown as HTMLDivElement;
  let draggingHandle: number | null = null; // index of boundary (between seg i and i+1)
  let dragStartX = 0;
  let dragStartLengths: number[] = [];

  // Only non-sightseeing segments participate in the timeline
  const rideSegments = $derived.by(() =>
    segments.filter(
      (seg) => !(editStates[seg.id]?.sightseeing ?? Boolean(seg.sightseeing)),
    ),
  );

  // Cumulative handle positions as % of total width — between adjacent ride segments
  const handlePcts = $derived.by(() => {
    const totalRideKm = rideSegments.reduce(
      (sum, seg) =>
        sum + (editStates[seg.id]?.length_km ?? seg.end_km - seg.start_km),
      0,
    );
    if (totalRideKm === 0) return [];
    let cursor = 0;
    return rideSegments.slice(0, -1).map((seg) => {
      const len = editStates[seg.id]?.length_km ?? seg.end_km - seg.start_km;
      cursor += len;
      return (cursor / totalRideKm) * 100;
    });
  });

  function initEditStates(segs: Segment[]) {
    const s: Record<
      number,
      { name: string; notes: string; length_km: number; sightseeing: boolean }
    > = {};
    for (const seg of segs) {
      s[seg.id] = {
        name: seg.name,
        notes: seg.notes,
        length_km: Math.round((seg.end_km - seg.start_km) * 10) / 10,
        sightseeing: Boolean(seg.sightseeing),
      };
    }
    editStates = s;
  }

  // Live preview of shifted km positions — sightseeing days consume no km
  const computedPositions = $derived.by(() => {
    const result: Record<number, { start_km: number; end_km: number }> = {};
    let cursor = 0;
    for (const seg of segments) {
      const isSightseeing =
        editStates[seg.id]?.sightseeing ?? Boolean(seg.sightseeing);
      const len = isSightseeing
        ? 0
        : (editStates[seg.id]?.length_km ?? seg.end_km - seg.start_km);
      result[seg.id] = {
        start_km: Math.round(cursor * 10) / 10,
        end_km: Math.round((cursor + len) * 10) / 10,
      };
      cursor += len;
    }
    return result;
  });

  const totalRideKm = $derived(
    rideSegments.reduce(
      (sum, seg) =>
        sum + (editStates[seg.id]?.length_km ?? seg.end_km - seg.start_km),
      0,
    ),
  );

  // Map each marker to its km position on the route and the nearest chart point index
  const markerPositions = $derived.by(() =>
    markers.map((m) => {
      let bestPt = gpx.points[0];
      let bestD = Infinity;
      for (const pt of gpx.points) {
        const d = (pt.lat - m.orig_lat) ** 2 + (pt.lon - m.orig_lon) ** 2;
        if (d < bestD) {
          bestD = d;
          bestPt = pt;
        }
      }
      let bestIdx = 0;
      let bestDKm = Infinity;
      for (let i = 0; i < gpx.chartPoints.length; i++) {
        const dk = Math.abs(gpx.chartPoints[i].cumDist - bestPt.cumDist);
        if (dk < bestDKm) {
          bestDKm = dk;
          bestIdx = i;
        }
      }
      return {
        marker: m,
        km: bestPt.cumDist,
        ele: bestPt.ele,
        chartIdx: bestIdx,
        routeLat: bestPt.lat,
        routeLon: bestPt.lon,
      };
    }),
  );

  // Markers that fall within each segment, with distance from segment start
  const markersPerSegment = $derived.by(() => {
    const result: Record<number, { name: string; distFromStart: number }[]> = {};
    for (const seg of segments) {
      const pos = computedPositions[seg.id];
      const start = pos?.start_km ?? seg.start_km;
      const end = pos?.end_km ?? seg.end_km;
      result[seg.id] = markerPositions
        .filter((mp) => mp.km >= start && mp.km <= end)
        .sort((a, b) => a.km - b.km)
        .map((mp) => ({
          name: mp.marker.name,
          distFromStart: Math.round((mp.km - start) * 10) / 10,
        }));
    }
    return result;
  });

  // Per-segment elevation gain/loss from full-resolution gpx.points
  const segmentElevations = $derived.by(() => {
    const result: Record<number, { up: number; down: number }> = {};
    for (const seg of segments) {
      const pos = computedPositions[seg.id];
      const start = pos?.start_km ?? seg.start_km;
      const end = pos?.end_km ?? seg.end_km;
      let up = 0;
      let down = 0;
      const pts = gpx.points.filter(
        (p) => p.cumDist >= start && p.cumDist <= end,
      );
      for (let i = 1; i < pts.length; i++) {
        const d = pts[i].ele - pts[i - 1].ele;
        if (d > 0) up += d;
        else down += -d;
      }
      result[seg.id] = { up: Math.round(up), down: Math.round(down) };
    }
    return result;
  });

  // Elevation chart
  let chartCanvas: HTMLCanvasElement;
  let elevChart = $state<any>(null);

  function buildChartDatasets() {
    const datasets: any[] = [];
    if (segments.length === 0) {
      datasets.push({
        label: "Höhe",
        data: gpx.chartPoints.map((p) => p.ele),
        borderColor: "#9ca3af",
        backgroundColor: "rgba(156,163,175,0.35)",
        fill: true,
        tension: 0.2,
        pointRadius: 0,
      });
    } else {
      segments
        .map((seg, originalIdx) => ({ seg, originalIdx }))
        .filter(
          ({ seg }) =>
            !(editStates[seg.id]?.sightseeing ?? Boolean(seg.sightseeing)),
        )
        .forEach(({ seg, originalIdx }) => {
          const pos = computedPositions[seg.id];
          const start = pos?.start_km ?? seg.start_km;
          const end = pos?.end_km ?? seg.end_km;
          const color = SESSION_COLORS[originalIdx % SESSION_COLORS.length];
          datasets.push({
            label: editStates[seg.id]?.name || seg.name,
            data: gpx.chartPoints.map((p) =>
              p.cumDist >= start && p.cumDist <= end ? p.ele : null,
            ),
            borderColor: color,
            backgroundColor: hexToRgba(color, 0.5),
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            spanGaps: false,
          });
        });
    }
    // Marker overlay dots
    for (const mp of markerPositions) {
      const data = new Array(gpx.chartPoints.length).fill(null);
      data[mp.chartIdx] = mp.ele;
      const radii = new Array(gpx.chartPoints.length).fill(0);
      radii[mp.chartIdx] = 7;
      datasets.push({
        label: mp.marker.name,
        data,
        borderColor: "#ffffff",
        backgroundColor: "#ffffff",
        fill: false,
        tension: 0,
        pointRadius: radii,
        pointHoverRadius: radii.map((r: number) => (r > 0 ? 10 : 0)),
        spanGaps: false,
      });
    }
    return datasets;
  }

  async function initChart() {
    const {
      Chart,
      LineController,
      LineElement,
      PointElement,
      LinearScale,
      CategoryScale,
      Filler,
      Tooltip,
    } = await import("chart.js");
    Chart.register(
      LineController,
      LineElement,
      PointElement,
      LinearScale,
      CategoryScale,
      Filler,
      Tooltip,
    );
    elevChart?.destroy();
    elevChart = new Chart(chartCanvas, {
      type: "line",
      data: {
        labels: gpx.chartPoints.map((p) => p.cumDist.toFixed(1)),
        datasets: buildChartDatasets(),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items: any[]) => `${items[0].label} km`,
              label: (item: any) =>
                `${item.dataset.label}: ${Math.round(item.raw)} m`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 10,
              callback: (_v: any, i: number) =>
                `${Math.round(gpx.chartPoints[i]?.cumDist ?? 0)} km`,
            },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          y: {
            title: { display: true, text: "Höhe (m)", color: "#94a3b8" },
            ticks: { color: "#94a3b8" },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
        },
      },
    });
  }

  // Re-build chart datasets whenever segments/editStates change
  $effect(() => {
    initEditStates(segments);
  });

  $effect(() => {
    void segments.length;
    void editStates;
    if (!elevChart) return;
    elevChart.data.datasets = buildChartDatasets();
    elevChart.update("none");
  });

  function zoomToRoute() {
    if (!leafletMap || !gpx.points.length) return;
    import('leaflet').then(({ default: L }) => {
      const bounds = L.polyline(gpx.points.map(p => [p.lat, p.lon] as [number, number])).getBounds();
      leafletMap!.fitBounds(bounds, { padding: [20, 20] });
    });
  }

  onDestroy(() => elevChart?.destroy());

  onMount(async () => {
    initChart();
    const L = (await import("leaflet")).default;
    leafletMap = L.map(mapEl).setView([47.5, 14.0], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(leafletMap);

    drawSegments(L);
  });

  function drawSegments(L: typeof import("leaflet")) {
    if (!leafletMap) return;
    for (const layer of segmentLayers) layer.remove();
    segmentLayers = [];
    drawMarkers(L);

    if (segments.length === 0) {
      // Draw entire route in gray
      const latlngs = gpx.points.map((p) => [p.lat, p.lon] as [number, number]);
      const line = L.polyline(latlngs, { color: "#9ca3af", weight: 3 }).addTo(
        leafletMap,
      );
      segmentLayers.push(line);
      if (latlngs.length > 0)
        leafletMap.fitBounds(line.getBounds(), { padding: [20, 20] });
      return;
    }

    const points = gpx.points;
    const totalKm = gpx.totalKm;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const color = SESSION_COLORS[i % SESSION_COLORS.length];

      // find point indices for start_km and end_km (cumDist is already in km)
      const startIdx = points.findIndex((p) => p.cumDist >= seg.start_km);
      let endIdx = points.findIndex((p) => p.cumDist >= seg.end_km);
      if (endIdx === -1) endIdx = points.length - 1;

      const slice = points.slice(startIdx === -1 ? 0 : startIdx, endIdx + 1);
      const latlngs = slice.map((p) => [p.lat, p.lon] as [number, number]);

      const line = L.polyline(latlngs, { color, weight: 4 })
        .bindPopup(
          `<b>${seg.name}</b><br>${seg.start_km.toFixed(1)} – ${seg.end_km.toFixed(1)} km`,
        )
        .addTo(leafletMap!);
      segmentLayers.push(line);

      if (i === 0 && latlngs.length > 0) {
        leafletMap!.fitBounds(
          L.polyline(
            points.map((p) => [p.lat, p.lon] as [number, number]),
          ).getBounds(),
          { padding: [20, 20] },
        );
      }
    }
  }

  // Redraw whenever segments change
  $effect(() => {
    void segments.length; // reactive dependency
    if (!leafletMap) return;
    import("leaflet").then(({ default: L }) => drawSegments(L));
  });

  // Redraw markers whenever markers change
  $effect(() => {
    void markers.length;
    if (!leafletMap) return;
    import("leaflet").then(({ default: L }) => drawMarkers(L));
  });

  function drawMarkers(L: typeof import("leaflet")) {
    if (!leafletMap) return;
    for (const m of markerLayers) m.remove();
    markerLayers = [];
    for (const mp of markerPositions) {
      const m = mp.marker;
      // Dashed line from original position to nearest route point
      const line = L.polyline(
        [
          [m.orig_lat, m.orig_lon],
          [mp.routeLat, mp.routeLon],
        ],
        {
          color: "#94a3b8",
          weight: 1.5,
          dashArray: "5 5",
          opacity: 0.8,
        },
      ).addTo(leafletMap!);
      markerLayers.push(line as any);
      // Marker at original geocoded position
      const mk = L.marker([m.orig_lat, m.orig_lon], {
        icon: L.divIcon({
          html: `<div class="custom-marker-wrap">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="#1d4ed8" stroke="#fff" stroke-width="1.5"/>
              <circle cx="12" cy="12" r="5" fill="#fff"/>
            </svg>
            <span class="custom-marker-label">${m.name}</span>
          </div>`,
          className: "",
          iconSize: [24, 36],
          iconAnchor: [12, 36],
          popupAnchor: [0, -36],
        }),
      })
        .bindPopup(`<b>${m.name}</b>`)
        .addTo(leafletMap!);
      markerLayers.push(mk);
    }
  }

  async function addMarkerBySearch() {
    const q = markerSearch.trim();
    if (!q) return;
    markerAdding = true;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      );
      const results = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;
      if (!results.length) {
        alert(`Ort nicht gefunden: ${q}`);
        return;
      }
      const { lat, lon } = results[0];
      const origLat = parseFloat(lat);
      const origLon = parseFloat(lon);
      const apiRes = await fetch(`/api/tours/${tourId}/markers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: q, orig_lat: origLat, orig_lon: origLon }),
      });
      if (!apiRes.ok) throw new Error(await apiRes.text());
      const newMarker: MapMarker = await apiRes.json();
      onMarkersChanged([...markers, newMarker]);
      markerSearch = "";
    } catch (e) {
      alert("Fehler: " + (e as Error).message);
    } finally {
      markerAdding = false;
    }
  }

  async function importWaypointsAsMarkers() {
    const todo = importableWaypoints;
    if (!todo.length || markerImporting) return;
    markerImporting = true;
    try {
      const res = await fetch(`/api/tours/${tourId}/markers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          todo.map((w) => ({
            name: w.name.trim(),
            orig_lat: w.lat,
            orig_lon: w.lon,
          })),
        ),
      });
      if (!res.ok) throw new Error(await res.text());
      const { created } = (await res.json()) as {
        created: MapMarker[];
        skipped: number;
      };
      // Nach Namen sortieren, damit die Reihenfolge der eines Reloads
      // entspricht (getAllMarkers sortiert per ORDER BY name ASC).
      onMarkersChanged(
        [...markers, ...created].sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (e) {
      alert("Import fehlgeschlagen: " + (e as Error).message);
    } finally {
      markerImporting = false;
    }
  }

  async function removeMarker(id: number) {
    await fetch(`/api/tours/${tourId}/markers?id=${id}`, { method: "DELETE" });
    onMarkersChanged(markers.filter((m) => m.id !== id));
  }

  async function clearAllMarkers() {
    if (!markers.length || markerClearing) return;
    if (
      !confirm(
        `Alle ${markers.length} Marker löschen? Das lässt sich nicht rückgängig machen.`,
      )
    )
      return;
    markerClearing = true;
    try {
      const res = await fetch(`/api/tours/${tourId}/markers?all=1`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      onMarkersChanged([]);
    } catch (e) {
      alert("Löschen fehlgeschlagen: " + (e as Error).message);
    } finally {
      markerClearing = false;
    }
  }

  async function generate() {
    if (generating) return;
    generating = true;
    try {
      const res = await fetch(`/api/tours/${tourId}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: segmentCount, totalKm: gpx.totalKm }),
      });
      if (!res.ok) throw new Error(await res.text());
      const segs: Segment[] = await res.json();
      onSegmentsChanged(segs);
    } catch (e) {
      alert("Fehler: " + (e as Error).message);
    } finally {
      generating = false;
    }
  }

  async function clearAll() {
    if (!confirm("Alle Streckenabschnitte löschen?")) return;
    await fetch(`/api/tours/${tourId}/segments`, { method: "DELETE" });
    onSegmentsChanged([]);
  }

  /**
   * Verteilt die Gesamtstrecke gleichmäßig auf alle Fahrtage.
   * Ruhetage (sightseeing = true, 0 km) behalten ihre Position und
   * werden nicht angetastet — nur die Laenge der Fahrtage aendert sich.
   * Der letzte Fahrtag bekommt den Rundungsrest, damit die Summe exakt
   * gpx.totalKm ergibt (gleiches Prinzip wie beim initialen Generieren
   * im Server, siehe POST /api/tours/[id]/segments).
   */
  async function equalizeRideDays() {
    if (equalizing) return;
    const rideIds = segments
      .filter(
        (s) => !(editStates[s.id]?.sightseeing ?? Boolean(s.sightseeing)),
      )
      .map((s) => s.id);
    if (rideIds.length === 0) {
      alert("Keine Fahrtage vorhanden — alle Tage sind als Ruhetag markiert.");
      return;
    }
    if (
      !confirm(
        `${rideIds.length} Fahrtag${rideIds.length === 1 ? "" : "e"} gleichmäßig auf ${gpx.totalKm.toFixed(1)} km verteilen? Manuell angepasste Etappenlängen gehen dabei verloren, Ruhetage bleiben unverändert.`,
      )
    )
      return;
    equalizing = true;
    try {
      const each = Math.round((gpx.totalKm / rideIds.length) * 10) / 10;
      const newStates = { ...editStates };
      let assigned = 0;
      rideIds.forEach((id, i) => {
        const isLast = i === rideIds.length - 1;
        const len = isLast
          ? Math.round((gpx.totalKm - assigned) * 10) / 10
          : each;
        newStates[id] = { ...newStates[id], length_km: len };
        assigned += len;
      });
      editStates = newStates;
      await saveAll();
    } finally {
      equalizing = false;
    }
  }

  function buildPayload(orderedSegs: Segment[]) {
    let cursor = 0;
    return orderedSegs.map((s, idx) => {
      const isSightseeing =
        editStates[s.id]?.sightseeing ?? Boolean(s.sightseeing);
      const len = isSightseeing
        ? 0
        : (editStates[s.id]?.length_km ?? s.end_km - s.start_km);
      const start_km = Math.round(cursor * 10) / 10;
      const end_km = Math.round((cursor + len) * 10) / 10;
      cursor += len;
      return {
        position: idx + 1,
        name: editStates[s.id]?.name ?? s.name,
        notes: editStates[s.id]?.notes ?? s.notes,
        sightseeing: isSightseeing ? 1 : 0,
        start_km,
        end_km,
      };
    });
  }

  async function saveAll() {
    reordering = true;
    try {
      const res = await fetch(`/api/tours/${tourId}/segments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(segments)),
      });
      if (!res.ok) throw new Error(await res.text());
      onSegmentsChanged(await res.json());
    } catch (e) {
      alert("Fehler: " + (e as Error).message);
    } finally {
      reordering = false;
    }
  }

  function startHandleDrag(e: PointerEvent, handleIdx: number) {
    e.preventDefault();
    draggingHandle = handleIdx;
    dragStartX = e.clientX;
    // Track lengths of ride segments only
    dragStartLengths = rideSegments.map(
      (s) => editStates[s.id]?.length_km ?? s.end_km - s.start_km,
    );
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (draggingHandle === null) return;
    const rect = timelineEl.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const totalRideKm = dragStartLengths.reduce((a, b) => a + b, 0);
    const deltaKm = (deltaX / rect.width) * totalRideKm;
    const i = draggingHandle;
    const segA = rideSegments[i];
    const segB = rideSegments[i + 1];
    const minLen = 0.5;
    let newLenA = dragStartLengths[i] + deltaKm;
    let newLenB = dragStartLengths[i + 1] - deltaKm;
    if (newLenA < minLen) {
      newLenB += newLenA - minLen;
      newLenA = minLen;
    }
    if (newLenB < minLen) {
      newLenA += newLenB - minLen;
      newLenB = minLen;
    }
    editStates = {
      ...editStates,
      [segA.id]: {
        ...(editStates[segA.id] ?? {
          name: segA.name,
          notes: segA.notes,
          sightseeing: false,
        }),
        length_km: Math.round(newLenA * 10) / 10,
      },
      [segB.id]: {
        ...(editStates[segB.id] ?? {
          name: segB.name,
          notes: segB.notes,
          sightseeing: false,
        }),
        length_km: Math.round(newLenB * 10) / 10,
      },
    };
  }

  async function onHandlePointerUp() {
    if (draggingHandle === null) return;
    draggingHandle = null;
    await saveAll();
  }

  function toggleSightseeing(seg: Segment) {
    const edit = editStates[seg.id];
    if (!edit) return;
    const newSightseeing = !edit.sightseeing;
    const newStates = { ...editStates };

    if (newSightseeing) {
      // Becoming sightseeing: give km to next non-sightseeing segment, or prev if none
      const len = edit.length_km;
      const idx = segments.indexOf(seg);
      const neighbor =
        segments
          .slice(idx + 1)
          .find(
            (s) => !(newStates[s.id]?.sightseeing ?? Boolean(s.sightseeing)),
          ) ??
        segments
          .slice(0, idx)
          .reverse()
          .find(
            (s) => !(newStates[s.id]?.sightseeing ?? Boolean(s.sightseeing)),
          );
      if (neighbor) {
        const nbEdit = newStates[neighbor.id];
        newStates[neighbor.id] = {
          ...nbEdit,
          length_km: Math.round((nbEdit.length_km + len) * 10) / 10,
        };
      }
      newStates[seg.id] = { ...edit, sightseeing: true, length_km: 0 };
    } else {
      // Becoming ride day: take half from next non-sightseeing segment, or prev if none
      const minLen = 1;
      const idx = segments.indexOf(seg);
      const neighbor =
        segments
          .slice(idx + 1)
          .find(
            (s) => !(newStates[s.id]?.sightseeing ?? Boolean(s.sightseeing)),
          ) ??
        segments
          .slice(0, idx)
          .reverse()
          .find(
            (s) => !(newStates[s.id]?.sightseeing ?? Boolean(s.sightseeing)),
          );
      let newLen = minLen;
      if (neighbor) {
        const nbEdit = newStates[neighbor.id];
        const give = Math.max(
          minLen,
          Math.round((nbEdit.length_km / 2) * 10) / 10,
        );
        newLen = give;
        newStates[neighbor.id] = {
          ...nbEdit,
          length_km: Math.round((nbEdit.length_km - give) * 10) / 10,
        };
      }
      newStates[seg.id] = { ...edit, sightseeing: false, length_km: newLen };
    }

    editStates = newStates;
  }
</script>

<div class="planner">
  <div class="controls">
    <label class="date-label">
      Startdatum
      <input type="date" bind:value={startDate} />
    </label>
    <label>
      Anzahl Tage
      <input type="number" min="1" max="100" bind:value={segmentCount} />
    </label>
    <button class="btn-generate" onclick={generate} disabled={generating}>
      {generating ? "Generiere…" : "Tage generieren"}
    </button>
    {#if segments.length > 0}
      <button class="btn-clear" onclick={clearAll}>Alle löschen</button>
      <button
        class="btn-equalize"
        onclick={equalizeRideDays}
        disabled={equalizing}
        title="Gesamtstrecke gleichmäßig auf alle Fahrtage verteilen, Ruhetage bleiben bei 0 km"
      >
        {equalizing ? "Verteile…" : "Gleichmäßig verteilen"}
      </button>
    {/if}
    <span class="route-info">{gpx.totalKm.toFixed(1)} km Gesamtstrecke</span>
    <span class="route-elev up">↑ {gpx.totalUphill.toFixed(0)} m</span>
    <span class="route-elev down">↓ {gpx.totalDownhill.toFixed(0)} m</span>
  </div>

  <!-- Marker management -->
  <div class="marker-bar">
    <form
      class="marker-form"
      onsubmit={(e) => {
        e.preventDefault();
        addMarkerBySearch();
      }}
    >
      <input
        type="text"
        placeholder="Ort suchen (z.B. Graz)…"
        bind:value={markerSearch}
        disabled={markerAdding}
      />
      <button type="submit" disabled={markerAdding || !markerSearch.trim()}>
        {markerAdding ? "…" : "+ Marker"}
      </button>
      {#if gpx.waypoints.length > 0}
        <button
          type="button"
          class="import-btn"
          onclick={importWaypointsAsMarkers}
          disabled={markerImporting || importableWaypoints.length === 0}
          title={importableWaypoints.length === 0
            ? "Alle Wegpunkte der GPX-Datei sind bereits als Marker vorhanden"
            : `${importableWaypoints.length} Wegpunkte aus der GPX-Datei übernehmen`}
        >
          {markerImporting
            ? "…"
            : `⇩ GPX-Wegpunkte (${importableWaypoints.length})`}
        </button>
      {/if}
    </form>
    {#if markers.length > 0}
      <div class="marker-list">
        {#each markers as m (m.id)}
          <span class="marker-chip">
            📍 {m.name}
            <button onclick={() => removeMarker(m.id)} title="Entfernen"
              >✕</button
            >
          </span>
        {/each}
      </div>
      <button
        class="btn-clear marker-clear"
        onclick={clearAllMarkers}
        disabled={markerClearing}
        title="Alle Marker dieser Tour löschen"
      >
        {markerClearing
          ? "…"
          : `Alle Marker löschen (${markers.length})`}
      </button>
    {/if}
  </div>

  <div class="map-wrap">
    <div class="map-container" bind:this={mapEl}></div>
    <button class="zoom-route-btn" onclick={zoomToRoute} title="Auf Route zoomen">⊕ Route</button>
  </div>

  <div class="chart-container">
    <canvas bind:this={chartCanvas}></canvas>
  </div>

  {#if segments.length > 0}
    <!-- Timeline resizer -->
    <div class="timeline-wrap" bind:this={timelineEl}>
      <div class="tl-bar">
        {#each segments as seg, i (seg.id)}
          {@const isSightseeing =
            editStates[seg.id]?.sightseeing ?? Boolean(seg.sightseeing)}
          {#if !isSightseeing}
            {@const len =
              editStates[seg.id]?.length_km ?? seg.end_km - seg.start_km}
            {@const color = SESSION_COLORS[i % SESSION_COLORS.length]}
            <div class="tl-seg" style="flex:{len}; background:{color}">
              <span class="tl-label">{seg.position}. Tag</span>
              <span class="tl-km">{len.toFixed(1)} km</span>
            </div>
          {/if}
        {/each}
      </div>
      <!-- Draggable boundary handles -->
      {#each handlePcts as pct, i}
        <div
          class="tl-handle"
          role="separator"
          aria-label="Grenze verschieben"
          style="left:{pct}%"
          onpointerdown={(e) => startHandleDrag(e, i)}
          onpointermove={onHandlePointerMove}
          onpointerup={onHandlePointerUp}
        ></div>
      {/each}
      {#each markerPositions as mp}
        {@const pct =
          totalRideKm > 0
            ? Math.max(0, Math.min(100, (mp.km / totalRideKm) * 100))
            : 0}
        <div class="tl-marker" style="left:{pct}%">
          <span class="tl-marker-label">{mp.marker.name}</span>
        </div>
      {/each}
    </div>

    <!-- Segment cards -->
    <div class="segment-list">
      {#each segments as seg, i (seg.id)}
        {@const color = SESSION_COLORS[i % SESSION_COLORS.length]}
        {@const edit = editStates[seg.id] ?? {
          name: seg.name,
          notes: seg.notes,
          length_km: seg.end_km - seg.start_km,
          sightseeing: Boolean(seg.sightseeing),
        }}
        {@const pos = computedPositions[seg.id] ?? {
          start_km: seg.start_km,
          end_km: seg.end_km,
        }}
        <div class="segment-card" class:is-sightseeing={edit.sightseeing}>
          <div class="seg-row1">
            <span
              class="seg-dot"
              style="background:{edit.sightseeing ? '#64748b' : color}"
            ></span>
            <span class="seg-num">{seg.position}.</span>
            {#if segmentDates[i]}<span class="seg-date">{segmentDates[i]}</span
              >{/if}
            <button
              class="btn-sightseeing"
              class:active={edit.sightseeing}
              onclick={() => toggleSightseeing(seg)}
              title={edit.sightseeing
                ? "Als Fahrtag markieren"
                : "Als Sightseeing-Tag markieren"}
            >
              {edit.sightseeing ? "🚴" : "📷"}
            </button>
          </div>
          {#if !edit.sightseeing}
            {@const elev = segmentElevations[seg.id]}
            <div class="seg-row2">
              <span class="seg-total">{edit.length_km.toFixed(1)} km</span>
              <span class="seg-bounds"
                >{pos.start_km.toFixed(1)} km → {pos.end_km.toFixed(1)} km</span
              >
            </div>
            {#if elev}
              <div class="seg-row2">
                <span class="seg-elev">↑ {elev.up} m</span>
                <span class="seg-elev down">↓ {elev.down} m</span>
              </div>
            {/if}
            {#each (markersPerSegment[seg.id] ?? []).filter(wp => wp.distFromStart > 1) as wp}
              <div class="seg-row2 seg-waypoint-row">
                <span class="seg-waypoint-icon">📍</span>
                <span class="seg-waypoint-name">{wp.name}</span>
                <span class="seg-waypoint-dist">nach {wp.distFromStart.toFixed(1)} km</span>
              </div>
            {/each}
          {/if}
          <div class="seg-fields">
            <label>
              Notizen
              <textarea
                rows="2"
                value={edit.notes}
                oninput={(e) => {
                  editStates[seg.id] = {
                    ...edit,
                    notes: (e.target as HTMLTextAreaElement).value,
                  };
                }}
              ></textarea>
            </label>
          </div>
        </div>
      {/each}
    </div>

    <div class="save-row">
      <button class="btn-save-all" onclick={saveAll} disabled={reordering}>
        {reordering ? "Speichern…" : "Alle speichern"}
      </button>
    </div>
  {:else}
    <p class="empty-hint">
      Noch keine Abschnitte. Anzahl eingeben und „Tage generieren"
      klicken.
    </p>
  {/if}
</div>

<style>
  :global(.custom-marker-wrap) {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }
  :global(.custom-marker-label) {
    margin-top: 2px;
    background: #1d4ed8;
    color: white;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .planner {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    background: #1e293b;
    padding: 0.75rem 1rem;
    border-radius: 8px;
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #94a3b8;
    font-size: 0.875rem;
  }
  .controls input[type="number"] {
    width: 72px;
    padding: 0.3rem 0.5rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 0.875rem;
  }
  .date-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #94a3b8;
    font-size: 0.875rem;
  }
  .date-label input[type="date"] {
    padding: 0.3rem 0.5rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 0.875rem;
    color-scheme: dark;
  }
  .seg-date {
    font-size: 0.78rem;
    color: #facc15;
    font-weight: 600;
    margin-right: 0.5rem;
  }
  .btn-sightseeing {
    margin-left: auto;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    background: #1e293b;
    border: 1px solid #475569;
    border-radius: 6px;
    color: #94a3b8;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .btn-sightseeing.active {
    background: #0f172a;
    border-color: #facc15;
    color: #facc15;
  }
  .segment-card.is-sightseeing {
    opacity: 0.75;
    border-color: #334155;
  }
  .btn-generate {
    padding: 0.4rem 1rem;
    background: #22c55e;
    color: #000;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }
  .btn-generate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-clear {
    padding: 0.4rem 0.8rem;
    background: #ef4444;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .btn-equalize {
    padding: 0.4rem 0.8rem;
    background: #0ea5e9;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .btn-equalize:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .route-info {
    margin-left: auto;
    color: #64748b;
    font-size: 0.8rem;
  }
  .route-elev {
    font-size: 0.8rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .route-elev.up {
    color: #f87171;
  }
  .route-elev.down {
    color: #4ade80;
  }

  .map-wrap {
    position: relative;
  }

  .map-container {
    height: 380px;
    border-radius: 10px;
    overflow: hidden;
  }

  .zoom-route-btn {
    position: absolute;
    bottom: 10px;
    right: 10px;
    z-index: 1000;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    padding: 0.3rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    color: #1d4ed8;
  }
  .zoom-route-btn:hover { background: #eff6ff; }

  .chart-container {
    height: 110px;
    background: #1e293b;
    border-radius: 10px;
    padding: 0.5rem 0.75rem;
  }
  .marker-bar {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: #1e293b;
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
  }
  .marker-form {
    display: flex;
    gap: 0.5rem;
  }
  .marker-form input {
    flex: 1;
    padding: 0.3rem 0.6rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 0.85rem;
  }
  .marker-form button {
    padding: 0.3rem 0.8rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }
  .marker-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .marker-form .import-btn {
    background: #334155;
  }
  .marker-form .import-btn:not(:disabled):hover {
    background: #475569;
  }
  .marker-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .marker-chip {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    color: #cbd5e1;
  }
  .marker-chip button {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 0;
    font-size: 0.75rem;
    line-height: 1;
  }
  .marker-chip button:hover {
    color: #ef4444;
  }
  .marker-clear {
    align-self: flex-start;
    padding: 0.25rem 0.7rem;
    font-size: 0.78rem;
  }
  .marker-clear:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Timeline ── */
  .timeline-wrap {
    position: relative;
    height: 64px;
    border-radius: 8px;
    overflow: visible;
    user-select: none;
  }
  .tl-bar {
    display: flex;
    height: 100%;
    border-radius: 8px;
    overflow: hidden;
  }
  .tl-seg {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    min-width: 0;
    transition: flex 0.05s;
  }
  .tl-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.75);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90%;
    pointer-events: none;
  }
  .tl-km {
    font-size: 0.65rem;
    color: rgba(0, 0, 0, 0.55);
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }
  .tl-handle {
    position: absolute;
    top: -4px;
    bottom: -4px;
    width: 12px;
    transform: translateX(-50%);
    cursor: ew-resize;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tl-handle::before {
    content: "";
    display: block;
    width: 4px;
    height: 100%;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }
  .tl-handle:hover::before,
  .tl-handle:active::before {
    background: #fff;
    width: 5px;
  }
  .tl-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #000;
    transform: translateX(-50%);
    z-index: 20;
    pointer-events: none;
  }
  .tl-marker-label {
    position: absolute;
    bottom: calc(100% + 3px);
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.72rem;
    color: #000;
    white-space: nowrap;
    font-weight: 700;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.6);
  }

  /* ── Segment cards ── */
  .segment-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 0.75rem;
  }
  .segment-card {
    background: #1e293b;
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .seg-row1 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .seg-row2 {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-left: 1.25rem;
  }
  .seg-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .seg-num {
    font-weight: 600;
    color: #f1f5f9;
    font-size: 0.875rem;
  }
  .seg-total {
    font-weight: 700;
    color: #f1f5f9;
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .seg-bounds {
    color: #64748b;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  .seg-elev {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: #f87171;
    font-weight: 600;
  }
  .seg-elev.down {
    color: #4ade80;
  }
  .seg-waypoint-row {
    align-items: center;
    gap: 0.35rem;
    border-top: 1px dashed #334155;
    padding-top: 0.25rem;
    margin-top: 0.1rem;
  }
  .seg-waypoint-icon {
    font-size: 0.8rem;
    line-height: 1;
  }
  .seg-waypoint-name {
    font-size: 0.78rem;
    color: #93c5fd;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seg-waypoint-dist {
    font-size: 0.75rem;
    color: #64748b;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .seg-fields {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .seg-fields label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }
  .seg-fields textarea {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    resize: vertical;
    width: 100%;
    box-sizing: border-box;
    min-width: 0;
  }

  .save-row {
    display: flex;
    justify-content: flex-end;
  }
  .btn-save-all {
    padding: 0.45rem 1.4rem;
    background: #3b82f6;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .btn-save-all:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .empty-hint {
    color: #64748b;
    text-align: center;
    padding: 2rem 0;
    font-size: 0.9rem;
  }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .controls {
      gap: 0.6rem;
      padding: 0.6rem 0.75rem;
    }

    .route-info {
      margin-left: 0;
    }

    .map-container {
      height: 260px;
    }

    .segment-list {
      grid-template-columns: 1fr;
    }

    .marker-form {
      flex-wrap: wrap;
    }

    .marker-form input {
      width: 100%;
      flex: none;
    }

    .marker-form button {
      width: 100%;
    }
  }
</style>
