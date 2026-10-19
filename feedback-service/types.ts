import * as z from 'zod';

// POST /feedback/course/:course_code
export const post_feedback = z.object({
    student_id: z.number(),
    comment: z.string()
})

// PATCH /feedback/:feedback_id
export const patch_feedback = z.object({
    comment: z.string()
})