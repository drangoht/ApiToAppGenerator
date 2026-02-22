'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"

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
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

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

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

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
    const session = await auth();
    if (!session?.user?.email) return { error: 'Unauthorized' };

    const validatedFields = updateProjectSchema.safeParse({ description })
    if (!validatedFields.success) return { error: "Invalid description length." }

    try {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });
        if (!user) return { error: 'User not found' };

        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project || project.ownerId !== user.id) return { error: 'Project not found or unauthorized' };

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
