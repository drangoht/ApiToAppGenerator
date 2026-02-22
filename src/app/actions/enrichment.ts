'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const enrichmentSchema = z.object({
    description: z.string().max(500, "Description cannot exceed 500 characters").nullable().optional(),
    instruction: z.string().max(2000, "Instruction cannot exceed 2000 characters").nullable().optional()
})

export async function saveEnrichment(projectId: string, method: string, path: string, description: string | null, instruction: string | null) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    const validatedFields = enrichmentSchema.safeParse({ description, instruction })
    if (!validatedFields.success) return { message: "Validation error: Input is too long." }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
    })

    if (!project || project.ownerId !== user.id) {
        return { message: "Project not found or unauthorized" }
    }

    await prisma.endpointEnrichment.upsert({
        where: {
            projectId_method_path: {
                projectId,
                method,
                path
            }
        },
        update: {
            description,
            instruction
        },
        create: {
            projectId,
            method,
            path,
            description,
            instruction
        }
    })

    revalidatePath(`/projects/${projectId}`)
    return { message: "Success" }
}
