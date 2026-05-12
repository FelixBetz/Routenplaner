import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

// Superseded by /api/tours/[id]/segments
const gone = () => error(410, 'Use /api/tours/[id]/segments instead');
export const PATCH: RequestHandler = gone;

