import { RecentSolutionEntry } from "../types/solution.js";

type ChangeListener = (entries: RecentSolutionEntry[]) => void;

const STORAGE_KEY = "robotops_recent_solutions";
const MAX_ENTRIES = 10;

class RecentSolutionsManager {
  private entries: RecentSolutionEntry[] = [];
  private listeners: Set<ChangeListener> = new Set();

  constructor() {
    this.restore();
  }

  getList(): RecentSolutionEntry[] {
    return [...this.entries];
  }

  recordAccess(id: string, name: string): void {
    const now = new Date().toISOString();
    this.entries = this.entries.filter((e) => e.id !== id);
    this.entries.unshift({ id, name, accessedAt: now });
    this.entries = this.entries.slice(0, MAX_ENTRIES);
    this.persist();
    this.notify();
  }

  remove(id: string): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.persist();
    this.notify();
  }

  clear(): void {
    this.entries = [];
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
        listener([...this.entries]);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // localStorage unavailable
    }
  }

  private restore(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.entries = JSON.parse(stored);
      }
    } catch {
      this.entries = [];
    }
  }
}

export const recentSolutionsManager = new RecentSolutionsManager();
