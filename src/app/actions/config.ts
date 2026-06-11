'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { deriveProvider } from "@/lib/llm-client"
import { verifyProjectAccess } from "@/lib/project-access"

const configSchema = z.object({
    model: z.string().max(100, "Model name is too long"),
    apiKey: z.string().max(500, "API Key is too long").optional(),
})

export async function saveLlmConfig(projectId: string, prevState: any, formData: FormData) {
    const access = await verifyProjectAccess(projectId)
    if (!access) return { message: "Unauthorized" }

    const validatedFields = configSchema.safeParse({
        model: formData.get('model'),
        apiKey: formData.get('apiKey'),
    })

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors }
    }

    const model = validatedFields.data.model
    const config = {
        provider: deriveProvider(model),
        model,
        apiKey: validatedFields.data.apiKey,
    }

    await prisma.project.update({
        where: { id: projectId },
        data: { llmConfig: JSON.stringify(config) }
    })

    revalidatePath(`/projects/${projectId}`)
    return { message: "Configuration Saved", success: true }
}
