import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";
import { findAvailablePort } from "@/lib/preview-port-allocator";
import { PreviewStateStore } from "@/lib/preview-state-store";
import type { PreviewInstance } from "@/lib/preview-types";
import { preparePreviewProject } from "@/lib/preview-project-preparer";

/**
 * Returns the command and arguments to start the Next.js dev server.
 *
 * We always invoke node_modules/next/dist/bin/next directly via `node`.
 * This is a plain JS file that works on every platform without wrappers,
 * so shell: false is safe and there is no OS-specific branching needed.
 * It also bypasses npm script overhead and prevents --turbo flag inheritance.
 */
function resolveNextDevCommand(cwd: string, port: number): { cmd: string; args: string[] } {
  const nextEntry = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
  return {
    cmd: "node",
    args: [nextEntry, "dev", "-p", port.toString(), "-H", "0.0.0.0"],
  };
}

export const PreviewManager = {
  getStatus(projectId: string): PreviewInstance | undefined {
    return PreviewStateStore.get(projectId);
  },

  async startPreview(projectId: string): Promise<PreviewInstance> {
    // Stop any existing instance
    const existing = PreviewStateStore.get(projectId);
    if (existing?.process) {
      if (process.platform === "win32" && existing.process.pid) {
        spawn("taskkill", ["/pid", existing.process.pid.toString(), "/f", "/t"]);
      } else {
        existing.process.kill("SIGKILL");
      }
    }

    const projectDir = path.join(
      process.cwd(),
      "projects",
      projectId,
      "generated"
    );

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
      status: "INSTALLING",
      process: null,
    };
    PreviewStateStore.set(instance);

    // We run the installation asynchronously and update status
    this.runInstallationAndStart(instance, projectDir);

    return instance;
  },

  async runInstallationAndStart(instance: PreviewInstance, cwd: string) {
    try {
      const { logFile, childEnv, needsInstall } = await preparePreviewProject(
        instance,
        cwd
      );

      if (needsInstall) {
        instance.status = "INSTALLING";

        // Forcefully clear old modules to prevent tar ENOENT and ENOTEMPTY cache corruptions on Docker mapping
        try {
          await fs.rm(path.join(cwd, "node_modules"), {
            recursive: true,
            force: true,
          });
          await fs.rm(path.join(cwd, "package-lock.json"), { force: true });
        } catch {
          // ignore
        }

        await new Promise<void>((resolve, reject) => {
          const install = spawn(
            "npm",
            [
              "install",
              "--no-fund",
              "--no-audit",
              "--legacy-peer-deps",
              "--cache",
              "/tmp/.npm-cache",
            ],
            { cwd, shell: true, env: childEnv }
          );
          install.stdout.on("data", async (d) =>
            fs.appendFile(logFile, d.toString())
          );
          install.stderr.on("data", async (d) =>
            fs.appendFile(logFile, d.toString())
          );
          install.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`npm install failed with code ${code}`));
          });
        });
      }

      // Always clear the Next.js build cache to prevent Turbopack corruption crashes
      try {
        await fs.rm(path.join(cwd, ".next"), { recursive: true, force: true });
      } catch {
        // Ignore missing directory
      }

      // Patch existing package.json dev script to strip --turbo / --turbopack from legacy LLM-generated projects
      try {
        const pkgPath = path.join(cwd, "package.json");
        const pkgRaw = await fs.readFile(pkgPath, "utf8");
        const pkg = JSON.parse(pkgRaw);
        if (pkg.scripts?.dev && typeof pkg.scripts.dev === "string") {
          pkg.scripts.dev = pkg.scripts.dev
            .replace(/\s*--turbopack/g, "")
            .replace(/\s*--no-turbopack/g, "")
            .replace(/\s*--turbo(?:\b)/g, "");
          await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
        }
      } catch {
        // ignore
      }

      instance.status = "STARTING";

      const { cmd, args } = resolveNextDevCommand(cwd, instance.port!);
      const devProcess = spawn(cmd, args, { cwd, shell: false, env: childEnv });
      instance.process = devProcess;

      devProcess.stdout?.on("data", async (data: any) => {
        const out = data.toString();
        await fs.appendFile(logFile, out);
        // Next.js ready signal parsing
        if (
          out.includes("Ready") ||
          out.includes("started server") ||
          out.includes("url: http") ||
          out.includes("- Local:")
        ) {
          instance.status = "READY";
        }
      });

      devProcess.stderr?.on("data", async (data: any) => {
        const out = data.toString();
        await fs.appendFile(logFile, out);
        // eslint-disable-next-line no-console
        console.error(`[Preview ${instance.projectId}] STDERR:`, out);
      });

      devProcess.on("close", async (code) => {
        await fs.appendFile(
          logFile,
          `\n--- PROCESS EXITED WITH CODE ${code} ---\n`
        );
        // eslint-disable-next-line no-console
        console.log(
          `[Preview ${instance.projectId}] Process exited with code ${code}`
        );
        if (instance.status !== "READY") {
          instance.status = "ERROR";
          instance.errorMessage = `Process exited prematurely with code ${code}`;
        } else {
          instance.status = "IDLE";
        }
        instance.process = null;
      });
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(`[Preview ${instance.projectId}] Error:`, e);
      instance.status = "ERROR";
      instance.errorMessage = e.message;
      if (instance.process) {
        instance.process.kill();
        instance.process = null;
      }
    }
  },

  stopPreview(projectId: string) {
    const instance = PreviewStateStore.get(projectId);
    if (instance?.process) {
      // Kill node process tree. On Windows, instance.process.kill() only kills cmd.exe
      // leaving node.exe orphaned and holding the port.
      if (process.platform === "win32" && instance.process.pid) {
        spawn("taskkill", ["/pid", instance.process.pid.toString(), "/f", "/t"]);
      } else {
        instance.process.kill("SIGKILL");
      }
      instance.process = null;
    }
    if (instance) {
      instance.status = "IDLE";
      instance.port = null;
      instance.errorMessage = undefined;
    }
  },
};
