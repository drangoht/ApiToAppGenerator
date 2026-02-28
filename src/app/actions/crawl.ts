'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { parseOpenApiSpec } from "@/lib/openapi-parser"
import * as cheerio from "cheerio"
import OpenAI from "openai"

export async function crawlApiDocumentation(projectId: string, url: string, customLlm?: { model?: string; apiKey?: string }) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    if (!url || !url.startsWith("http")) {
        return { message: "Invalid URL provided" }
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

    try {
        // Fetch HTML content from the URL
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Apivolt/1.0',
            },
            signal: AbortSignal.timeout(15000), // 15-second timeout
        });

        if (!response.ok) {
            return { message: `Failed to fetch URL: ${response.status} ${response.statusText}` }
        }

        const html = await response.text()

        // Parse HTML and extract text
        const $ = cheerio.load(html)
        // Remove scripts, styles, and other non-content data
        $('script, style, noscript, iframe, link, meta, nav, footer, header').remove()

        // Extract visible text, normalize whitespace
        const textContent = $('body').text().replace(/\s+/g, ' ').trim()

        if (!textContent || textContent.length < 50) {
            return { message: "Could not extract sufficient meaningful text from the provided URL" }
        }

        // Limit the text to avoid token limits (e.g. max ~40k characters)
        const truncatedText = textContent.substring(0, 40000)

        // Initialize OpenAI
        // Hierarchy: Custom Form Input -> Project Database Config -> System process.env
        let model = customLlm?.model || "gpt-4o"
        let apiKey = customLlm?.apiKey || process.env.OPENAI_API_KEY
        let baseURL = undefined

        // Setup OpenRouter base URL if the model is from OpenRouter
        if (model.startsWith("openrouter/")) {
            baseURL = "https://openrouter.ai/api/v1"
        }

        // If no custom key was provided inline, check the project config
        if (!customLlm?.apiKey && project.llmConfig) {
            try {
                const config = JSON.parse(project.llmConfig)
                // Only inherit if the user hasn't explicitly overridden the model in the form, 
                // OR if the form model happens to match the project's saved provider logic
                if (config.apiKey) {
                    apiKey = config.apiKey
                }
            } catch (e) { }
        }

        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
            timeout: 60000,
        });

        // Prompt LLM to extract OpenAPI spec
        const systemPrompt = `You are an expert API Analyst. I will provide you with the extracted text from a documentation webpage.
Your job is to read the text and produce a valid JSON OpenAPI 3.0.0 specification describing the API endpoints found in the text.
Output ONLY the raw JSON valid OpenAPI 3.0 Object, and nothing else (no markdown blocks, no conversational text). Focus heavily on the endpoints, methods, parameters, and responses.`;

        const userPrompt = `URL crawled: ${url}
Extracted Text Content: 
${truncatedText}

Generate the JSON OpenAPI Spec now:`

        const completion = await openai.chat.completions.create({
            model: model.replace("openrouter/", ""), // Just in case openrouter/ prefix is passed directly
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const generatedJsonString = completion.choices[0].message.content || "{}"
        const generatedSpec = JSON.parse(generatedJsonString)

        // Validate using existing parser
        const parsedSpec = await parseOpenApiSpec(generatedSpec);

        // Save the spec to the project
        await prisma.project.update({
            where: { id: projectId },
            data: {
                openApiSpec: JSON.stringify(parsedSpec),
                status: 'SPEC_UPLOADED'
            }
        })

        // Generate Endpoint Enrichments
        const paths = (parsedSpec as any).paths || {};
        const validations = [];

        for (const [path, methods] of Object.entries(paths)) {
            for (const [method, details] of Object.entries(methods as any)) {
                if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                    validations.push(prisma.endpointEnrichment.upsert({
                        where: {
                            projectId_method_path: {
                                projectId,
                                method: method.toUpperCase(),
                                path
                            }
                        },
                        update: {}, // Don't overwrite existing
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

    } catch (error: any) {
        console.error("Crawl error:", error)
        return { message: error.message || "An error occurred while crawling or generating the spec." }
    }
}
