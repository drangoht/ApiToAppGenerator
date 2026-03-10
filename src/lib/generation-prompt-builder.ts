import { minifyOpenApiSpec } from "@/lib/openapi-minifier";

interface EnrichmentLike {
  method: string;
  path: string;
  instruction: string | null;
  description: string | null;
}

interface ProjectLike {
  id: string;
  name: string | null;
  description: string | null;
  openApiSpec: string;
  targetApiConfig: string | null;
  enrichments: EnrichmentLike[];
}

export interface GenerationPrompts {
  systemPrompt: string;
  userPrompt: string;
}

export function buildGenerationPrompts(
  project: ProjectLike,
  spec: any
): GenerationPrompts {
  const enrichments = project.enrichments ?? [];

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
      if (["get", "post", "put", "delete", "patch"].includes(method.toLowerCase())) {
        const desc = (details as any).description || (details as any).summary || "";
        if (desc) {
          endpointSummaries += `- ${method.toUpperCase()} ${pathUrl}: ${desc}\n`;
        }
      }
    }
  }

  const envKeys = project.targetApiConfig
    ? Object.keys(JSON.parse(project.targetApiConfig))
    : [];
  const envHint =
    envKeys.length > 0
      ? `\nAvailable Environment Variables (use these for authentication):\n${envKeys
          .map((k) => `- process.env.${k}`)
          .join("\n")}\n`
      : "";

  const appTitle = (spec as any)?.info?.title || project.name || "App";
  const appDescription =
    (spec as any)?.info?.description || project.description || "";

  // Fallback safety: If string is still absurdly huge, hard truncate endpoint summaries
  let finalSpecString = JSON.stringify(minifyOpenApiSpec(spec));
  if (finalSpecString.length > 300000) {
    // eslint-disable-next-line no-console
    console.log(
      "Spec still too large after minification. Hard truncating components..."
    );
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
        ${
          enrichments.length > 0
            ? enrichments
                .map(
                  (e) =>
                    `- ${e.method} ${e.path}: ${e.instruction} (${e.description})`
                )
                .join("\n")
            : "None"
        }

        Please generate the application code now. Start with the API client/service layer, then components, then pages.
        Make sure the UI reflects the Project Goal and API Description.
        `;

  return {
    systemPrompt,
    userPrompt,
  };
}

