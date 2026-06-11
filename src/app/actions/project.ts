'use server'

import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { verifySession, verifyProjectAccess } from "@/lib/project-access"

const createProjectSchema = z.object({
    name: z.string().min(3, { message: "Name must be at least 3 characters" }),
    description: z.string().optional(),
})

export type CreateProjectState = {
    errors?: {
        name?: string[];
        description?: string[];
    };
    message?: string | null;
};

export async function createProject(prevState: CreateProjectState, formData: FormData): Promise<CreateProjectState> {
    const user = await verifySession()
    if (!user) return { message: "Unauthorized" }

    const validatedFields = createProjectSchema.safeParse({
        name: formData.get('name'),
        description: formData.get('description'),
    })

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: "Missing or invalid fields."
        }
    }

    let project;
    try {
        project = await prisma.project.create({
            data: {
                name: validatedFields.data.name,
                description: validatedFields.data.description,
                ownerId: user.id,
            },
        })
    } catch (error) {
        console.error(error)
        return { message: "Database Error: Failed to Create Project." }
    }

    redirect(`/projects/${project.id}`)
}

const updateProjectSchema = z.object({
    description: z.string().max(500, "Description cannot exceed 500 characters.").optional().nullable(),
})

export async function updateProjectDescription(projectId: string, description: string) {
    const access = await verifyProjectAccess(projectId)
    if (!access) return { error: 'Unauthorized' }

    const validatedFields = updateProjectSchema.safeParse({ description })
    if (!validatedFields.success) return { error: "Invalid description length." }

    try {
        await prisma.project.update({
            where: { id: projectId },
            data: { description: validatedFields.data.description ?? "" }
        });

        revalidatePath(`/projects/${projectId}`);
        return { success: true };
    } catch (e) {
        console.error('Failed to update project description', e);
        return { error: 'Database Error' };
    }
}
