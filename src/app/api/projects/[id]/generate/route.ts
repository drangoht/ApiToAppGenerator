import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { GeneratorService } from "@/lib/generator"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project || project.ownerId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (project.status === 'GENERATING') {
        return NextResponse.json({ error: "Generation already in progress" }, { status: 409 });
    }

    let apiKey: string | undefined;
    let model = "gpt-4-turbo";
    if (project.llmConfig) {
        try {
            const config = JSON.parse(project.llmConfig);
            if (config.apiKey) apiKey = config.apiKey;
            if (config.model) model = config.model;
        } catch { }
    }

    if (!apiKey && !process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: "OpenAI API Key is missing. Please add it in the Settings tab." }, { status: 400 });
    }

    // Mark as GENERATING immediately so the client knows it started
    await prisma.project.update({ where: { id }, data: { status: 'GENERATING' } });

    // Fire-and-forget: run generation in the background WITHOUT awaiting.
    // This lets the HTTP request return immediately (no timeout), while the
    // LLM call continues running in the Node.js event loop.
    const generator = new GeneratorService(id, apiKey, model);
    generator.generate()
        .then(async () => {
            await prisma.project.update({ where: { id }, data: { status: 'READY' } });
            console.log(`[Generate] Project ${id} generation complete.`);
        })
        .catch(async (error: any) => {
            console.error(`[Generate] Project ${id} generation failed:`, error);
            await prisma.project.update({ where: { id }, data: { status: 'ERROR' } });
        });

    // Return 202 Accepted immediately — client will poll for status
    return NextResponse.json({ status: 'GENERATING' }, { status: 202 });
}

// Lightweight status check endpoint — returns just the project status for polling
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const project = await prisma.project.findUnique({ where: { id }, select: { status: true, ownerId: true } });
    if (!project || project.ownerId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ status: project.status });
}
