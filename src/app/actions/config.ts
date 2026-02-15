'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const configSchema = z.object({
    model: z.string(),
    apiKey: z.string().optional(),
})

export async function saveLlmConfig(projectId: string, prevState: any, formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    const validatedFields = configSchema.safeParse({
        model: formData.get('model'),
        apiKey: formData.get('apiKey'),
    })

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors }
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    const project = await prisma.project.findUnique({
        where: { id: projectId },
    })

    if (!project || project.ownerId !== user.id) {
        return { message: "Project not found or unauthorized" }
    }

    const config = {
        provider: 'openai', // Hardcoded for now, or derive from model name
        model: validatedFields.data.model,
        apiKey: validatedFields.data.apiKey // Be careful storing this in plain text in production!
    }

    await prisma.project.update({
        where: { id: projectId },
        data: {
            llmConfig: JSON.stringify(config)
        }
    })

    revalidatePath(`/projects/${projectId}`)
    return { message: "Configuration Saved", success: true }
}
