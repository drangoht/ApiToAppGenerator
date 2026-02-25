import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import net from 'net';
import fs from 'fs/promises';

type PreviewStatus = 'IDLE' | 'INSTALLING' | 'STARTING' | 'READY' | 'ERROR';

interface PreviewInstance {
    projectId: string;
    port: number | null;
    status: PreviewStatus;
    process: ChildProcess | null;
    errorMessage?: string;
}

// In-memory store for singleton preview manager. Next.js hot reloads might reset this in dev,
// but for a POC it's sufficient. Better to use a separate microservice for production.
const instances = new Map<string, PreviewInstance>();

async function findAvailablePort(startPort: number = 3100): Promise<number> {
    const isPortBusy = (port: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true);
                } else {
                    resolve(true); // Safer to assume busy on other errors
                }
            });
            server.once('listening', () => {
                server.close(() => resolve(false));
            });
            server.listen(port, '127.0.0.1');
        });
    };

    let port = startPort;
    while (await isPortBusy(port)) {
        port++;
        if (port > 4000) throw new Error("No available ports found in range.");
    }
    return port;
}

export const PreviewManager = {
    getStatus(projectId: string): PreviewInstance | undefined {
        return instances.get(projectId);
    },

    async startPreview(projectId: string): Promise<PreviewInstance> {
        // Stop any existing instance
        const existing = instances.get(projectId);
        if (existing?.process) {
            if (process.platform === 'win32' && existing.process.pid) {
                spawn('taskkill', ['/pid', existing.process.pid.toString(), '/f', '/t']);
            } else {
                existing.process.kill('SIGKILL');
            }
        }

        const projectDir = path.join(process.cwd(), 'projects', projectId, 'generated');

        // Verify dir exists
        try {
            await fs.access(projectDir);
        } catch {
            throw new Error("Project code has not been generated yet.");
        }

        const port = await findAvailablePort();

        const instance: PreviewInstance = {
            projectId,
            port,
            status: 'INSTALLING',
            process: null
        };
        instances.set(projectId, instance);

        // We run the installation asynchronously and update status
        this.runInstallationAndStart(instance, projectDir);

        return instance;
    },

    async runInstallationAndStart(instance: PreviewInstance, cwd: string) {
        try {
            // Check if we need to run npm install based on package.json modification time
            let needsInstall = true;
            try {
                const nodeModulesStat = await fs.stat(path.join(cwd, 'node_modules'));
                const pkgJsonStat = await fs.stat(path.join(cwd, 'package.json'));
                // If node_modules is newer than package.json, we can skip install.
                // Otherwise (e.g. Generator injected new deps into package.json), we must install.
                if (nodeModulesStat.mtimeMs > pkgJsonStat.mtimeMs) {
                    needsInstall = false;
                }
            } catch { }

            const logFile = path.join(cwd, 'preview.log');
            await fs.writeFile(logFile, `--- Preview Start ---\n`);

            // Ensure a package.json exists and ALWAYS forcefully inject the required Next.js dev scripts
            // otherwise the LLM-generated package.json might just say "next dev" which binds to 127.0.0.1 and breaks Docker.
            const pkgPath = path.join(cwd, 'package.json');
            let pkgData: any = {};
            try {
                const existing = await fs.readFile(pkgPath, 'utf-8');
                pkgData = JSON.parse(existing);
            } catch {
                pkgData = {
                    name: "generated-app",
                    version: "0.1.0",
                    private: true,
                    dependencies: {}
                };
            }

            // Forcefully apply scripts and critical dependencies regardless of what the LLM generated
            // We pin Next.js to 14.2.35 and React to 18.2.0 to prevent Next 15 / React 19 breaking changes.
            pkgData.scripts = {
                ...pkgData.scripts,
                "dev": "next dev . -H 0.0.0.0",
                "build": "next build .",
                "start": "next start . -H 0.0.0.0"
            };
            pkgData.dependencies = {
                ...pkgData.dependencies,
                "next": "14.2.35",
                "react": "18.2.0",
                "react-dom": "18.2.0",
                "lucide-react": "latest",
                "tailwind-merge": "latest",
                "clsx": "latest"
            };
            pkgData.devDependencies = {
                ...pkgData.devDependencies,
                "@types/node": "latest",
                "@types/react": "latest",
                "@types/react-dom": "latest",
                "postcss": "latest",
                "tailwindcss": "latest",
                "typescript": "latest"
            };

            await fs.writeFile(pkgPath, JSON.stringify(pkgData, null, 2));

            // Ensure a valid tsconfig.json exists. If the LLM didn't generate one properly,
            // Next.js dev server will crash with ERR_INVALID_ARG_TYPE in the TS compiler.
            const defaultTsConfig = {
                "compilerOptions": {
                    "target": "es5",
                    "lib": ["dom", "dom.iterable", "esnext"],
                    "allowJs": true,
                    "skipLibCheck": true,
                    "strict": false,
                    "noEmit": true,
                    "esModuleInterop": true,
                    "module": "esnext",
                    "moduleResolution": "bundler",
                    "resolveJsonModule": true,
                    "isolatedModules": true,
                    "jsx": "preserve",
                    "incremental": true,
                    "plugins": [{ "name": "next" }],
                    "paths": { "@/*": ["./src/*"] }
                },
                "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
                "exclude": ["node_modules"]
            };
            await fs.writeFile(path.join(cwd, 'tsconfig.json'), JSON.stringify(defaultTsConfig, null, 2));

            // Ensure next.config.mjs actually exports its configuration.
            // If the LLM just wrote `const nextConfig = {}` without `export default`, 
            // the dev server will resolve the config as undefined and crash internally.
            // Next 14.2.0 BUG: We MUST include tsconfigPath: "tsconfig.json" explicitly, otherwise
            // the dev server crashes with ERR_INVALID_ARG_TYPE in verify-typescript-setup.js.
            // CRITICAL: Delete any .js/.ts/.cjs config files the LLM might have generated, 
            // as Next.js prioritizes those over .mjs and will bypass our failsafe!
            await fs.rm(path.join(cwd, 'next.config.js'), { force: true });
            await fs.rm(path.join(cwd, 'next.config.ts'), { force: true });
            await fs.rm(path.join(cwd, 'next.config.cjs'), { force: true });
            const nextConfigContent = `/** @type {import('next').NextConfig} */\nconst nextConfig = { typescript: { ignoreBuildErrors: true, tsconfigPath: "tsconfig.json" }, eslint: { ignoreDuringBuilds: true } };\nexport default nextConfig;\n`;
            await fs.writeFile(path.join(cwd, 'next.config.mjs'), nextConfigContent);

            // Ensure valid postcss and tailwind configs exist to prevent CSS bundler crashes
            const postCssContent = `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };\n`;
            await fs.writeFile(path.join(cwd, 'postcss.config.mjs'), postCssContent);

            const tailwindContent = `import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: { extend: {} },
  plugins: [require("tailwindcss-animate")],
};
export default config;\n`;
            await fs.writeFile(path.join(cwd, 'tailwind.config.ts'), tailwindContent);

            if (needsInstall) {
                instance.status = 'INSTALLING';
                await new Promise<void>((resolve, reject) => {
                    const install = spawn('npm', ['install', '--no-fund', '--no-audit', '--cache', '/tmp/.npm-cache'], { cwd, shell: true });
                    install.stdout.on('data', async d => await fs.appendFile(logFile, d.toString()));
                    install.stderr.on('data', async d => await fs.appendFile(logFile, d.toString()));
                    install.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`npm install failed with code ${code}`));
                    });
                });
            }

            // Always clear the Next.js build cache to prevent Turbopack corruption crashes
            try {
                await fs.rm(path.join(cwd, '.next'), { recursive: true, force: true });
            } catch (e) {
                // Ignore missing directory
            }

            instance.status = 'STARTING';

            // We MUST explicitly clear NODE_ENV=production from the Docker container's environment
            // when spawning the Next.js dev server, otherwise Next.js 14.2 gets deeply confused
            // during compiler initialization and crashes with ERR_INVALID_ARG_TYPE seeking undefined paths.
            // CRITICAL: We also MUST strip all internal NEXT_ and __NEXT_ variables inherited from the AppForge Next.js 
            // parent process, otherwise the child Next.js process skips loading next.config.mjs because it thinks it is
            // inside a different build phase!
            const childEnv: NodeJS.ProcessEnv = {
                NODE_ENV: 'development',
                NEXT_TELEMETRY_DISABLED: '1'
            };
            for (const key in process.env) {
                if (key.startsWith('__NEXT') || (key.startsWith('NEXT_') && key !== 'NEXT_TELEMETRY_DISABLED')) {
                    continue;
                }
                if (process.env[key] !== undefined) {
                    childEnv[key] = process.env[key];
                }
            }

            const devProcess = spawn('npm', ['run', 'dev', '--cache', '/tmp/.npm-cache', '--', '-p', instance.port!.toString(), '-H', '0.0.0.0'], {
                cwd,
                shell: true,
                env: childEnv
            });
            instance.process = devProcess;

            devProcess.stdout?.on('data', async (data: any) => {
                const out = data.toString();
                await fs.appendFile(logFile, out);
                // Next.js ready signal parsing
                if (out.includes('Ready') || out.includes('started server') || out.includes('url: http') || out.includes('- Local:')) {
                    instance.status = 'READY';
                }
            });

            devProcess.stderr?.on('data', async (data: any) => {
                const out = data.toString();
                await fs.appendFile(logFile, out);
                console.error(`[Preview ${instance.projectId}] STDERR:`, out);
            });

            devProcess.on('close', async (code) => {
                await fs.appendFile(logFile, `\n--- PROCESS EXITED WITH CODE ${code} ---\n`);
                console.log(`[Preview ${instance.projectId}] Process exited with code ${code}`);
                if (instance.status !== 'READY') { // if it died before starting
                    instance.status = 'ERROR';
                    instance.errorMessage = `Process exited prematurely with code ${code}`;
                } else {
                    instance.status = 'IDLE';
                }
                instance.process = null;
            });

        } catch (e: any) {
            console.error(`[Preview ${instance.projectId}] Error:`, e);
            instance.status = 'ERROR';
            instance.errorMessage = e.message;
            if (instance.process) {
                instance.process.kill();
                instance.process = null;
            }
        }
    },

    stopPreview(projectId: string) {
        const instance = instances.get(projectId);
        if (instance?.process) {
            // Kill node process tree. On Windows, instance.process.kill() only kills cmd.exe
            // leaving node.exe orphaned and holding the port.
            if (process.platform === 'win32' && instance.process.pid) {
                spawn('taskkill', ['/pid', instance.process.pid.toString(), '/f', '/t']);
            } else {
                instance.process.kill('SIGKILL');
            }
            instance.process = null;
        }
        if (instance) {
            instance.status = 'IDLE';
            instance.port = null;
            instance.errorMessage = undefined;
        }
    }
}
