<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import RouteMap from "$lib/components/RouteMap.svelte";
  import ElevationChart from "$lib/components/ElevationChart.svelte";
  import TrainingForm from "$lib/components/TrainingForm.svelte";
  import SessionList from "$lib/components/SessionList.svelte";
  import SegmentPlanner from "$lib/components/SegmentPlanner.svelte";
  import { parseGpxString, getProgressPoint } from "$lib/gpx-client.js";
  import type { GpxData, Segment, MapMarker } from "$lib/types.js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  const tourId = $derived(data.tour.id);

  let gpx = $state<GpxData | null>(null);
  let sessions = $state<typeof data.sessions>([]);
  let segments = $state<Segment[]>([]);
  let markers = $state<MapMarker[]>([]);
  let activeTab = $state<"training" | "planner">("planner");
  let gpxLoading = $state(false);
  let gpxError = $state("");
  let gpxFileName = $state("");

  let editingName = $state(false);
  let nameInput = $state("");
  let nameInputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (editingName) nameInputEl?.focus();
  });

  $effect.pre(() => {
    gpx = data.gpx ?? null;
    sessions = data.sessions;
    segments = data.segments ?? [];
    markers = data.markers ?? [];
    if (!editingName) nameInput = data.tour.name;
  });

  const progressKm = $derived(
    sessions.reduce((s, t) => s + t.distance / 1000, 0),
  );

  const progressInfo = $derived.by(() => {
    if (!gpx || gpx.points.length === 0) return { index: 0, point: null };
    return getProgressPoint(gpx, progressKm);
  });

  const pct = $derived(
    gpx ? Math.round(Math.min(progressKm / gpx.totalKm, 1) * 100) : 0,
  );

  async function handleGpxFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    gpxLoading = true;
    gpxError = "";
    try {
      const text = await file.text();
      const parsed = parseGpxString(text);
      const res = await fetch(`/api/tours/${tourId}/gpx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error("Speichern fehlgeschlagen");
      gpxFileName = file.name;
      gpx = parsed;

      // Adjust last ride stage to new route end
      if (segments.length > 0) {
        const sorted = [...segments].sort((a, b) => a.position - b.position);
        const lastRide = [...sorted].reverse().find((s) => !s.sightseeing);
        if (lastRide) {
          const newEnd = Math.round(parsed.totalKm * 10) / 10;
          if (lastRide.end_km !== newEnd) {
            const payload = sorted.map((s) => ({
              position: s.position,
              name: s.name,
              notes: s.notes,
              sightseeing: s.sightseeing,
              start_km: s.start_km,
              end_km: s.id === lastRide.id ? newEnd : s.end_km,
            }));
            const putRes = await fetch(`/api/tours/${tourId}/segments`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (putRes.ok) {
              segments = await putRes.json();
            }
          }
        }
      }
    } catch (err: any) {
      gpxError = err.message ?? "GPX konnte nicht gelesen werden";
    } finally {
      gpxLoading = false;
      (e.target as HTMLInputElement).value = "";
    }
  }

  async function handleRemoveGpx() {
    await fetch(`/api/tours/${tourId}/gpx`, { method: "DELETE" });
    gpx = null;
    gpxFileName = "";
  }

  async function saveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === data.tour.name) {
      editingName = false;
      return;
    }
    const res = await fetch(`/api/tours/${tourId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      await invalidateAll();
    }
    editingName = false;
  }

  async function onSaved() {
    await invalidateAll();
  }

  function onDeleted(id: number) {
    sessions = sessions.filter((s) => s.id !== id);
  }

  function onUpdated(updated: import("$lib/types.js").Session) {
    sessions = sessions.map((s) => (s.id === updated.id ? updated : s));
  }
</script>

<svelte:head>
  <title>{data.tour.name}</title>
</svelte:head>

<div class="app">
  {#if !gpx}
    <div class="import-screen">
      <div class="import-box">
        <div class="import-icon">🗺️</div>
        <a href="/" class="back-link">← Alle Touren</a>
        <h1>{data.tour.name}</h1>
        {#if data.tour.description}
          <p class="tour-desc">{data.tour.description}</p>
        {/if}
        <p>Lade eine GPX-Datei um deine Route zu visualisieren.</p>
        <label class="file-btn" class:loading={gpxLoading}>
          {gpxLoading ? "Wird geladen…" : "GPX-Datei importieren"}
          <input
            type="file"
            accept=".gpx"
            onchange={handleGpxFile}
            disabled={gpxLoading}
          />
        </label>
        {#if gpxError}
          <p class="import-error">{gpxError}</p>
        {/if}
      </div>
    </div>
  {:else}
    <header>
      <div class="header-inner">
        <div class="header-left">
          <a href="/" class="back-link">← Alle Touren</a>
          {#if editingName}
            <div class="name-edit">
              <input
                class="name-input"
                bind:value={nameInput}
                bind:this={nameInputEl}
                onkeydown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") editingName = false;
                }}
              />
              <button class="name-save-btn" onclick={saveName}>✓</button>
              <button
                class="name-cancel-btn"
                onclick={() => (editingName = false)}>✕</button
              >
            </div>
          {:else}
            <h1>
              🚴 {data.tour.name}
              <button
                class="rename-btn"
                title="Tour umbenennen"
                onclick={() => {
                  nameInput = data.tour.name;
                  editingName = true;
                }}>✏️</button
              >
            </h1>
          {/if}
          <p class="subtitle">
            {gpxFileName ? gpxFileName + " · " : ""}{gpx.totalKm.toFixed(0)} km ·
            ↑ {Math.round(gpx.totalUphill).toLocaleString("de")} Hm · ↓ {Math.round(
              gpx.totalDownhill,
            ).toLocaleString("de")} Hm
          </p>
        </div>
        <a
          href="/tour/{tourId}/print"
          target="_blank"
          class="pdf-btn"
          title="Etappenübersicht als PDF"
        >📄 PDF</a>
        <label class="gpx-change-btn" title="Andere GPX laden">
          📂 GPX wechseln
          <input type="file" accept=".gpx" onchange={handleGpxFile} />
        </label>
        <button
          class="gpx-remove-btn"
          onclick={handleRemoveGpx}
          title="Route entfernen"
        >
          ✕
        </button>
      </div>
    </header>

    <section class="stats" class:hidden={activeTab !== "training"}>
      <div class="stat">
        <span class="stat-val">{progressKm.toFixed(1)}</span>
        <span class="stat-label">km trainiert</span>
      </div>
      <div class="stat">
        <span class="stat-val">{pct}%</span>
        <span class="stat-label">Fortschritt</span>
      </div>
      <div class="stat">
        <span class="stat-val">{(gpx.totalKm - progressKm).toFixed(1)}</span>
        <span class="stat-label">km verbleibend</span>
      </div>
      <div class="stat">
        <span class="stat-val">{sessions.length}</span>
        <span class="stat-label">Sessions</span>
      </div>
    </section>

    <div class="progress-bar-wrap" class:hidden={activeTab !== "training"}>
      <div class="progress-bar" style="width: {pct}%"></div>
    </div>

    <nav class="tabs">
      <button
        class="tab-btn"
        class:active={activeTab === "planner"}
        onclick={() => (activeTab = "planner")}>Streckenplaner</button
      >
      <button
        class="tab-btn"
        class:active={activeTab === "training"}
        onclick={() => (activeTab = "training")}>Training</button
      >
    </nav>

    {#if activeTab === "training"}
      <section class="viz">
        <div class="map-wrap">
          <RouteMap
            points={gpx.points}
            waypoints={gpx.waypoints}
            progressIndex={progressInfo.index}
            progressPoint={progressInfo.point}
            {sessions}
          />
        </div>
        <div class="chart-wrap">
          <ElevationChart
            chartPoints={gpx.chartPoints}
            {progressKm}
            totalKm={gpx.totalKm}
            {sessions}
          />
        </div>
      </section>

      <section class="bottom">
        <div class="form-wrap">
          <TrainingForm {tourId} {onSaved} />
        </div>
        <div class="list-wrap">
          <SessionList {tourId} {sessions} {onDeleted} {onUpdated} />
        </div>
      </section>
    {:else}
      <section class="planner-section">
        <SegmentPlanner
          {tourId}
          {gpx}
          {segments}
          {markers}
          startDate={data.startDate ?? ""}
          onSegmentsChanged={(segs) => (segments = segs)}
          onMarkersChanged={(m) => (markers = m)}
        />
      </section>
    {/if}
  {/if}
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    background: #f3f4f6;
    color: #111827;
  }

  .app {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 1rem 2rem;
  }

  .back-link {
    display: inline-block;
    color: #6b7280;
    text-decoration: none;
    font-size: 0.85rem;
    margin-bottom: 0.3rem;
  }
  .back-link:hover {
    color: #111827;
  }

  /* Import screen */
  .import-screen {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .import-box {
    background: white;
    border-radius: 16px;
    padding: 3rem 2.5rem;
    text-align: center;
    max-width: 420px;
    width: 100%;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .import-icon {
    font-size: 3rem;
  }

  .import-box h1 {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: #166534;
  }

  .tour-desc {
    color: #6b7280;
    font-size: 0.9rem;
    margin: 0;
  }

  .import-box p {
    color: #6b7280;
    margin: 0;
  }

  .file-btn {
    display: inline-block;
    padding: 0.7rem 1.5rem;
    background: #22c55e;
    color: white;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    margin-top: 0.5rem;
  }

  .file-btn:hover:not(.loading) {
    background: #16a34a;
  }
  .file-btn.loading {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .file-btn input,
  .gpx-change-btn input {
    display: none;
  }

  .import-error {
    color: #dc2626;
    font-size: 0.9rem;
    margin: 0;
  }

  /* Header */
  header {
    padding: 1rem 0;
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 1rem;
  }

  .header-inner {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .header-left {
    flex: 1;
    min-width: 0;
  }
  .header-left h1 {
    margin: 0;
    font-size: 1.4rem;
    color: #166534;
  }

  .subtitle {
    margin: 0.2rem 0 0;
    color: #6b7280;
    font-size: 0.85rem;
  }

  .rename-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    opacity: 0.4;
    padding: 0 4px;
    vertical-align: middle;
  }
  .rename-btn:hover {
    opacity: 1;
  }

  .name-edit {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .name-input {
    font-size: 1.4rem;
    font-weight: 700;
    padding: 0.2rem 0.5rem;
    border: 2px solid #22c55e;
    border-radius: 6px;
    background: white;
    color: #166534;
    min-width: 220px;
  }
  .name-save-btn,
  .name-cancel-btn {
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 700;
  }
  .name-save-btn {
    background: #22c55e;
    color: white;
  }
  .name-cancel-btn {
    background: #e5e7eb;
    color: #374151;
  }

  .pdf-btn {
    padding: 0.5rem 1rem;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    color: #1d4ed8;
    font-size: 0.85rem;
    text-decoration: none;
    white-space: nowrap;
  }

  .pdf-btn:hover {
    background: #dbeafe;
  }

  .gpx-change-btn {
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .gpx-remove-btn {
    padding: 0.5rem 0.75rem;
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    cursor: pointer;
    color: #dc2626;
    font-size: 0.85rem;
  }

  /* Stats */
  .stats {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .stats.hidden,
  .progress-bar-wrap.hidden {
    display: none;
  }

  .stat {
    background: white;
    border-radius: 10px;
    padding: 0.75rem 1.25rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-val {
    font-size: 1.5rem;
    font-weight: 700;
    color: #166534;
  }
  .stat-label {
    font-size: 0.75rem;
    color: #9ca3af;
  }

  /* Progress bar */
  .progress-bar-wrap {
    height: 6px;
    background: #e5e7eb;
    border-radius: 3px;
    margin-bottom: 1rem;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: #22c55e;
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .tab-btn {
    padding: 0.5rem 1.25rem;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.15s;
  }

  .tab-btn.active {
    background: #166534;
    color: white;
    border-color: #166534;
  }

  /* Viz */
  .viz {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 900px) {
    .viz {
      grid-template-columns: 1fr;
    }
  }

  .map-wrap,
  .chart-wrap {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    min-height: 320px;
  }

  /* Bottom */
  .bottom {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 1rem;
  }

  @media (max-width: 900px) {
    .bottom {
      grid-template-columns: 1fr;
    }
  }

  .form-wrap,
  .list-wrap {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  }

  /* Planner */
  .planner-section {
    background: white;
    border-radius: 12px;
    padding: 1.25rem;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .app {
      padding: 0 0.5rem 2rem;
    }

    .header-inner {
      gap: 0.5rem;
    }

    .header-left h1 {
      font-size: 1.1rem;
    }

    .subtitle {
      font-size: 0.78rem;
    }

    .name-input {
      min-width: 0;
      width: 100%;
      font-size: 1.1rem;
    }

    .pdf-btn,
    .gpx-change-btn,
    .gpx-remove-btn {
      font-size: 0.78rem;
      padding: 0.4rem 0.6rem;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .stat {
      padding: 0.6rem 0.75rem;
    }

    .stat-val {
      font-size: 1.2rem;
    }

    .import-box {
      padding: 2rem 1.25rem;
    }

    .form-wrap,
    .list-wrap,
    .planner-section {
      padding: 0.85rem;
    }
  }
</style>
