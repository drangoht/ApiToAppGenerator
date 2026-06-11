'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { verifyProjectAccess } from "@/lib/project-access"

export async function saveTargetApiConfig(projectId: string, prevState: any, formData: FormData) {
    const access = await verifyProjectAccess(projectId)
    if (!access) return { message: "Unauthorized", success: false }

    const configStr = formData.get('targetApiConfig') as string;
    let configObj = {};
    if (configStr) {
        try {
            configObj = JSON.parse(configStr);
        } catch {
            return { message: "Invalid format for API Config", success: false }
        }
    }

    await prisma.project.update({
        where: { id: projectId },
        data: {
            targetApiConfig: Object.keys(configObj).length > 0 ? JSON.stringify(configObj) : null
        }
    })

    revalidatePath(`/projects/${projectId}`)
    return { message: "Environment Variables Saved", success: true }
}
