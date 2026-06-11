'use server'

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { parseOpenApiSpec } from "@/lib/openapi-parser"
import yaml from 'js-yaml'
import { verifyProjectAccess } from "@/lib/project-access"

export async function uploadOpenApiSpec(projectId: string, formData: FormData) {
    const access = await verifyProjectAccess(projectId)
    if (!access) return { message: "Unauthorized" }

    const file = formData.get('file') as File
    if (!file) return { message: "No file provided" }

    if (file.size > 5 * 1024 * 1024) {
        return { message: "File size exceeds 5MB security limit" }
    }

    const content = await file.text()

    let parsedSpec;
    try {
        let specObj;
        try {
            specObj = JSON.parse(content);
        } catch {
            specObj = yaml.load(content);
        }
        parsedSpec = await parseOpenApiSpec(specObj);
    } catch (error) {
        return { message: "Invalid OpenAPI File. Please ensure it is a valid JSON or YAML Swagger/OpenAPI spec." }
    }

    const paths = (parsedSpec as any).paths || {};
    const enrichmentUpserts = [];

    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, details] of Object.entries(methods as any)) {
            if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                enrichmentUpserts.push(prisma.endpointEnrichment.upsert({
                    where: {
                        projectId_method_path: { projectId, method: method.toUpperCase(), path }
                    },
                    update: {},
                    create: {
                        projectId,
                        method: method.toUpperCase(),
                        path,
                        description: (details as any).summary || (details as any).description
                    }
                }))
            }
        }
    }

    // Update spec and enrichments atomically
    await prisma.$transaction([
        prisma.project.update({
            where: { id: projectId },
            data: { openApiSpec: JSON.stringify(parsedSpec), status: 'SPEC_UPLOADED' }
        }),
        ...enrichmentUpserts,
    ])

    revalidatePath(`/projects/${projectId}`)
    return { message: "Success" }
}
