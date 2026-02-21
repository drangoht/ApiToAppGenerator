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
            // Check if node_modules already exists to skip install
            let needsInstall = true;
            try {
                await fs.access(path.join(cwd, 'node_modules'));
                needsInstall = false;
            } catch { }

            const logFile = path.join(cwd, 'preview.log');
            await fs.writeFile(logFile, `--- Preview Start ---\n`);

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

            // Start dev server
            instance.status = 'STARTING';
            const devProcess = spawn('npm', ['run', 'dev', '--', '-p', instance.port!.toString()], { cwd, shell: true });
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
