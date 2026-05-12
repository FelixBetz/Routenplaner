import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Superseded by /api/tours/[id]/settings
const gone = () => error(410, 'Use /api/tours/[id]/settings instead');
export const GET: RequestHandler = gone;
export const PUT: RequestHandler = gone;

