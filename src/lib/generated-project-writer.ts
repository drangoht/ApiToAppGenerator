import fs from "fs/promises";
import path from "path";

interface GeneratedProjectWriterOptions {
  projectId: string;
  baseDir?: string; // defaults to process.cwd(); injectable for tests
}

interface ProjectLikeForEnv {
  targetApiConfig?: string | null;
}

export class GeneratedProjectWriter {
  private readonly projectId: string;
  private readonly baseDir: string;

  constructor(options: GeneratedProjectWriterOptions) {
    this.projectId = options.projectId;
    this.baseDir = options.baseDir ?? process.cwd();
  }

  private get projectDir(): string {
    return path.join(this.baseDir, "projects", this.projectId, "generated");
  }

  async writeFromLlmOutput(text: string, project?: ProjectLikeForEnv) {
    await fs.mkdir(this.projectDir, { recursive: true });

    await this.clearOldSource();
    await this.parseAndWriteFiles(text);
    await this.enforceNextjsConfig();
    await this.enforceAppRouter();
    await this.normalizePackageJson();
    await this.ensureTsconfig();
    if (project) await this.injectEnvLocal(project);
  }

  private async clearOldSource() {
    // Each directory is cleared independently so a failure on one does not
    // prevent the others from being cleaned (force:true already suppresses ENOENT).
    await fs.rm(path.join(this.projectDir, "src"), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(this.projectDir, "components"), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(this.projectDir, "app"), { recursive: true, force: true }).catch(() => {});
  }

  private async parseAndWriteFiles(text: string) {
    // Save raw LLM output for debugging
    await fs.writeFile(path.join(this.projectDir, "llm-output.txt"), text);

    const fileRegex = /<<<FILE:(.*?)>>>([\s\S]*?)<<<END>>>/g;
    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      let filePath = match[1].trim();
      const content = match[2].trim();

      // Auto-correct bad LLM config names
      if (filePath === "next.config.ts") filePath = "next.config.mjs";

      const fullPath = path.join(this.projectDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
      // eslint-disable-next-line no-console
      console.log(`Wrote file: ${filePath}`);
    }
  }

  private async enforceNextjsConfig() {
    // Remove any variant the LLM might have generated to avoid ambiguity
    await fs.rm(path.join(this.projectDir, "next.config.js"), { force: true }).catch(() => {});
    await fs.rm(path.join(this.projectDir, "next.config.ts"), { force: true }).catch(() => {});

    // LLMs routinely hallucinate invalid configs (e.g. CommonJS in .mjs); always overwrite
    const safeConfig =
      "/** @type {import('next').NextConfig} */\n" +
      "const nextConfig = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } };\n" +
      "export default nextConfig;";
    await fs.writeFile(path.join(this.projectDir, "next.config.mjs"), safeConfig);
  }

  private async enforceAppRouter() {
    // LLMs frequently generate both app/ and pages/; Next.js crashes when both exist
    await fs.rm(path.join(this.projectDir, "src", "pages"), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(this.projectDir, "pages"), { recursive: true, force: true }).catch(() => {});
  }

  private async normalizePackageJson() {
    const packageJsonPath = path.join(this.projectDir, "package.json");

    let pkg: any = {};
    try {
      pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    } catch { /* start from scratch if missing or corrupt */ }

    if (!pkg.dependencies) pkg.dependencies = {};
    if (!pkg.devDependencies) pkg.devDependencies = {};
    if (!pkg.scripts) pkg.scripts = {};

    // Remove hallucinatory invalid package names that break npm install
    for (const invalid of ["shadcn/ui", "shadcn", "@shadcn/ui"]) {
      delete pkg.dependencies[invalid];
      delete pkg.devDependencies[invalid];
    }

    // Strip --turbo / --turbopack from the dev script (Turbopack crashes in Docker)
    pkg.scripts.dev = "next dev";
    pkg.scripts.build = "next build";
    pkg.scripts.start = "next start";

    // Pin to Next 14 + React 18 — prevents npm from installing Next 15/16 which defaults to Turbopack
    const forceDeps: Record<string, string> = {
      next: "14.2.35",
      react: "18.2.0",
      "react-dom": "18.2.0",
      axios: "^1.6.0",
      zustand: "^4.4.0",
      "lucide-react": "^0.292.0",
      clsx: "^2.0.0",
      "tailwind-merge": "^2.0.0",
      "date-fns": "^3.0.0",
      "@radix-ui/react-icons": "^1.3.0",
      "@radix-ui/react-slot": "^1.0.0",
    };

    const forceDevDeps: Record<string, string> = {
      typescript: "^5.0.0",
      "@types/node": "^20.0.0",
      // Pin to React 18 types — @types/react@latest installs React 19 types that break Next 14
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      postcss: "^8.4.31",
      tailwindcss: "^3.4.0",
      autoprefixer: "^10.4.19",
      eslint: "^8.0.0",
      "eslint-config-next": "14.2.35",
    };

    for (const [dep, version] of Object.entries(forceDeps)) {
      pkg.dependencies[dep] = version;
    }
    for (const [dep, version] of Object.entries(forceDevDeps)) {
      pkg.devDependencies[dep] = version;
    }

    await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
  }

  private async ensureTsconfig() {
    const tsconfigPath = path.join(this.projectDir, "tsconfig.json");

    let tsconfig: any = {};
    try {
      tsconfig = JSON.parse(await fs.readFile(tsconfigPath, "utf8"));
    } catch { /* create from scratch */ }

    if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
    tsconfig.compilerOptions.baseUrl = ".";
    tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};
    if (!tsconfig.compilerOptions.paths["@/*"]) {
      tsconfig.compilerOptions.paths["@/*"] = ["./src/*"];
    }

    await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
  }

  private async injectEnvLocal(project: ProjectLikeForEnv) {
    if (!project.targetApiConfig) return;
    try {
      const configObj = JSON.parse(project.targetApiConfig);
      const envContent = Object.entries(configObj)
        .map(([key, value]) => `${key}="${value}"`)
        .join("\n") + "\n";
      if (envContent.trim()) {
        await fs.writeFile(path.join(this.projectDir, ".env.local"), envContent);
        // eslint-disable-next-line no-console
        console.log("Injected .env.local into generated project.");
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to inject target API configuration", e);
    }
  }
}
