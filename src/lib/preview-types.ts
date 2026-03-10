import type { ChildProcess } from "child_process";

export type PreviewStatus = "IDLE" | "INSTALLING" | "STARTING" | "READY" | "ERROR";

export interface PreviewInstance {
  projectId: string;
  port: number | null;
  status: PreviewStatus;
  process: ChildProcess | null;
  errorMessage?: string;
}

