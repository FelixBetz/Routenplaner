import { redirect, fail } from '@sveltejs/kit';
import { getUserTours, createTour, deleteTour, getTour } from '$lib/db.js';
import type { PageServerLoad, Actions } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!;
	const tours = await getUserTours(user.id);
	return { user, tours };
};

export const actions: Actions = {
	create: async ({ locals, request }) => {
		const user = locals.user!;
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		if (!name) return fail(400, { createError: 'Name erforderlich.' });
		const tour = await createTour({ user_id: user.id, name, description });
		redirect(303, `/tour/${tour.id}`);
	},
	delete: async ({ locals, request }) => {
		const user = locals.user!;
		const data = await request.formData();
		const id = parseInt(String(data.get('id') ?? ''), 10);
		if (isNaN(id)) return fail(400, { deleteError: 'Invalid tour id.' });
		const tour = await getTour(id);
		if (!tour || tour.user_id !== user.id) return fail(403, { deleteError: 'Nicht berechtigt.' });
		await deleteTour(id);
		return { deleted: true };
	},
};
