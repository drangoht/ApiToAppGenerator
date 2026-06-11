import { NextResponse } from "next/server"
import { PreviewManager } from "@/lib/preview-manager"
import { verifyProjectAccess } from "@/lib/project-access"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const access = await verifyProjectAccess(id);
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = PreviewManager.getStatus(id) || { status: 'IDLE', port: null, errorMessage: undefined };
    return NextResponse.json({
        status: status.status,
        port: status.port,
        errorMessage: status.errorMessage
    });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const access = await verifyProjectAccess(id);
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const instance = await PreviewManager.startPreview(id);
        return NextResponse.json({ status: instance.status, port: instance.port });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const access = await verifyProjectAccess(id);
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    PreviewManager.stopPreview(id);
    return NextResponse.json({ success: true });
}
