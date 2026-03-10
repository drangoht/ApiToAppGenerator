import fs from "fs/promises";
import path from "path";
import type { PreviewInstance } from "@/lib/preview-types";

export interface PreparedPreviewProject {
  logFile: string;
  childEnv: NodeJS.ProcessEnv;
  needsInstall: boolean;
}

export async function preparePreviewProject(
  instance: PreviewInstance,
  cwd: string
): Promise<PreparedPreviewProject> {
  let needsInstall = true;

  // Check if we need to run npm install based on package.json modification time
  try {
    const nodeModulesStat = await fs.stat(path.join(cwd, "node_modules"));
    const pkgJsonStat = await fs.stat(path.join(cwd, "package.json"));
    // If node_modules is newer than package.json, we can skip install.
    // Otherwise (e.g. Generator injected new deps into package.json), we must install.
    if (nodeModulesStat.mtimeMs > pkgJsonStat.mtimeMs) {
      needsInstall = false;
    }
  } catch {
    // Missing node_modules or package.json means we should install
  }

  const logFile = path.join(cwd, "preview.log");
  await fs.writeFile(logFile, `--- Preview Start ---\n`);

  // Ensure a package.json exists and ALWAYS forcefully inject the required Next.js dev scripts
  // otherwise the LLM-generated package.json might just say "next dev" which binds to 127.0.0.1 and breaks Docker.
  const pkgPath = path.join(cwd, "package.json");
  let pkgData: any = {};
  try {
    const existing = await fs.readFile(pkgPath, "utf-8");
    pkgData = JSON.parse(existing);
  } catch {
    pkgData = {
      name: "generated-app",
      version: "0.1.0",
      private: true,
      dependencies: {},
    };
  }

  // Check the installed Next.js version BEFORE rewriting package.json
  // so we can detect version mismatch and force reinstall.
  try {
    const installedPkgPath = path.join(
      cwd,
      "node_modules",
      "next",
      "package.json"
    );
    const installedNext = JSON.parse(
      await fs.readFile(installedPkgPath, "utf-8")
    );
    if (installedNext.version !== "14.2.35") {
      // Wrong version (e.g. Next.js 15/16 which defaults to Turbopack). Force reinstall.
      // eslint-disable-next-line no-console
      console.log(
        `[Preview ${instance.projectId}] Found Next.js ${installedNext.version}, downgrading to 14.2.35`
      );
      needsInstall = true;
    }
  } catch {
    // node_modules doesn't exist or is corrupt, force reinstall
    needsInstall = true;
  }

  // ALWAYS rewrite package.json with pinned dependencies to prevent Next.js 15+ from being installed.
  // This also strips any LLM-generated --turbo flags from dev scripts.
  pkgData.scripts = {
    ...pkgData.scripts,
    dev: "next dev",
    build: "next build",
    start: "next start",
  };
  pkgData.dependencies = {
    ...pkgData.dependencies,
    next: "14.2.35",
    react: "18.2.0",
    "react-dom": "18.2.0",
    "lucide-react": "latest",
    "tailwind-merge": "latest",
    clsx: "latest",
  };
  pkgData.devDependencies = {
    ...pkgData.devDependencies,
    // Pin @types to React 18 - using 'latest' installs React 19 types which break Next.js 14.2.35
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    postcss: "^8",
    tailwindcss: "^3",
    autoprefixer: "^10",
    typescript: "^5",
  };
  // Remove any LLM-hallucinated invalid packages
  for (const invalid of ["shadcn/ui", "shadcn", "@shadcn/ui"]) {
    delete pkgData.dependencies[invalid];
    delete pkgData.devDependencies?.[invalid];
  }

  await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2));

  // Ensure a valid tsconfig.json exists. If the LLM didn't generate one properly,
  // Next.js dev server will crash with ERR_INVALID_ARG_TYPE in the TS compiler.
  const defaultTsConfig = {
    compilerOptions: {
      target: "es5",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./src/*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  };
  await fs.writeFile(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(defaultTsConfig, null, 2)
  );

  // Ensure next.config.mjs actually exports its configuration.
  // Delete any .js/.ts/.cjs config files the LLM might have generated.
  await fs.rm(path.join(cwd, "next.config.js"), { force: true });
  await fs.rm(path.join(cwd, "next.config.ts"), { force: true });
  await fs.rm(path.join(cwd, "next.config.cjs"), { force: true });

  // Dynamic basePath for remote Reverse Proxy tunneling
  const basePath = `/preview/${instance.port}/${instance.projectId}`;
  const publicHost = (process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000")
    .replace(/^https?:\/\//, "") // strip protocol
    .replace(/\/.*$/, ""); // strip path
  const nextConfigContent = `/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "${basePath}",
  allowedDevOrigins: ["${publicHost}", "localhost", "127.0.0.1"],
  typescript: { ignoreBuildErrors: true, tsconfigPath: "tsconfig.json" },
  eslint: { ignoreDuringBuilds: true }
};
export default nextConfig;
`;
  await fs.writeFile(path.join(cwd, "next.config.mjs"), nextConfigContent);

  // Ensure valid postcss and tailwind configs exist to prevent CSS bundler crashes
  const postCssContent =
    "export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n";
  await fs.writeFile(path.join(cwd, "postcss.config.mjs"), postCssContent);

  const tailwindContent = `import type { Config } from "tailwindcss";
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
`;
  await fs.writeFile(path.join(cwd, "tailwind.config.ts"), tailwindContent);

  // We MUST explicitly clear NODE_ENV=production from the Docker container's environment
  // when spawning the Next.js tools, otherwise Next.js 14.2 gets deeply confused.
  const childEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    npm_config_cache: "/tmp/.npm-cache",
    HOME: "/tmp", // Fix npm EACCES
  };
  for (const key in process.env) {
    if (key === "NODE_ENV" || key === "HOME") continue;
    if (
      key.startsWith("__NEXT") ||
      (key.startsWith("NEXT_") && key !== "NEXT_TELEMETRY_DISABLED")
    ) {
      continue;
    }
    if (process.env[key] !== undefined) {
      childEnv[key] = process.env[key];
    }
  }

  return {
    logFile,
    childEnv,
    needsInstall,
  };
}

