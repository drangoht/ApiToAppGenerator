'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import fs from "fs/promises"
import path from "path"
import { PreviewManager } from "@/lib/preview-manager"
import { revalidatePath } from "next/cache"

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

    // 1. Force stop any running preview process holding a lock on the directory (Windows EBUSY)
    PreviewManager.stopPreview(projectId)

    // 2. Delete associated data
    await prisma.endpointEnrichment.deleteMany({
        where: { projectId: projectId }
    })

    // 3. Delete project from DB
    await prisma.project.delete({
        where: { id: projectId }
    })

    // 4. Delete file system directory
    try {
        const projectDir = path.join(process.cwd(), 'projects', projectId)
        // Add a tiny delay to ensure Windows actually releases the file handles after sigkill
        await new Promise(r => setTimeout(r, 1000));
        await fs.rm(projectDir, {
            recursive: true,
            force: true,
            maxRetries: 5,        // Aggressively retry on Windows EBUSY
            retryDelay: 500       // Wait 500ms between each atomic retry
        })
    } catch (e) {
        console.error("Failed to delete project directory. It might not exist or is locked.", e)
        // Throwing error allows the UI to catch it, but the DB record is already gone.
        // For POC, we just log it so we don't crash.
    }

    revalidatePath('/dashboard')
    return { success: true }
}
