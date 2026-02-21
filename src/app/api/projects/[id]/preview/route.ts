import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { PreviewManager } from "@/lib/preview-manager"

async function verifyAccess(projectId: string) {
    const session = await auth();
    if (!session?.user?.email) return null;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return null;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.ownerId !== user.id) return null;

    return project;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const project = await verifyAccess(id);
    if (!project) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = PreviewManager.getStatus(id) || { status: 'IDLE', port: null, errorMessage: undefined };

    // We omit the actual ChildProcess from the response to avoid serialization issues
    return NextResponse.json({
        status: status.status,
        port: status.port,
        errorMessage: status.errorMessage
    });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const project = await verifyAccess(id);
    if (!project) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const instance = await PreviewManager.startPreview(id);
        return NextResponse.json({
            status: instance.status,
            port: instance.port
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const project = await verifyAccess(id);
    if (!project) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    PreviewManager.stopPreview(id);
    return NextResponse.json({ success: true });
}
