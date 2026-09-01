<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	// Global statt aus RouteMap.svelte nachgeladen: sonst mountet auf der
	// Standard-Tab-Reihenfolge (Planner zuerst) die SegmentPlanner-Karte,
	// bevor RouteMap ueberhaupt existiert, um das CSS per <link> nachzuladen —
	// die Karte rendert dann einmalig mit falscher Kachel-Positionierung.
	import 'leaflet/dist/leaflet.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
