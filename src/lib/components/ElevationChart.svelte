<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { TrackPoint, Session } from "$lib/types.js";
  import { SESSION_COLORS, hexToRgba } from "$lib/colors.js";

  interface Props {
    chartPoints: TrackPoint[];
    progressKm: number;
    totalKm: number;
    sessions: Session[];
  }

  let { chartPoints, progressKm, totalKm, sessions }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart = $state<any>(null);

  function buildDatasets() {
    const datasets: any[] = [];
    let cumKm = 0;

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const startKm = cumKm;
      const endKm = cumKm + s.distance / 1000;
      const color = SESSION_COLORS[i % SESSION_COLORS.length];
      datasets.push({
        label: s.name,
        data: chartPoints.map((p) =>
          p.cumDist >= startKm && p.cumDist <= endKm ? p.ele : null,
        ),
        borderColor: color,
        backgroundColor: hexToRgba(color, 0.55),
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        spanGaps: false,
      });
      cumKm = endKm;
    }

    // Remaining (gray)
    datasets.push({
      label: "Ausstehend",
      data: chartPoints.map((p) => (p.cumDist >= progressKm ? p.ele : null)),
      borderColor: "#9ca3af",
      backgroundColor: "rgba(156,163,175,0.4)",
      fill: true,
      tension: 0.2,
      pointRadius: 0,
      spanGaps: false,
    });

    return datasets;
  }

  onMount(async () => {
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

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: chartPoints.map((p) => p.cumDist.toFixed(1)),
        datasets: buildDatasets(),
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
              callback: (_val: any, i: number) => {
                const km = parseFloat(chartPoints[i]?.cumDist.toFixed(0) ?? "");
                return `${km} km`;
              },
            },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
          y: {
            title: { display: true, text: "Höhe (m)" },
            grid: { color: "rgba(0,0,0,0.05)" },
          },
        },
      },
    });
  });

  onDestroy(() => {
    chart?.destroy();
  });

  $effect(() => {
    if (!chart) return;
    chart.data.datasets = buildDatasets();
    chart.update("none");
  });
</script>

<div class="chart-container">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-container {
    width: 100%;
    height: 250px;
    position: relative;
  }
</style>
