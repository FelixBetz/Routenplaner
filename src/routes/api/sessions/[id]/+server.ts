import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Superseded by /api/tours/[id]/sessions/[sessionId]
const gone = () => error(410, 'Use /api/tours/[id]/sessions/[sessionId] instead');
export const DELETE: RequestHandler = gone;
export const PATCH: RequestHandler = gone;

