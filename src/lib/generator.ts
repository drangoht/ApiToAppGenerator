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
            timeout: 240_000, // 4-minute explicit timeout
        });
    }

    private minifyOpenApiSpec(spec: any): any {
        const minified = JSON.parse(JSON.stringify(spec));

        delete minified.tags;
        delete minified.externalDocs;

        if (minified.paths) {
            for (const pathKey of Object.keys(minified.paths)) {
                for (const method of Object.keys(minified.paths[pathKey])) {
                    if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
                        delete minified.paths[pathKey][method];
                        continue;
                    }
                    const endpoint = minified.paths[pathKey][method];
                    delete endpoint.tags;
                    delete endpoint.summary; // Extracted separately
                    delete endpoint.description; // Extracted separately
                    delete endpoint.operationId;
                    delete endpoint.externalDocs;

                    if (endpoint.parameters) {
                        for (const param of endpoint.parameters) {
                            delete param.description;
                            delete param.example;
                            delete param.examples;
                        }
                    }

                    if (endpoint.responses) {
                        for (const resKey of Object.keys(endpoint.responses)) {
                            const res = endpoint.responses[resKey];
                            delete res.description;
                            if (res.content) {
                                for (const mediaType of Object.keys(res.content)) {
                                    delete res.content[mediaType].example;
                                    delete res.content[mediaType].examples;
                                }
                            }
                        }
                    }

                    if (endpoint.requestBody && endpoint.requestBody.content) {
                        delete endpoint.requestBody.description;
                        for (const mediaType of Object.keys(endpoint.requestBody.content)) {
                            delete endpoint.requestBody.content[mediaType].example;
                            delete endpoint.requestBody.content[mediaType].examples;
                        }
                    }
                }
            }
        }

        if (minified.components && minified.components.schemas) {
            const cleanSchema = (schema: any) => {
                if (!schema || typeof schema !== 'object') return;
                delete schema.description;
                delete schema.example;
                delete schema.examples;
                delete schema.default;

                if (schema.properties) {
                    for (const prop of Object.keys(schema.properties)) {
                        cleanSchema(schema.properties[prop]);
                    }
                }
                if (schema.items) cleanSchema(schema.items);
                if (schema.allOf) schema.allOf.forEach(cleanSchema);
                if (schema.anyOf) schema.anyOf.forEach(cleanSchema);
                if (schema.oneOf) schema.oneOf.forEach(cleanSchema);
            };

            for (const schemaKey of Object.keys(minified.components.schemas)) {
                cleanSchema(minified.components.schemas[schemaKey]);
            }
        }

        return minified;
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
        2. You MUST explicitly generate EVERY SINGLE FILE that you import.
        3. You MUST provide a 'package.json' file including all third-party dependencies you used.
        4. You MUST generate 'next.config.mjs' with 'export default { typescript: { ignoreBuildErrors: true, tsconfigPath: "tsconfig.json" }, eslint: { ignoreDuringBuilds: true } };'
        5. You MUST generate 'tailwind.config.ts' and 'postcss.config.mjs' correctly exported to prevent CSS bundler crashes.
        6. You MUST generate a valid 'tsconfig.json' with proper paths ('@/*': ['./src/*']).
        7. You MUST generate 'src/app/layout.tsx' and 'src/app/page.tsx'. Without a root layout, the Next.js dev server will crash with ERR_INVALID_ARG_TYPE.
        8. Shadcn UI REQUIRES 'src/lib/utils.ts' with the 'cn' function. You MUST generate 'src/lib/utils.ts'.
        9. APP ROUTER STRICT RULE: ALL files inside 'src/app/' OR any file using React Hooks MUST have "use client"; on the very first line of the file (unless it is explicitly a server component).
        10. ENV VAR RULE: You MUST strictly use bracket notation for environment variables with hyphens like process.env['x-api-key']. Using dot notation (process.env.x-api-key) will cause a JavaScript math subtraction crash!
        11. IMAGE RULE: DO NOT use 'next/image' for external images. Use standard HTML <img> tags.
        12. PROTOCOL RULE: NEVER use 'http://' for external API base URLs. You MUST ALWAYS use 'https://' to prevent CORS and mixed-content blocking errors in the deployed application.
        13. Wrap each file in a special block exactly like this:
        
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

        const envKeys = project.targetApiConfig ? Object.keys(JSON.parse(project.targetApiConfig)) : [];
        const envHint = envKeys.length > 0
            ? `\nAvailable Environment Variables (use these for authentication):\n${envKeys.map(k => `- process.env.${k}`).join('\n')}\n`
            : "";

        const appTitle = spec?.info?.title || project.name || "App";
        const appDescription = spec?.info?.description || project.description || "";

        // Fallback safety: If string is still absurdly huge, hard truncate endpoint summaries
        let finalSpecString = JSON.stringify(this.minifyOpenApiSpec(spec));
        if (finalSpecString.length > 300000) {
            console.log("Spec still too large after minification. Hard truncating components...");
            const superMinified = JSON.parse(finalSpecString);
            if (superMinified.components) delete superMinified.components;
            finalSpecString = JSON.stringify(superMinified);
        }

        const userPrompt = `
        You are building an application named: ${appTitle}
        Project Goal/Description: ${project.description || "Not provided"}
        API General Description: ${appDescription || "Not provided"}

        Here is the OpenAPI Specification for the application:
        ${finalSpecString.substring(0, 400000)} // Hardcap to ~100k tokens max
        
        Endpoint Descriptions (Pay close attention to these for business logic):
        ${endpointSummaries.substring(0, 20000)} // Hardcap descriptions
        ${envHint}
        Specific Instructions/User Enrichments:
        ${enrichments.length > 0 ? enrichments.map(e => `- ${e.method} ${e.path}: ${e.instruction} (${e.description})`).join('\n') : "None"}

        Please generate the application code now. Start with the API client/service layer, then components, then pages.
        Make sure the UI reflects the Project Goal and API Description.
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
            await this.writeFiles(generatedText, project);

            return { success: true, message: "Generation complete" };

        } catch (error) {
            console.error("LLM Generation Error:", error);
            throw error;
        }
    }

    private async writeFiles(text: string, project?: any) {
        const projectDir = path.join(process.cwd(), 'projects', this.projectId, 'generated');
        await fs.mkdir(projectDir, { recursive: true });

        try {
            // Aggressively clear out old source code to prevent ghost files from previous generations
            await fs.rm(path.join(projectDir, 'src'), { recursive: true, force: true });
            await fs.rm(path.join(projectDir, 'components'), { recursive: true, force: true });
            await fs.rm(path.join(projectDir, 'app'), { recursive: true, force: true });
        } catch (e) {
            // Missing directories are fine
        }

        const fileRegex = /<<<FILE:(.*?)>>>([\s\S]*?)<<<END>>>/g;
        // Save raw LLM output for debugging
        await fs.writeFile(path.join(projectDir, 'llm-output.txt'), text);

        let match;
        let filesWritten = 0;
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
            filesWritten++;
        }

        // Force a guaranteed-safe Next.js config. LLMs routinely hallucinate invalid next.config.js or mjs files
        // (e.g. putting CommonJS module.exports into an ES Module .mjs file, which crashes Node instantly).
        try {
            await fs.rm(path.join(projectDir, 'next.config.js'), { force: true });
        } catch (e) { }
        try {
            await fs.rm(path.join(projectDir, 'next.config.ts'), { force: true });
        } catch (e) { }

        // Enforce App Router: Next.js crashes if BOTH 'app' and 'pages' directories exist.
        // LLMs frequently hallucinate both. We explicitly delete the Pages router.
        try {
            await fs.rm(path.join(projectDir, 'src', 'pages'), { recursive: true, force: true });
        } catch (e) { }
        try {
            await fs.rm(path.join(projectDir, 'pages'), { recursive: true, force: true });
        } catch (e) { }

        const defaultNextConfig = `/** @type {import('next').NextConfig} */\nconst nextConfig = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } };\nexport default nextConfig;`;
        await fs.writeFile(path.join(projectDir, 'next.config.mjs'), defaultNextConfig);

        // Force inject common dependencies that the LLM often uses but forgets to include in package.json
        try {
            const packageJsonPath = path.join(projectDir, 'package.json');
            let pkgStr = "{}";
            try { pkgStr = await fs.readFile(packageJsonPath, 'utf8'); } catch { }
            let pkg = JSON.parse(pkgStr || "{}");

            if (!pkg.dependencies) pkg.dependencies = {};
            if (!pkg.devDependencies) pkg.devDependencies = {};

            // Remove hallucinatory invalid packages that break npm install
            const invalidPackages = ["shadcn/ui", "shadcn", "@shadcn/ui"];
            for (const invalidPkg of invalidPackages) {
                delete pkg.dependencies[invalidPkg];
                delete pkg.devDependencies[invalidPkg];
            }

            // Force override core Next.js 14 / React 18 dependencies.
            // If the LLM generates Next.js 12 (pre-App Router), the preview will completely crash.
            const forceDeps: Record<string, string> = {
                "next": "^14.2.0",
                "react": "^18.2.0",
                "react-dom": "^18.2.0",
                "axios": "^1.6.0",
                "zustand": "^4.4.0",
                "lucide-react": "^0.292.0",
                "clsx": "^2.0.0",
                "tailwind-merge": "^2.0.0",
                "date-fns": "^3.0.0",
                "@radix-ui/react-icons": "^1.3.0",
                "@radix-ui/react-slot": "^1.0.0"
            };

            const forceDevDeps: Record<string, string> = {
                "typescript": "^5.0.0",
                "@types/node": "^20.0.0",
                "@types/react": "^18.2.0",
                "@types/react-dom": "^18.2.0",
                "postcss": "^8.4.0",
                "tailwindcss": "^3.4.0"
            };

            for (const [dep, version] of Object.entries(forceDeps)) {
                pkg.dependencies[dep] = version; // Actively overwrite bad versions
            }
            for (const [dep, version] of Object.entries(forceDevDeps)) {
                pkg.devDependencies[dep] = version;
            }

            await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
        } catch (e) {
            console.error("Failed to inject common dependencies", e);
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

        // Inject target API keys
        if (project && project.targetApiConfig) {
            try {
                const configObj = JSON.parse(project.targetApiConfig);
                let envContent = "";
                for (const [key, value] of Object.entries(configObj)) {
                    envContent += `${key}="${value}"\n`;
                }
                if (envContent) {
                    await fs.writeFile(path.join(projectDir, '.env.local'), envContent);
                    console.log(`Injected .env.local into generated project.`);
                }
            } catch (e) {
                console.error("Failed to inject target API configuration", e);
            }
        }
    }
}
