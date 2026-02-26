import { NextResponse } from "next/server"
import { PreviewManager } from "@/lib/preview-manager"

// Public endpoint — no auth required. Only returns status/port (no sensitive data).
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
    const { projectId } = await params;
    const status = PreviewManager.getStatus(projectId) || { status: 'IDLE', port: null };
    return NextResponse.json({ status: status.status, port: status.port });
}
