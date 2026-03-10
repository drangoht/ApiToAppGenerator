import fs from "fs/promises";
import path from "path";

interface GeneratedProjectWriterOptions {
  projectId: string;
}

interface ProjectLikeForEnv {
  targetApiConfig?: string | null;
}

export class GeneratedProjectWriter {
  private readonly projectId: string;

  constructor(options: GeneratedProjectWriterOptions) {
    this.projectId = options.projectId;
  }

  async writeFromLlmOutput(text: string, project?: ProjectLikeForEnv) {
    const projectDir = path.join(
      process.cwd(),
      "projects",
      this.projectId,
      "generated"
    );
    await fs.mkdir(projectDir, { recursive: true });

    try {
      // Aggressively clear out old source code to prevent ghost files from previous generations
      await fs.rm(path.join(projectDir, "src"), { recursive: true, force: true });
      await fs.rm(path.join(projectDir, "components"), {
        recursive: true,
        force: true,
      });
      await fs.rm(path.join(projectDir, "app"), { recursive: true, force: true });
    } catch {
      // Missing directories are fine
    }

    const fileRegex = /<<<FILE:(.*?)>>>([\s\S]*?)<<<END>>>/g;
    // Save raw LLM output for debugging
    await fs.writeFile(path.join(projectDir, "llm-output.txt"), text);

    let match;
    while ((match = fileRegex.exec(text)) !== null) {
      let filePath = match[1].trim();
      const content = match[2].trim();

      // Auto-correct bad LLM config names
      if (filePath === "next.config.ts") filePath = "next.config.mjs";

      const fullPath = path.join(projectDir, filePath);

      // Ensure subdir exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      await fs.writeFile(fullPath, content);
      // eslint-disable-next-line no-console
      console.log(`Wrote file: ${filePath}`);
    }

    // Force a guaranteed-safe Next.js config. LLMs routinely hallucinate invalid next.config.js or mjs files
    // (e.g. putting CommonJS module.exports into an ES Module .mjs file, which crashes Node instantly).
    try {
      await fs.rm(path.join(projectDir, "next.config.js"), { force: true });
    } catch {
      // ignore
    }
    try {
      await fs.rm(path.join(projectDir, "next.config.ts"), { force: true });
    } catch {
      // ignore
    }

    // Enforce App Router: Next.js crashes if BOTH 'app' and 'pages' directories exist.
    // LLMs frequently hallucinate both. We explicitly delete the Pages router.
    try {
      await fs.rm(path.join(projectDir, "src", "pages"), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }
    try {
      await fs.rm(path.join(projectDir, "pages"), {
        recursive: true,
        force: true,
      });
    } catch {
      // ignore
    }

    const defaultNextConfig =
      "/** @type {import('next').NextConfig} */\nconst nextConfig = { typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true } };\nexport default nextConfig;";
    await fs.writeFile(
      path.join(projectDir, "next.config.mjs"),
      defaultNextConfig
    );

    // Force inject common dependencies that the LLM often uses but forgets to include in package.json
    try {
      const packageJsonPath = path.join(projectDir, "package.json");
      let pkgStr = "{}";
      try {
        pkgStr = await fs.readFile(packageJsonPath, "utf8");
      } catch {
        // ignore, we'll start from empty pkg
      }
      const pkg = JSON.parse(pkgStr || "{}");

      if (!pkg.dependencies) pkg.dependencies = {};
      if (!pkg.devDependencies) pkg.devDependencies = {};
      if (!pkg.scripts) pkg.scripts = {};

      // Remove hallucinatory invalid packages that break npm install
      const invalidPackages = ["shadcn/ui", "shadcn", "@shadcn/ui"];
      for (const invalidPkg of invalidPackages) {
        delete pkg.dependencies[invalidPkg];
        delete pkg.devDependencies[invalidPkg];
      }

      // Explicitly force Webpack (disable Turbopack) because Turbopack's Rust IPC crashes in our Docker sandbox mapping
      pkg.scripts.dev = "next dev";
      pkg.scripts.build = "next build";
      pkg.scripts.start = "next start";

      // Force override core Next.js 14 / React 18 dependencies.
      // Pin EXACT versions (no caret) so npm never resolves to Next.js 15+/16 which uses Turbopack by default.
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
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        postcss: "^8.4.31",
        tailwindcss: "^3.4.0",
        autoprefixer: "^10.4.19",
        eslint: "^8.0.0",
        "eslint-config-next": "14.2.35",
      };

      for (const [dep, version] of Object.entries(forceDeps)) {
        pkg.dependencies[dep] = version; // Actively overwrite bad versions
      }
      for (const [dep, version] of Object.entries(forceDevDeps)) {
        pkg.devDependencies[dep] = version;
      }

      await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to inject common dependencies", e);
    }

    // Prevent directory traversal bug where generated Next 14 app looks for parent ApiToAppGenerator next.config.ts
    try {
      await fs.access(path.join(projectDir, "next.config.mjs"));
    } catch {
      try {
        await fs.access(path.join(projectDir, "next.config.js"));
      } catch {
        // If neither exists, write a default to stop upward directory traversal
        const defaultNextConfigFallback =
          "/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;";
        await fs.writeFile(
          path.join(projectDir, "next.config.mjs"),
          defaultNextConfigFallback
        );
      }
    }

    // Ensure tsconfig.json has path aliases for @/* imports
    try {
      const tsconfigPath = path.join(projectDir, "tsconfig.json");
      let tsconfigStr = "{}";
      try {
        tsconfigStr = await fs.readFile(tsconfigPath, "utf8");
      } catch {
        // ignore, we'll create a fresh one
      }

      const tsconfig = JSON.parse(tsconfigStr || "{}");
      if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};

      tsconfig.compilerOptions.baseUrl = ".";
      tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};
      if (!tsconfig.compilerOptions.paths["@/*"]) {
        tsconfig.compilerOptions.paths["@/*"] = ["./src/*"];
      }

      await fs.writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2));
    } catch (e) {
      // eslint-disable-next-line no-console
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
          await fs.writeFile(path.join(projectDir, ".env.local"), envContent);
          // eslint-disable-next-line no-console
          console.log(`Injected .env.local into generated project.`);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Failed to inject target API configuration", e);
      }
    }
  }
}

