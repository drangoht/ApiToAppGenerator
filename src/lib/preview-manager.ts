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
                    resolve(false);
                }
            });
            server.once('listening', () => {
                server.close();
                resolve(false);
            });
            server.listen(port);
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

            // Ensure a package.json exists to prevent npm commands from traversing UP the directory tree
            // and accidentally double-starting the outer ApiToAppGenerator Next.js app.
            try {
                await fs.access(path.join(cwd, 'package.json'));
            } catch {
                await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({
                    "name": "generated-app",
                    "version": "0.1.0",
                    "private": true,
                    "scripts": {
                        "dev": "next dev",
                        "build": "next build",
                        "start": "next start"
                    },
                    "dependencies": {
                        "next": "^14.0.0",
                        "react": "^18.2.0",
                        "react-dom": "^18.2.0",
                        "lucide-react": "latest",
                        "tailwind-merge": "latest",
                        "clsx": "latest"
                    },
                    "devDependencies": {
                        "@types/node": "latest",
                        "@types/react": "latest",
                        "@types/react-dom": "latest",
                        "postcss": "latest",
                        "tailwindcss": "latest",
                        "typescript": "latest"
                    }
                }, null, 2));
            }

            if (needsInstall) {
                instance.status = 'INSTALLING';
                await new Promise<void>((resolve, reject) => {
                    const install = spawn('npm', ['install', '--no-fund', '--no-audit'], { cwd, shell: true });
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

            // Start dev server (forcing IPv4 binding)
            instance.status = 'STARTING';
            const devProcess = spawn('npm', ['run', 'dev', '--', '-p', instance.port!.toString(), '-H', '127.0.0.1'], { cwd, shell: true });
            instance.process = devProcess;

            devProcess.stdout?.on('data', async (data) => {
                const out = data.toString();
                await fs.appendFile(logFile, out);
                // Next.js ready signal parsing
                if (out.includes('Ready') || out.includes('started server') || out.includes('url: http') || out.includes('- Local:')) {
                    instance.status = 'READY';
                }
            });

            devProcess.stderr?.on('data', async (data) => {
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
