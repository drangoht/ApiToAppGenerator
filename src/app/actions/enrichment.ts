'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function saveEnrichment(projectId: string, method: string, path: string, description: string | null, instruction: string | null) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

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
