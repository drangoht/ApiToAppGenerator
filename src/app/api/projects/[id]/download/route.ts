import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import path from "path"
import fs from "fs"
import archiver from "archiver"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth()
    if (!session?.user?.email) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const { id: projectId } = await params;

    // Verify ownership
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    const project = await prisma.project.findUnique({ where: { id: projectId } })

    if (!project || project.ownerId !== user?.id) {
        return new NextResponse("Unauthorized", { status: 403 })
    }

    const projectDir = path.join(process.cwd(), 'projects', projectId, 'generated');

    if (!fs.existsSync(projectDir)) {
        return new NextResponse("No generated code found", { status: 404 })
    }

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    const stream = new ReadableStream({
        start(controller) {
            archive.on('data', (chunk) => controller.enqueue(chunk));
            archive.on('end', () => controller.close());
            archive.on('error', (err) => controller.error(err));

            archive.directory(projectDir, false);
            archive.finalize();
        }
    });

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${project.name.replace(/\s+/g, '_')}_generated.zip"`
        }
    })
}
