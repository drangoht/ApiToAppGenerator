'use server'

import { prisma } from "@/lib/prisma"
import { GeneratorService } from "@/lib/generator"
import { revalidatePath } from "next/cache"
import { resolveLlmConfig, resolveEnvApiKey } from "@/lib/llm-client"
import { verifyProjectAccess } from "@/lib/project-access"

export async function generateAppAction(projectId: string) {
    const access = await verifyProjectAccess(projectId)
    if (!access) return { message: "Unauthorized" }
    const { project } = access

    try {
        await prisma.project.update({ where: { id: projectId }, data: { status: 'GENERATING' } });

        const llmConfig = resolveLlmConfig(project.llmConfig)
        const resolvedApiKey = llmConfig.apiKey || resolveEnvApiKey(llmConfig.provider!)

        if (!resolvedApiKey) {
            await prisma.project.update({ where: { id: projectId }, data: { status: 'DRAFT' } });
            return { message: "No API Key configured. Please add one in the Settings tab.", success: false };
        }

        const generator = new GeneratorService(projectId, llmConfig.apiKey, llmConfig.model);
        await generator.generate();

        await prisma.project.update({ where: { id: projectId }, data: { status: 'READY' } });
        revalidatePath(`/projects/${projectId}`);
        return { message: "App Generated Successfully!", success: true };

    } catch (error: any) {
        console.error("Generation Failed:", error);
        await prisma.project.update({ where: { id: projectId }, data: { status: 'ERROR' } });

        let errorMessage = "Generation Failed. Check logs.";
        if (error.response?.data?.error?.message) {
            errorMessage = error.response.data.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        return { message: errorMessage, success: false };
    }
}
