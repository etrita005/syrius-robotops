import { FlowManager, type ValueMap, type FlowedLogEntry } from 'flowed';

const runningTaskMap = new Map<string, Map<string, number>>();
const completedChains = new Set<string>();
const failedChains = new Set<string>();
let monitorInterval: ReturnType<typeof setInterval> | null = null;

class SleepPrintTask {
  async exec(params: ValueMap): Promise<ValueMap> {
    const taskName = params.taskName as string;
    const duration = params.duration as number;

    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    console.log(`[${new Date().toISOString()}]   ▶ ${taskName} executing (total: ${duration}s)`);

    const remaining = (duration - 1) * 1000;
    if (remaining > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, remaining));
    }

    return { done: true };
  }
}

class FailingSleepPrintTask {
  async exec(params: ValueMap): Promise<ValueMap> {
    const taskName = params.taskName as string;

    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    console.log(`[${new Date().toISOString()}]   ▶ ${taskName} executing - will FAIL`);

    throw new Error(`Task ${taskName} failed intentionally!`);
  }
}

FlowManager.installLogger({
  log(entry: FlowedLogEntry): void {
    const chainId = entry.objectId;
    if (!chainId) return;

    if (entry.eventType === 'Task.Started') {
      const taskCode = entry.extra && entry.extra.task && (entry.extra.task as { code: string }).code;
      if (!runningTaskMap.has(chainId)) {
        runningTaskMap.set(chainId, new Map());
      }
      runningTaskMap.get(chainId)!.set(taskCode, Date.now());
    } else if (entry.eventType === 'Task.Finished') {
      const taskCode = entry.extra && entry.extra.task && (entry.extra.task as { code: string }).code;
      const chainTasks = runningTaskMap.get(chainId);
      if (chainTasks) {
        chainTasks.delete(taskCode);
      }
    } else if (entry.eventType === 'Flow.Finished') {
      const chainTasks = runningTaskMap.get(chainId);
      if (chainTasks) {
        chainTasks.clear();
      }

      if (entry.level === 'error') {
        failedChains.add(chainId);
        console.log('\n╔══════════════════════════════════════╗');
        console.log(`║  CHAIN ${chainId.toUpperCase()} FAILED`);
        console.log('╚══════════════════════════════════════╝\n');
      } else {
        completedChains.add(chainId);
        console.log('\n╔══════════════════════════════════════╗');
        console.log(`║  CHAIN ${chainId.toUpperCase()} COMPLETED`);
        console.log('╚══════════════════════════════════════╝\n');
      }

      checkAllDone();
    }
  },
});

function checkAllDone(): void {
  const totalChains = 3;
  if (completedChains.size + failedChains.size >= totalChains) {
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }
    console.log('════════════════════════════════════════');
    console.log(`  All ${totalChains} chains finished!`);
    console.log(`  Completed: ${completedChains.size}, Failed: ${failedChains.size}`);
    console.log('════════════════════════════════════════');

    printRunningTasks();

    setTimeout(() => process.exit(0), 300);
  }
}

function printRunningTasks(): void {
  const now = new Date().toISOString().slice(11, 19);
  let hasRunning = false;

  for (const [chainId, tasks] of runningTaskMap) {
    if (tasks.size > 0) {
      hasRunning = true;
      const taskList = Array.from(tasks.keys()).join(', ');
      console.log(`[${now}] MONITOR: ${chainId} running tasks -> [${taskList}]`);
    }
  }

  if (!hasRunning) {
    console.log(`[${now}] MONITOR: No tasks currently running`);
  }
}

monitorInterval = setInterval(printRunningTasks, 2000);

interface TaskDef {
  resolver: {
    name: string;
    params: {
      taskName: { value: string };
      duration: { value: number };
    };
    results: Record<string, string>;
  };
  provides: string[];
  requires?: string[];
}

interface ChainFlow {
  tasks: Record<string, TaskDef>;
  taskCodes: string[];
}

function buildChainFlow(chainId: string, taskCount: number, includeFailing?: boolean): ChainFlow {
  const taskDefs: Record<string, TaskDef> = {};
  const taskCodes: string[] = [];

  for (let i = 0; i < taskCount; i++) {
    const taskCode = `${chainId}_Task${String.fromCharCode(65 + i)}`;
    taskCodes.push(taskCode);

    const duration = Math.floor(Math.random() * 8) + 3;

    const taskDef: TaskDef = {
      resolver: {
        name: includeFailing && i === 1 ? 'FailingSleepPrintTask' : 'SleepPrintTask',
        params: {
          taskName: { value: taskCode },
          duration: { value: duration },
        },
        results: { done: `dep_${taskCode}` },
      },
      provides: [`dep_${taskCode}`],
    };

    if (i > 0) {
      const prevCode = taskCodes[i - 1];
      taskDef.requires = [`dep_${prevCode}`];
    }

    taskDefs[taskCode] = taskDef;
  }

  return { tasks: taskDefs, taskCodes };
}

async function main(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Flowed Dynamic Task Chain Demo');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  const resolvers = { SleepPrintTask, FailingSleepPrintTask };

  const chain1 = buildChainFlow('Chain1', 3);
  const chain2 = buildChainFlow('Chain2', 2);

  console.log(`[${new Date().toISOString()}] Starting Chain 1 (${chain1.taskCodes.length} tasks) and Chain 2 (${chain2.taskCodes.length} tasks)`);
  console.log(`[${new Date().toISOString()}] Chain 1 tasks: ${chain1.taskCodes.join(' -> ')}`);
  console.log(`[${new Date().toISOString()}] Chain 2 tasks: ${chain2.taskCodes.join(' -> ')}`);
  console.log('');

  FlowManager.run(chain1, {}, [], resolvers, {}, { instanceId: 'Chain1' }).catch(() => {});
  FlowManager.run(chain2, {}, [], resolvers, {}, { instanceId: 'Chain2' }).catch(() => {});

  setTimeout(() => {
    const chain3 = buildChainFlow('Chain3', 3, true);
    console.log('');
    console.log(`[${new Date().toISOString()}] Dynamically inserting Chain 3 (${chain3.taskCodes.length} tasks, task B will fail)`);
    console.log(`[${new Date().toISOString()}] Chain 3 tasks: ${chain3.taskCodes.join(' -> ')}`);
    console.log('');
    FlowManager.run(chain3, {}, [], resolvers, {}, { instanceId: 'Chain3' }).catch(() => {});
  }, 10000);
}

main();