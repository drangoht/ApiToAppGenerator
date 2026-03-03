'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { parseOpenApiSpec } from "@/lib/openapi-parser"
import { createLlmClient, resolveLlmConfig } from "@/lib/llm-client"
import * as cheerio from "cheerio"

const CRAWL_MAX_PAGES = 20
const CRAWL_MAX_CHARS = 80000
const CRAWL_PAGE_TIMEOUT_MS = 10000

/**
 * Fetches a single page and returns:
 * - `text`: main visible text content (scripts/style stripped)
 * - `links`: same-origin href links found on the page
 */
async function fetchPage(url: string, baseOrigin: string): Promise<{ text: string; links: string[] }> {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Apivolt/1.0 Crawler)' },
        signal: AbortSignal.timeout(CRAWL_PAGE_TIMEOUT_MS),
    })

    if (!response.ok) return { text: '', links: [] }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) return { text: '', links: [] }

    const html = await response.text()
    const $ = cheerio.load(html)

    const links: string[] = []
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        try {
            const resolved = new URL(href, url)
            if (
                resolved.origin === baseOrigin &&
                !resolved.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|pdf|zip)$/i)
            ) {
                resolved.hash = ''
                links.push(resolved.toString())
            }
        } catch { /* skip unresolvable hrefs */ }
    })

    $('script, style, noscript, iframe, link, meta, nav, footer, header').remove()
    const text = $('body').text().replace(/\s+/g, ' ').trim()

    return { text, links: [...new Set(links)] }
}

export async function crawlApiDocumentation(
    projectId: string,
    url: string,
    inline?: { model?: string; apiKey?: string }
) {
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
        // ── BFS crawl ──────────────────────────────────────────────────────────
        const baseOrigin = new URL(url).origin
        const basePath = new URL(url).pathname

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
                continue
            }

            if (pageData.text.length > 30) {
                allTextParts.push(`\n\n--- Page: ${current} ---\n${pageData.text}`)
                pagesVisited++
            }

            for (const link of pageData.links) {
                if (!visited.has(link) && !queue.includes(link)) {
                    try {
                        const linkPath = new URL(link).pathname
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

        const combinedText = allTextParts.join('').substring(0, CRAWL_MAX_CHARS)

        // ── LLM client (via factory) ───────────────────────────────────────────
        // Priority: inline form input > project DB config > env vars
        const llmConfig = resolveLlmConfig(project.llmConfig, inline)
        const { client, model } = createLlmClient(llmConfig, 120_000)

        const systemPrompt = `You are an expert API Analyst. I will provide you with the extracted text from multiple pages of an API documentation website.
Your job is to read the combined content and produce a single, comprehensive, valid JSON OpenAPI 3.0.0 specification describing ALL the API endpoints found across the documentation.
Merge all endpoint definitions into a single "paths" object.
Output ONLY the raw JSON valid OpenAPI 3.0 Object, and nothing else (no markdown blocks, no conversational text).`

        const userPrompt = `Root documentation URL: ${url}
Pages crawled: ${pagesVisited}

Combined content from all pages:
${combinedText}

Generate the consolidated JSON OpenAPI Spec now:`

        const completion = await client.chat.completions.create({
            model,
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
            data: { openApiSpec: JSON.stringify(parsedSpec), status: 'SPEC_UPLOADED' }
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
