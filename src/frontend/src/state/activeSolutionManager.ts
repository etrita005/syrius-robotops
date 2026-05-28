import { SolutionMeta } from "../types/solution.js";

type ChangeListener = (id: string | null) => void;

const STORAGE_KEY = "robotops_active_solution_id";

class ActiveSolutionManager {
  private activeId: string | null = null;
  private activeMeta: SolutionMeta | null = null;
  private listeners: Set<ChangeListener> = new Set();

  constructor() {
    this.restore();
  }

  getActiveId(): string | null {
    return this.activeId;
  }

  getActiveMeta(): SolutionMeta | null {
    return this.activeMeta;
  }

  setActive(id: string, meta: SolutionMeta): void {
    this.activeId = id;
    this.activeMeta = meta;
    this.persist();
    this.notify();
  }

  clear(): void {
    this.activeId = null;
    this.activeMeta = null;
    this.persist();
    this.notify();
  }

  onChange(callback: ChangeListener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.activeId);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private persist(): void {
    try {
      if (this.activeId) {
        localStorage.setItem(STORAGE_KEY, this.activeId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // localStorage unavailable
    }
  }

  private restore(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.activeId = stored;
      }
    } catch {
      // localStorage unavailable
    }
  }
}

export const activeSolutionManager = new ActiveSolutionManager();
