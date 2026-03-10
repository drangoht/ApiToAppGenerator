import type { PreviewInstance } from "@/lib/preview-types";

const instances = new Map<string, PreviewInstance>();

export const PreviewStateStore = {
  get(projectId: string): PreviewInstance | undefined {
    return instances.get(projectId);
  },

  set(instance: PreviewInstance): void {
    instances.set(instance.projectId, instance);
  },

  update(projectId: string, updater: (current: PreviewInstance) => void): void {
    const current = instances.get(projectId);
    if (!current) return;
    updater(current);
  },
};

