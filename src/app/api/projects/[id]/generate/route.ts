import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { GeneratorService } from "@/lib/generator"
import { resolveLlmConfig, resolveEnvApiKey } from "@/lib/llm-client"
import { verifyProjectAccess } from "@/lib/project-access"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const access = await verifyProjectAccess(id)
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { project } = access

    if (project.status === 'GENERATING') {
        return NextResponse.json({ error: "Generation already in progress" }, { status: 409 });
    }

    const llmConfig = resolveLlmConfig(project.llmConfig)
    const resolvedApiKey = llmConfig.apiKey || resolveEnvApiKey(llmConfig.provider!)

    if (!resolvedApiKey) {
        return NextResponse.json({ error: "No API Key configured. Please add one in the Settings tab." }, { status: 400 });
    }

    await prisma.project.update({ where: { id }, data: { status: 'GENERATING' } });

    // Fire-and-forget: generation continues in the background, client polls for status
    const generator = new GeneratorService(id, llmConfig.apiKey, llmConfig.model);
    generator.generate()
        .then(async () => {
            await prisma.project.update({ where: { id }, data: { status: 'READY' } });
            console.log(`[Generate] Project ${id} generation complete.`);
        })
        .catch(async (error: any) => {
            console.error(`[Generate] Project ${id} generation failed:`, error);
            await prisma.project.update({ where: { id }, data: { status: 'ERROR' } });
        });

    return NextResponse.json({ status: 'GENERATING' }, { status: 202 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const access = await verifyProjectAccess(id)
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const project = await prisma.project.findUnique({ where: { id }, select: { status: true } });
    return NextResponse.json({ status: project?.status });
}
