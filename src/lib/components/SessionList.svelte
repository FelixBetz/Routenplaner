<script lang="ts">
  import type { Session } from "$lib/types.js";
  import { SESSION_COLORS } from "$lib/colors.js";

  interface Props {
    tourId: number;
    sessions: Session[];
    onDeleted: (id: number) => void;
    onUpdated: (s: Session) => void;
  }

  let { tourId, sessions, onDeleted, onUpdated }: Props = $props();

  // Neueste oben anzeigen; Farbindex bleibt an der Original-Reihenfolge (chronologisch)
  const displayed = $derived([...sessions].reverse());

  let deletingId = $state<number | null>(null);

  // Edit modal state
  let editSession = $state<Session | null>(null);
  let editDate = $state("");
  let editName = $state("");
  let editDistanceKm = $state(0);
  let editDurationH = $state(0);
  let editDurationMin = $state(0);
  let editElevation = $state(0);
  let editSaving = $state(false);
  let editError = $state("");

  function openEdit(s: Session) {
    editSession = s;
    editDate = s.date;
    editName = s.name;
    editDistanceKm = Math.round(s.distance / 100) / 10;
    editDurationH = Math.floor(s.duration / 3600);
    editDurationMin = Math.floor((s.duration % 3600) / 60);
    editElevation = s.elevation;
    editError = "";
  }

  function closeEdit() {
    editSession = null;
  }

  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!editSession) return;
    editSaving = true;
    editError = "";
    try {
      const payload = {
        date: editDate,
        name: editName,
        distance: Math.round(editDistanceKm * 1000),
        duration: editDurationH * 3600 + editDurationMin * 60,
        elevation: Math.round(editElevation),
      };
      const res = await fetch(
        `/api/tours/${tourId}/sessions/${editSession.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        editError = "Fehler beim Speichern";
      } else {
        const updated: Session = await res.json();
        onUpdated(updated);
        closeEdit();
      }
    } catch {
      editError = "Netzwerkfehler";
    } finally {
      editSaving = false;
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Training wirklich löschen?")) return;
    deletingId = id;
    try {
      const res = await fetch(`/api/tours/${tourId}/sessions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) onDeleted(id);
    } finally {
      deletingId = null;
    }
  }

  function formatDate(dt: string) {
    const d = new Date(dt.length === 10 ? dt + "T00:00" : dt);
    const date = d.toLocaleDateString("de-AT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    if (dt.length <= 10) return date;
    const time = d.toLocaleTimeString("de-AT", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} ${time}`;
  }

  function formatDuration(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
</script>

<!-- Edit Modal -->
{#if editSession}
  <div
    class="modal-backdrop"
    onclick={closeEdit}
    onkeydown={(e) => e.key === "Escape" && closeEdit()}
    role="presentation"
    tabindex="-1"
  >
    <div
      class="modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div class="modal-header">
        <h3>Training bearbeiten</h3>
        <button class="modal-close" onclick={closeEdit}>✕</button>
      </div>
      <form onsubmit={saveEdit} class="modal-form">
        {#if editError}<p class="error">{editError}</p>{/if}
        <div class="grid">
          <label>
            Datum & Uhrzeit
            <input type="datetime-local" bind:value={editDate} required />
          </label>
          <label>
            Name
            <input type="text" bind:value={editName} required />
          </label>
          <label>
            Distanz (km)
            <input
              type="number"
              min="0"
              step="0.1"
              bind:value={editDistanceKm}
              required
            />
          </label>
          <label>
            Höhenmeter (m)
            <input type="number" min="0" step="1" bind:value={editElevation} />
          </label>
          <label>
            Dauer – Stunden
            <input type="number" min="0" step="1" bind:value={editDurationH} />
          </label>
          <label>
            Dauer – Minuten
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              bind:value={editDurationMin}
            />
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-cancel" onclick={closeEdit}
            >Abbrechen</button
          >
          <button type="submit" class="btn-save" disabled={editSaving}>
            {editSaving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<div class="session-list">
  <h2>Trainings ({sessions.length})</h2>

  {#if sessions.length === 0}
    <p class="empty">Noch keine Trainings eingetragen.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Datum</th>
            <th>Name</th>
            <th>Distanz</th>
            <th>Hm</th>
            <th>Dauer</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each displayed as s (s.id)}
            {@const i = sessions.indexOf(s)}
            <tr>
              <td
                ><span
                  class="color-dot"
                  style="background:{SESSION_COLORS[i % SESSION_COLORS.length]}"
                ></span></td
              >
              <td class="date-cell">{formatDate(s.date)}</td>
              <td class="name-cell">{s.name}</td>
              <td>{(s.distance / 1000).toFixed(2)} km</td>
              <td>{s.elevation} m</td>
              <td>{formatDuration(s.duration)}</td>
              <td class="action-cell">
                <button
                  class="edit-btn"
                  onclick={() => openEdit(s)}
                  aria-label="Bearbeiten">✏️</button
                >
                <button
                  class="del-btn"
                  disabled={deletingId === s.id}
                  onclick={() => handleDelete(s.id)}
                  aria-label="Löschen">✕</button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .session-list {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1.25rem;
  }

  h2 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .empty {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
    white-space: nowrap;
  }

  th {
    text-align: left;
    padding: 0.4rem 0.6rem;
    border-bottom: 2px solid #e5e7eb;
    color: #6b7280;
    font-weight: 600;
  }

  td {
    padding: 0.4rem 0.6rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .name-cell {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .date-cell {
    white-space: nowrap;
  }

  .action-cell {
    display: flex;
    gap: 2px;
    align-items: center;
  }

  tbody tr:hover {
    background: #f0fdf4;
  }

  .edit-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 2px 5px;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .edit-btn:hover {
    background: #fef9c3;
  }

  .del-btn {
    background: none;
    border: none;
    color: #ef4444;
    cursor: pointer;
    font-size: 0.9rem;
    padding: 2px 6px;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .del-btn:hover:not(:disabled) {
    background: #fee2e2;
  }
  .del-btn:disabled {
    opacity: 0.4;
  }

  .color-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: #6b7280;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .modal-close:hover {
    background: #f3f4f6;
  }

  .modal-form {
    padding: 1rem 1.25rem 1.25rem;
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

  .error {
    color: #dc2626;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .btn-cancel {
    padding: 0.45rem 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .btn-cancel:hover {
    background: #e5e7eb;
  }

  .btn-save {
    padding: 0.45rem 1rem;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-save:hover:not(:disabled) {
    background: #16a34a;
  }
  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
