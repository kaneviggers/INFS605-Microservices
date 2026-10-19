import * as z from 'zod';

// POST & PATCH /students
export const post_student = z.object({
    name: z.string(),
    email: z.email(),
    degree: z.string()
})

// PATCH /students
export const patch_student = z.object({
    name: z.string().optional(),
    email: z.email().optional(),
    degree: z.string().optional()
})