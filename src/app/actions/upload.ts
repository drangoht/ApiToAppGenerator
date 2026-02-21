'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { parseOpenApiSpec } from "@/lib/openapi-parser"
import { OpenAPIV3 } from "openapi-types"
import yaml from 'js-yaml'

export async function uploadOpenApiSpec(projectId: string, formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    const file = formData.get('file') as File
    if (!file) {
        return { message: "No file provided" }
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
        // We parse/validate it first
        parsedSpec = await parseOpenApiSpec(specObj);
    } catch (error) {
        return { message: "Invalid OpenAPI File. Please ensure it is a valid JSON or YAML Swagger/OpenAPI spec." }
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    // Verify project ownership
    const project = await prisma.project.findUnique({
        where: { id: projectId },
    })

    if (!project || project.ownerId !== user.id) {
        return { message: "Project not found or unauthorized" }
    }

    // Save the spec to the project
    await prisma.project.update({
        where: { id: projectId },
        data: {
            openApiSpec: JSON.stringify(parsedSpec),
            status: 'SPEC_UPLOADED' // We might want to add this status to the Prisma Enum later if we used Enum
        }
    })

    // Extract endpoints and create initial enrichment entries?
    // For now, let's just save the spec. We can extract endpoints dynamically or save them.
    // Saving them allows for individual enrichment.

    const paths = (parsedSpec as any).paths || {};
    const validations = [];

    for (const [path, methods] of Object.entries(paths)) {
        for (const [method, details] of Object.entries(methods as any)) {
            if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                // Create enrichment entry if not exists
                validations.push(prisma.endpointEnrichment.upsert({
                    where: {
                        projectId_method_path: {
                            projectId,
                            method: method.toUpperCase(),
                            path
                        }
                    },
                    update: {}, // Don't overwrite existing enrichments
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

    await prisma.$transaction(validations)

    revalidatePath(`/projects/${projectId}`)
    return { message: "Success" }
}
