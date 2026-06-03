import type { Dag } from './types.js';

export type DagExecutor = (dag: Dag) => Promise<unknown>;

const executors = new Map<string, DagExecutor>();

export function registerDagExecutor(dagType: string, executor: DagExecutor): void {
  executors.set(dagType, executor);
}

export async function executeDag(dag: Dag): Promise<unknown> {
  const executor = executors.get(dag.type);
  if (!executor) {
    throw new Error(`[MemStore] Unsupported DAG type: ${dag.type}`);
  }
  return executor(dag);
}
