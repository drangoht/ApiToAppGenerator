'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import fs from "fs/promises"
import path from "path"

export async function deleteProjectAction(projectId: string) {
    const session = await auth()
    if (!session?.user?.email) throw new Error("Unauthorized")

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) throw new Error("User not found")

    const project = await prisma.project.findUnique({
        where: { id: projectId },
    })

    if (!project || project.ownerId !== user.id) {
        throw new Error("Project not found or unauthorized")
    }

    // 1. Delete associated data
    await prisma.endpointEnrichment.deleteMany({
        where: { projectId: projectId }
    })

    // 2. Delete project from DB
    await prisma.project.delete({
        where: { id: projectId }
    })

    // 3. Delete file system directory
    try {
        const projectDir = path.join(process.cwd(), 'projects', projectId)
        await fs.rm(projectDir, { recursive: true, force: true })
    } catch (e) {
        console.error("Failed to delete project directory. It might not exist.", e)
    }

    return { success: true }
}
