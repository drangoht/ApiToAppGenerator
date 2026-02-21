import { prisma } from "@/lib/prisma"
import OpenAI from "openai"
import fs from "fs/promises"
import path from "path"

export class GeneratorService {
    private openai: OpenAI;
    private projectId: string;
    private model: string;

    constructor(projectId: string, apiKey?: string, model: string = "gpt-4-turbo") {
        this.projectId = projectId;
        this.model = model;

        let baseURL = undefined;
        if (this.model.startsWith("openrouter/")) {
            baseURL = "https://openrouter.ai/api/v1";
            this.model = this.model.replace("openrouter/", "");
        }

        this.openai = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
            baseURL: baseURL,
        });
    }

    async generate() {
        const project = await prisma.project.findUnique({
            where: { id: this.projectId },
            include: { enrichments: true }
        });

        if (!project || !project.openApiSpec) {
            throw new Error("Project or OpenAPI spec not found");
        }

        const spec = JSON.parse(project.openApiSpec);
        const enrichments = project.enrichments;

        // Construct the prompt
        const systemPrompt = `You are an expert Full Stack Developer specializing in Next.js (App Router), TypeScript, Tailwind CSS, and Shadcn UI.
        Your task is to generate a complete, deployable web application based on the provided OpenAPI Specification.
        
        Technical Stack:
        - Network: Fetch / Axios (Generated client)
        - Framework: Next.js 14+ (App Router)
        - UI: Tailwind CSS + Shadcn UI (Lucide React for icons)
        - Language: TypeScript
        - State Management: React Context or Zustand if complex.

        CRITICAL Output Requirements:
        1. You MUST generate the full source code for the application. DO NOT use placeholders like "// implement here".
        2. You MUST explicitly generate EVERY SINGLE FILE that you import. If you import '@/store/use-cat-store', you MUST provide the code for 'src/store/use-cat-store.ts'. Hallucinated imports will break the build.
        3. You MUST provide a 'package.json' file including all third-party dependencies you used (e.g. zustand, axios, lucide-react).
        4. DO NOT generate 'next.config.ts', as it crashes older Next.js versions. If you need a config, generate 'next.config.mjs'.
        5. Shadcn UI REQUIRES 'src/lib/utils.ts' with the 'cn' function. You MUST generate 'src/lib/utils.ts'.
        6. Wrap each file in a special block exactly like this:
        
        <<<FILE:path/to/file>>>
        [file content]
        <<<END>>>

        Example:
        <<<FILE:src/app/page.tsx>>>
        export default function Home() { return <div>Hello</div> }
        <<<END>>>
        
        Focus on creating a clean, modern, functional UI that connects to the described API endpoints.
        `;

        // Extract endpoints from spec to explicitly highlight their descriptions
        let endpointSummaries = "";
        const paths = spec.paths || {};
        for (const [pathUrl, methods] of Object.entries(paths)) {
            for (const [method, details] of Object.entries(methods as any)) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
                    const desc = (details as any).description || (details as any).summary || "";
                    if (desc) {
                        endpointSummaries += `- ${method.toUpperCase()} ${pathUrl}: ${desc}\n`;
                    }
                }
            }
        }

        const userPrompt = `
        Here is the OpenAPI Specification for the application:
        ${JSON.stringify(spec, null, 2)}
        
        Endpoint Descriptions (Pay close attention to these for business logic):
        ${endpointSummaries}

        Specific Instructions/User Enrichments:
        ${enrichments.map(e => `- ${e.method} ${e.path}: ${e.instruction} (${e.description})`).join('\n')}

        Please generate the application code now. Start with the API client/service layer, then components, then pages.
        `;

        // Call LLM
        // Note: For a real app, we might need to use streaming or a more sophisticated chain (e.g. iterate per endpoint).
        // For this V1, we'll try to generate a working MVP in one go or limited scope.
        // A single context window might be small for a huge app, but for a demo it's fine.

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.2, // Low temp for code
            });

            const generatedText = completion.choices[0].message.content || "";
            await this.writeFiles(generatedText);

            return { success: true, message: "Generation complete" };

        } catch (error) {
            console.error("LLM Generation Error:", error);
            throw error;
        }
    }

    private async writeFiles(text: string) {
        const fileRegex = /<<<FILE:(.*?)>>>([\s\S]*?)<<<END>>>/g;
        let match;
        const projectDir = path.join(process.cwd(), 'projects', this.projectId, 'generated');

        // Ensure directory exists
        await fs.mkdir(projectDir, { recursive: true });

        while ((match = fileRegex.exec(text)) !== null) {
            let filePath = match[1].trim();
            const content = match[2].trim();

            // Auto-correct bad LLM config names
            if (filePath === 'next.config.ts') filePath = 'next.config.mjs';

            const fullPath = path.join(projectDir, filePath);

            // Ensure subdir exists
            await fs.mkdir(path.dirname(fullPath), { recursive: true });

            await fs.writeFile(fullPath, content);
            console.log(`Wrote file: ${filePath}`);
        }

        // Prevent directory traversal bug where generated Next 14 app looks for parent ApiToAppGenerator next.config.ts
        try {
            await fs.access(path.join(projectDir, 'next.config.mjs'));
        } catch {
            try {
                await fs.access(path.join(projectDir, 'next.config.js'));
            } catch {
                // If neither exists, write a default to stop upward directory traversal
                const defaultNextConfig = `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;`;
                await fs.writeFile(path.join(projectDir, 'next.config.mjs'), defaultNextConfig);
            }
        }

        // Ensure tsconfig.json has path aliases for @/* imports
        try {
            const tsconfigPath = path.join(projectDir, 'tsconfig.json');
            let tsconfigStr = "{}";
            try { tsconfigStr = await fs.readFile(tsconfigPath, 'utf8'); } catch { }

            let tsconfig = JSON.parse(tsconfigStr || "{}");
            if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};

            tsconfig.compilerOptions.baseUrl = ".";
            tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};
            if (!tsconfig.compilerOptions.paths["@/*"]) {
                tsconfig.compilerOptions.paths["@/*"] = ["./src/*"];
            }

            await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
        } catch (e) {
            console.error("Failed to ensure tsconfig.json paths", e);
        }
    }
}
