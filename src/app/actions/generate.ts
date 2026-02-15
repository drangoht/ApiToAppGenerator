'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { GeneratorService } from "@/lib/generator"
import { revalidatePath } from "next/cache"

export async function generateAppAction(projectId: string) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project || project.ownerId !== user.id) return { message: "Project not found or unauthorized" }

    try {
        // Update status
        await prisma.project.update({ where: { id: projectId }, data: { status: 'GENERATING' } });

        // Initialize generator
        // We need to retrieve API key from config if set, or use env
        let apiKey = undefined;
        if (project.llmConfig) {
            const config = JSON.parse(project.llmConfig);
            if (config.apiKey) apiKey = config.apiKey;
        }

        const generator = new GeneratorService(projectId, apiKey);
        await generator.generate();

        await prisma.project.update({ where: { id: projectId }, data: { status: 'READY' } });
        revalidatePath(`/projects/${projectId}`);
        return { message: "App Generated Successfully!", success: true };

    } catch (error) {
        console.error("Generation Failed:", error);
        await prisma.project.update({ where: { id: projectId }, data: { status: 'ERROR' } });
        return { message: "Generation Failed. Check logs.", success: false };
    }
}
