import { prisma } from "@/lib/prisma"
import OpenAI from "openai"
import fs from "fs/promises"
import path from "path"

export class GeneratorService {
    private openai: OpenAI;
    private projectId: string;

    constructor(projectId: string, apiKey?: string) {
        this.projectId = projectId;
        this.openai = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
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

        Output Requirements:
        - You must generate the full source code for the application.
        - You must wrap each file in a special block:
        <<<FILE:path/to/file>>>
        [file content]
        <<<END>>>

        - Example:
        <<<FILE:src/app/page.tsx>>>
        export default function Home() { return <div>Hello</div> }
        <<<END>>>
        
        - Do not omit any files. Include package.json (if needed to add specific deps), standard Next.js structure, components, and API integration logic.
        - Focus on creating a clean, modern, and functional UI.
        `;

        const userPrompt = `
        Here is the OpenAPI Specification for the application:
        ${JSON.stringify(spec, null, 2)}

        Specific Instructions/Enrichments:
        ${enrichments.map(e => `- ${e.method} ${e.path}: ${e.instruction} (${e.description})`).join('\n')}

        Please generate the application code now. Start with the API client/service layer, then components, then pages.
        `;

        // Call LLM
        // Note: For a real app, we might need to use streaming or a more sophisticated chain (e.g. iterate per endpoint).
        // For this V1, we'll try to generate a working MVP in one go or limited scope.
        // A single context window might be small for a huge app, but for a demo it's fine.

        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4-turbo", // Default or from project config
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
            const filePath = match[1].trim();
            const content = match[2].trim();
            const fullPath = path.join(projectDir, filePath);

            // Ensure subdir exists
            await fs.mkdir(path.dirname(fullPath), { recursive: true });

            await fs.writeFile(fullPath, content);
            console.log(`Wrote file: ${filePath}`);
        }
    }
}
