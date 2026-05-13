<script lang="ts">
  import type { NewSession } from "$lib/types.js";
  import { parseActivityGpx } from "$lib/gpx-client.js";

  interface Props {
    tourId: number;
    onSaved: () => void;
  }

  let { tourId, onSaved }: Props = $props();

  let loading = $state(false);
  let errorMsg = $state("");
  let importError = $state("");

  // UI fields (what the user types)
  let date = $state(new Date().toISOString().slice(0, 16)); // "YYYY-MM-DDTHH:MM"
  let name = $state("");
  let distanceKm = $state<number | "">(0);
  let durationH = $state<number | "">(0);
  let durationMin = $state<number | "">(0);
  let elevation = $state<number | "">(0);

  async function handleActivityGpx(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importError = "";
    try {
      const text = await file.text();
      const activity = parseActivityGpx(text);
      name = activity.name;
      date = activity.datetime;
      distanceKm = Math.round(activity.distanceM / 100) / 10; // 1 decimal km
      elevation = activity.elevationM;
      durationH = Math.floor(activity.durationS / 3600);
      durationMin = Math.floor((activity.durationS % 3600) / 60);
    } catch (err: any) {
      importError = err.message ?? "GPX konnte nicht gelesen werden";
    } finally {
      (e.target as HTMLInputElement).value = "";
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    loading = true;
    errorMsg = "";
    try {
      const payload: Omit<NewSession, "tour_id"> = {
        date,
        name,
        distance: Math.round((Number(distanceKm) || 0) * 1000),
        duration:
          (Number(durationH) || 0) * 3600 + (Number(durationMin) || 0) * 60,
        elevation: Math.round(Number(elevation) || 0),
      };
      const res = await fetch(`/api/tours/${tourId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        errorMsg = err.message ?? "Fehler beim Speichern";
      } else {
        date = new Date().toISOString().slice(0, 16);
        name = "";
        distanceKm = 0;
        durationH = 0;
        durationMin = 0;
        elevation = 0;
        onSaved();
      }
    } catch {
      errorMsg = "Netzwerkfehler";
    } finally {
      loading = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="training-form">
  <div class="form-header">
    <h2>Training eintragen</h2>
    <label class="gpx-import-btn" title="Aus GPX-Datei befüllen">
      📥 GPX importieren
      <input type="file" accept=".gpx" onchange={handleActivityGpx} />
    </label>
  </div>

  {#if importError}
    <p class="error">{importError}</p>
  {/if}
  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}

  <div class="grid">
    <label>
      Datum & Uhrzeit
      <input type="datetime-local" bind:value={date} required />
    </label>
    <label>
      Name / Bezeichnung
      <input
        type="text"
        bind:value={name}
        placeholder="z.B. Ausfahrt Donauradweg"
        required
      />
    </label>

    <label>
      Distanz (km)
      <input
        type="number"
        min="0"
        step="0.1"
        bind:value={distanceKm}
        placeholder="0.0"
        required
      />
    </label>

    <label>
      Höhenmeter (m)
      <input
        type="number"
        min="0"
        step="1"
        bind:value={elevation}
        placeholder="0"
      />
    </label>

    <label>
      Dauer – Stunden
      <input
        type="number"
        min="0"
        step="1"
        bind:value={durationH}
        placeholder="0"
      />
    </label>
    <label>
      Dauer – Minuten
      <input
        type="number"
        min="0"
        max="59"
        step="1"
        bind:value={durationMin}
        placeholder="0"
      />
    </label>
  </div>

  <button type="submit" disabled={loading}>
    {loading ? "Speichern…" : "Training speichern"}
  </button>
</form>

<style>
  .training-form {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.25rem;
  }

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .gpx-import-btn {
    display: inline-block;
    padding: 0.35rem 0.75rem;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .gpx-import-btn:hover {
    background: #dbeafe;
  }

  .gpx-import-btn input {
    display: none;
  }

  .error {
    color: #dc2626;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    font-weight: 500;
    color: #374151;
    gap: 3px;
  }

  input {
    padding: 0.4rem 0.6rem;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    font-size: 0.9rem;
    width: 100%;
    min-width: 0;
    background: white;
    outline: none;
    transition: border-color 0.15s;
  }

  input:focus {
    border-color: #22c55e;
  }

  button {
    width: 100%;
    padding: 0.6rem;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  button:hover:not(:disabled) {
    background: #16a34a;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .form-header {
      flex-wrap: wrap;
    }
  }
</style>
