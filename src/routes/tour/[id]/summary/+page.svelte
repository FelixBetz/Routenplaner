<script lang="ts">
  import type { PageData } from "./$types.js";
  import { SESSION_COLORS } from "$lib/colors.js";

  let { data }: { data: PageData } = $props();

  const tour = $derived(data.tour);
  const segments = $derived(data.segments);
  const gpx = $derived(data.gpx);
  const rideSegments = $derived(segments.filter((s) => !s.sightseeing));
  const totalDays = $derived(segments.length);
  const rideDays = $derived(rideSegments.length);

  function getStageNumber(index: number): number {
    return segments.slice(0, index + 1).filter((s) => !s.sightseeing).length;
  }
</script>

<svelte:head>
  <title>{tour.name} – Zusammenfassung</title>
</svelte:head>

<div class="summary-page">
  <!-- Top bar -->
  <div class="top-bar">
    <a href="/tour/{tour.id}" class="back-link">← Zurück zur Tour</a>
  </div>

  <!-- Cover / Header -->
  <header class="cover">
    <h1 class="tour-title">🚴 {tour.name}</h1>
    {#if tour.description}
      <p class="tour-desc">{tour.description}</p>
    {/if}
    <div class="cover-stats">
      {#if gpx}
        <div class="cstat">
          <span class="cval">{gpx.totalKm.toFixed(0)}</span>
          <span class="clabel">km Gesamt</span>
        </div>
        <div class="cstat">
          <span class="cval">↑ {Math.round(gpx.totalUphill).toLocaleString("de")}</span>
          <span class="clabel">Höhenmeter</span>
        </div>
        <div class="cstat">
          <span class="cval">↓ {Math.round(gpx.totalDownhill).toLocaleString("de")}</span>
          <span class="clabel">Abstieg</span>
        </div>
      {/if}
      <div class="cstat">
        <span class="cval">{rideDays}</span>
        <span class="clabel">Fahrtage</span>
      </div>
      <div class="cstat">
        <span class="cval">{totalDays}</span>
          <span class="clabel">Tage gesamt</span>
      </div>
      {#if data.startDate}
        <div class="cstat">
          <span class="cval">{new Date(data.startDate).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}</span>
          <span class="clabel">Startdatum</span>
        </div>
      {/if}
    </div>
  </header>

  <div class="segments">
    {#each segments as seg, i}
      {@const color = SESSION_COLORS[i % SESSION_COLORS.length]}
      <div class="seg-card" class:sightseeing={Boolean(seg.sightseeing)}>
        <!-- Left color bar -->
        <div class="seg-bar" style="background:{color}"></div>

        <div class="seg-body">
          <!-- Top row -->
          <div class="seg-top">
            <div class="seg-meta">
              <h2 class="seg-name">
                Tag {seg.position}
                {#if !seg.sightseeing}
                  (Etappe {getStageNumber(i)})
                {/if}
              </h2>
              {#if seg.date}
                <span class="seg-date">{seg.date}</span>
              {/if}
            </div>
            <div class="seg-badges">
              {#if seg.sightseeing}
                <span class="badge badge-rest">🏛️ Ruhetag</span>
              {:else}
                <span class="badge badge-km">{(seg.end_km - seg.start_km).toFixed(1)} km</span>
                {#if seg.elevation.up > 0}
                  <span class="badge badge-up">↑ {seg.elevation.up.toLocaleString("de")} Hm</span>
                {/if}
                {#if seg.elevation.down > 0}
                  <span class="badge badge-down">↓ {seg.elevation.down.toLocaleString("de")} Hm</span>
                {/if}
              {/if}
            </div>
          </div>

          <!-- Sparkline elevation profile -->
          {#if seg.sparkline && !seg.sightseeing}
            <div class="sparkline-wrap">
              <svg
                viewBox="0 0 200 56"
                preserveAspectRatio="none"
                class="sparkline"
                aria-hidden="true"
              >
                <polyline
                  points={seg.sparkline}
                  fill="none"
                  stroke={color}
                  stroke-width="1.5"
                  stroke-linejoin="round"
                  stroke-linecap="round"
                />
              </svg>
            </div>
          {/if}

          <!-- Notes -->
          {#if seg.notes}
            <p class="seg-notes">{seg.notes}</p>
          {/if}

          <!-- Waypoints -->
          {#if seg.waypoints.length > 0}
            <ul class="waypoints">
              {#each seg.waypoints as wp}
                <li>📍 <strong>{wp.name}</strong> <span class="wp-km">+{wp.distFromStart} km</span></li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <footer class="summary-footer">
    Zusammenfassung · {tour.name}
  </footer>
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: #f3f4f6;
    color: #1e293b;
  }

  .summary-page {
    max-width: 900px;
    margin: 0 auto;
    padding: 1.25rem 1.25rem 3rem;
  }

  /* ── Top bar ─────────────────────────────── */
  .top-bar {
    display: flex;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  .back-link {
    color: #3b82f6;
    text-decoration: none;
    font-size: 0.9rem;
  }
  .back-link:hover {
    color: #2563eb;
  }

  /* ── Cover ────────────────────────────────── */
  .cover {
    text-align: center;
    padding: 1rem 0 1.25rem;
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 1.25rem;
    background: #fff;
    border-radius: 12px;
    padding: 1.5rem;
  }

  .tour-title {
    font-size: 1.7rem;
    font-weight: 800;
    margin: 0 0 0.3rem;
    color: #0f172a;
  }

  .tour-desc {
    color: #64748b;
    margin: 0 0 1.5rem;
    font-size: 1rem;
  }

  .cover-stats {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem 1.75rem;
    margin-top: 0.6rem;
  }

  .cstat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 80px;
  }

  .cval {
    font-size: 1.1rem;
    font-weight: 700;
    color: #0f172a;
  }

  .clabel {
    font-size: 0.72rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 0.15rem;
  }

  /* ── Segment cards ────────────────────────── */
  .segments {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
  }

  @media (max-width: 600px) {
    .segments {
      grid-template-columns: 1fr;
    }
  }

  .seg-card {
    display: flex;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    min-height: 180px;
  }

  .seg-card.sightseeing {
    opacity: 0.85;
    background: #f8fafc;
  }

  .seg-bar {
    width: 6px;
    flex-shrink: 0;
  }

  .seg-body {
    padding: 0.55rem 0.85rem;
    flex: 1;
    min-width: 0;
  }

  .seg-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .seg-meta {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .seg-name {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0;
    color: #0f172a;
  }

  .seg-date {
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 0.1rem;
  }

  .seg-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    align-items: flex-start;
    justify-content: flex-end;
  }

  .badge {
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
    white-space: nowrap;
  }

  .badge-km   { background: #eff6ff; color: #1d4ed8; }
  .badge-up   { background: #f0fdf4; color: #15803d; }
  .badge-down { background: #fff7ed; color: #c2410c; }
  .badge-rest { background: #f1f5f9; color: #475569; }

  /* ── Sparkline ────────────────────────────── */
  .sparkline-wrap {
    margin: 0.35rem 0 0.2rem;
    height: 92px;
  }

  .sparkline {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* ── Notes ────────────────────────────────── */
  .seg-notes {
    margin: 0.3rem 0 0;
    font-size: 0.8rem;
    color: #475569;
    line-height: 1.4;
    white-space: pre-line;
  }

  /* ── Waypoints ────────────────────────────── */
  .waypoints {
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem 1rem;
  }

  .waypoints li {
    font-size: 0.82rem;
    color: #334155;
  }

  .wp-km {
    color: #94a3b8;
    font-size: 0.75rem;
  }

  /* ── Footer ───────────────────────────────── */
  .summary-footer {
    margin-top: 1.5rem;
    text-align: center;
    font-size: 0.72rem;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 0.6rem;
  }
</style>
