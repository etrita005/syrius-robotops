import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';

const scheduler = new ToadScheduler();

const jobMap = new Map<string, Set<string>>();
const timeoutMap = new Map<string, ReturnType<typeof setTimeout>>();

function trackJob(key: string, id: string) {
  if (!jobMap.has(key)) jobMap.set(key, new Set());
  jobMap.get(key)!.add(id);
}

export function scheduleCron(key: string, cron: string, callback: () => Promise<void>) {
  const seconds = parseCronToSeconds(cron);
  const id = `${key}::cron`;
  const task = new AsyncTask(
    id,
    callback,
    (err: Error) => console.error(`[MemStore] Cron task error for ${key}:`, err.message)
  );
  const job = new SimpleIntervalJob({ seconds }, task, { id, preventOverrun: true });
  scheduler.addSimpleIntervalJob(job);
  trackJob(key, id);
}

export function scheduleWarning(key: string, delayMs: number, callback: () => Promise<void>) {
  const id = `${key}::warn`;
  if (timeoutMap.has(id)) {
    clearTimeout(timeoutMap.get(id)!);
    timeoutMap.delete(id);
  }
  if (delayMs <= 0) {
    callback().catch((err: Error) => console.error(`[MemStore] Warning immediate error for ${key}:`, err.message));
    return;
  }
  const timeout = setTimeout(() => {
    timeoutMap.delete(id);
    callback().catch((err: Error) => console.error(`[MemStore] Warning task error for ${key}:`, err.message));
  }, delayMs);
  timeoutMap.set(id, timeout);
}

export function clearJobsForKey(key: string) {
  const ids = jobMap.get(key);
  if (ids) {
    for (const id of ids) {
      scheduler.removeById(id);
    }
    jobMap.delete(key);
  }
  const warnId = `${key}::warn`;
  if (timeoutMap.has(warnId)) {
    clearTimeout(timeoutMap.get(warnId)!);
    timeoutMap.delete(warnId);
  }
}

function parseCronToSeconds(cron: string): number {
  const parts = cron.trim().split(/\s+/);
  if (parts.length >= 1 && parts[0].startsWith('*/')) {
    const n = parseInt(parts[0].slice(2), 10);
    if (!isNaN(n) && n > 0) return n;
  }
  console.warn(`[MemStore] Unsupported cron format "${cron}", defaulting to 180s interval`);
  return 180;
}
