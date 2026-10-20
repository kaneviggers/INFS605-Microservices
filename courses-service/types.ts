import * as z from 'zod';

// PATCH /courses/:course_code
export const patch_course = z.object({
    title: z.string()
})

// POST /courses
export const post_course = z.object({
    title: z.string(),
    course_code: z.string()
})

// POST /courses/:course_code/students
export const post_enroll = z.object({
    student_id: z.number()
})