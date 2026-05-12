import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Superseded by /api/tours/[id]/sessions
const gone = () => error(410, 'Use /api/tours/[id]/sessions instead');
export const GET: RequestHandler = gone;
export const POST: RequestHandler = gone;

