'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import fs from "fs/promises"
import path from "path"
import archiver from "archiver"
import { createReadStream, createWriteStream } from "fs"

export async function downloadProject(projectId: string) {
    const session = await auth()
    if (!session?.user?.email) return { error: "Unauthorized" }

    const projectDir = path.join(process.cwd(), 'projects', projectId, 'generated');

    try {
        await fs.access(projectDir);
    } catch {
        return { error: "No generated code found." };
    }

    // We need to stream this back... Next.js server actions are tricky with streams.
    // Ideally we use a Route Handler for downloading files.
    return { success: true };
}
