'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { parseOpenApiSpec } from "@/lib/openapi-parser"
import * as cheerio from "cheerio"
import OpenAI from "openai"

const CRAWL_MAX_PAGES = 20         // Maximum pages to crawl
const CRAWL_MAX_CHARS = 80000      // Max total characters to send to LLM
const CRAWL_PAGE_TIMEOUT_MS = 10000 // 10-second timeout per page fetch

/**
 * Fetches a single page and returns:
 * - `text`: main visible text content (scripts/style stripped)
 * - `links`: same-origin href links found on the page
 */
async function fetchPage(url: string, baseOrigin: string): Promise<{ text: string; links: string[] }> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Apivolt/1.0 Crawler)',
        },
        signal: AbortSignal.timeout(CRAWL_PAGE_TIMEOUT_MS),
    })

    if (!response.ok) return { text: '', links: [] }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return { text: '', links: [] }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract all same-origin links before stripping tags
    const links: string[] = []
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        try {
            const resolved = new URL(href, url)
            // Only follow links from the same origin and without external anchors
            if (resolved.origin === baseOrigin && !resolved.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|pdf|zip)$/i)) {
                // Drop fragments from the link so we don't revisit same page
                resolved.hash = ''
                links.push(resolved.toString())
            }
        } catch { /* relative link resolution failed, skip */ }
    })

    // Remove noise before extracting text
    $('script, style, noscript, iframe, link, meta, nav, footer, header').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim()

    return { text, links: [...new Set(links)] }
}

export async function crawlApiDocumentation(projectId: string, url: string, customLlm?: { model?: string; apiKey?: string }) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    if (!url || !url.startsWith("http")) {
        return { message: "Invalid URL provided" }
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    const project = await prisma.project.findUnique({ where: { id: projectId } })
    if (!project || project.ownerId !== user.id) {
        return { message: "Project not found or unauthorized" }
    }

    try {
        const baseOrigin = new URL(url).origin
        const basePath = new URL(url).pathname

        // BFS crawl — stays within the same origin and under the starting path
        const visited = new Set<string>()
        const queue: string[] = [url]
        const allTextParts: string[] = []
        let pagesVisited = 0

        while (queue.length > 0 && pagesVisited < CRAWL_MAX_PAGES) {
            const current = queue.shift()!
            if (visited.has(current)) continue
            visited.add(current)

            let pageData: { text: string; links: string[] }
            try {
                pageData = await fetchPage(current, baseOrigin)
            } catch {
                continue // skip pages that time out or fail
            }

            if (pageData.text.length > 30) {
                // Tag each page so the LLM knows which URL this content came from
                allTextParts.push(`\n\n--- Page: ${current} ---\n${pageData.text}`)
                pagesVisited++
            }

            // Enqueue new links – only follow links that are under the doc root path
            for (const link of pageData.links) {
                if (!visited.has(link) && !queue.includes(link)) {
                    try {
                        const linkPath = new URL(link).pathname
                        // Only follow links that are under the base path of the root URL
                        if (linkPath.startsWith(basePath) || basePath === '/' || basePath === '') {
                            queue.push(link)
                        }
                    } catch { /* skip bad URLs */ }
                }
            }
        }

        if (allTextParts.length === 0) {
            return { message: "Could not extract sufficient content from the provided URL." }
        }

        // Combine and truncate all pages to fit into LLM context
        const combinedText = allTextParts.join('').substring(0, CRAWL_MAX_CHARS)

        // Initialize OpenAI client
        // Hierarchy: Inline Form -> Project DB Config -> System process.env
        let model = customLlm?.model || "gpt-4o"
        let apiKey = customLlm?.apiKey || process.env.OPENAI_API_KEY
        let baseURL: string | undefined = undefined

        if (model.startsWith("openrouter/")) {
            baseURL = "https://openrouter.ai/api/v1"
            if (!customLlm?.apiKey) {
                apiKey = process.env.OPENROUTER_API_KEY || apiKey
            }
        }

        if (!customLlm?.apiKey && project.llmConfig) {
            try {
                const config = JSON.parse(project.llmConfig)
                if (config.apiKey) apiKey = config.apiKey
            } catch { }
        }

        const openai = new OpenAI({ apiKey, baseURL, timeout: 120000 })

        const systemPrompt = `You are an expert API Analyst. I will provide you with the extracted text from multiple pages of an API documentation website.
Your job is to read the combined content and produce a single, comprehensive, valid JSON OpenAPI 3.0.0 specification describing ALL the API endpoints found across the documentation.
Merge all endpoint definitions into a single "paths" object.
Output ONLY the raw JSON valid OpenAPI 3.0 Object, and nothing else (no markdown blocks, no conversational text).`

        const userPrompt = `Root documentation URL: ${url}
Pages crawled: ${pagesVisited}

Combined content from all pages:
${combinedText}

Generate the consolidated JSON OpenAPI Spec now:`

        const completion = await openai.chat.completions.create({
            model: model.replace("openrouter/", ""),
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })

        const generatedJsonString = completion.choices[0].message.content || "{}"
        const generatedSpec = JSON.parse(generatedJsonString)

        const parsedSpec = await parseOpenApiSpec(generatedSpec)

        await prisma.project.update({
            where: { id: projectId },
            data: {
                openApiSpec: JSON.stringify(parsedSpec),
                status: 'SPEC_UPLOADED'
            }
        })

        const paths = (parsedSpec as any).paths || {}
        const validations = []

        for (const [path, methods] of Object.entries(paths)) {
            for (const [method, details] of Object.entries(methods as any)) {
                if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                    validations.push(prisma.endpointEnrichment.upsert({
                        where: { projectId_method_path: { projectId, method: method.toUpperCase(), path } },
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

        await prisma.$transaction(validations)

        revalidatePath(`/projects/${projectId}`)
        return { message: `Success — crawled ${pagesVisited} page(s)` }

    } catch (error: any) {
        console.error("Crawl error:", error)
        return { message: error.message || "An error occurred while crawling or generating the spec." }
    }
}
