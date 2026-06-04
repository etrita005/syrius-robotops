import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';

export class Scheduler {
  private scheduler = new ToadScheduler();
  private jobMap = new Map<string, Set<string>>();
  private timeoutMap = new Map<string, ReturnType<typeof setTimeout>>();

  scheduleCron(key: string, cron: string, callback: () => Promise<void>): void {
    const seconds = this.parseCronToSeconds(cron);
    const id = `${key}::cron`;
    const task = new AsyncTask(
      id,
      callback,
      (err: Error) => console.error(`[MemStore] Cron task error for ${key}:`, err.message)
    );
    const job = new SimpleIntervalJob({ seconds }, task, { id, preventOverrun: true });
    this.scheduler.addSimpleIntervalJob(job);
    this.trackJob(key, id);
  }

  scheduleWarning(key: string, delayMs: number, callback: () => Promise<void>): void {
    const id = `${key}::warn`;
    if (this.timeoutMap.has(id)) {
      clearTimeout(this.timeoutMap.get(id)!);
      this.timeoutMap.delete(id);
    }
    if (delayMs <= 0) {
      callback().catch((err: Error) => console.error(`[MemStore] Warning immediate error for ${key}:`, err.message));
      return;
    }
    const timeout = setTimeout(() => {
      this.timeoutMap.delete(id);
      callback().catch((err: Error) => console.error(`[MemStore] Warning task error for ${key}:`, err.message));
    }, delayMs);
    this.timeoutMap.set(id, timeout);
  }

  clearJobsForKey(key: string): void {
    const ids = this.jobMap.get(key);
    if (ids) {
      for (const id of ids) {
        this.scheduler.removeById(id);
      }
      this.jobMap.delete(key);
    }
    const warnId = `${key}::warn`;
    if (this.timeoutMap.has(warnId)) {
      clearTimeout(this.timeoutMap.get(warnId)!);
      this.timeoutMap.delete(warnId);
    }
  }

  destroy(): void {
    this.scheduler.stop();
    for (const timeout of this.timeoutMap.values()) {
      clearTimeout(timeout);
    }
    this.timeoutMap.clear();
    this.jobMap.clear();
  }

  private trackJob(key: string, id: string): void {
    if (!this.jobMap.has(key)) this.jobMap.set(key, new Set());
    this.jobMap.get(key)!.add(id);
  }

  private parseCronToSeconds(cron: string): number {
    const parts = cron.trim().split(/\s+/);
    if (parts.length >= 1 && parts[0].startsWith('*/')) {
      const n = parseInt(parts[0].slice(2), 10);
      if (!isNaN(n) && n > 0) return n;
    }
    console.warn(`[MemStore] Unsupported cron format "${cron}", defaulting to 180s interval`);
    return 180;
  }
}
