'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export async function saveTargetApiConfig(projectId: string, prevState: any, formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized", success: false }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found", success: false }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
    })

    if (!project || project.ownerId !== user.id) {
        return { message: "Project not found or unauthorized", success: false }
    }

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
