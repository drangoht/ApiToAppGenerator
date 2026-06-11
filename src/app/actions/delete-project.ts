'use server'

import { prisma } from "@/lib/prisma"
import fs from "fs/promises"
import path from "path"
import { PreviewManager } from "@/lib/preview-manager"
import { revalidatePath } from "next/cache"
import { verifyProjectAccess } from "@/lib/project-access"

export async function deleteProjectAction(projectId: string) {
    const access = await verifyProjectAccess(projectId)
    if (!access) throw new Error("Unauthorized")

    // 1. Force stop any running preview process holding a lock on the directory (Windows EBUSY)
    PreviewManager.stopPreview(projectId)

    // 2. Delete all DB records atomically — prevents a partial state where enrichments are
    //    gone but the project still exists (or vice-versa) if one operation fails.
    await prisma.$transaction([
        prisma.endpointEnrichment.deleteMany({ where: { projectId } }),
        prisma.project.delete({ where: { id: projectId } }),
    ])

    // 3. Delete file system directory (best-effort after DB is committed)
    try {
        const projectDir = path.join(process.cwd(), 'projects', projectId)
        // Small delay to ensure Windows releases file handles after SIGKILL
        await new Promise(r => setTimeout(r, 1000));
        await fs.rm(projectDir, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 500
        })
    } catch (e) {
        console.error("Failed to delete project directory. It might not exist or is locked.", e)
    }

    revalidatePath('/dashboard')
    return { success: true }
}
