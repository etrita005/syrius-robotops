import type { Dag } from './types.js';

export async function executeDag(dag: Dag): Promise<unknown> {
  if (dag.delayMs && dag.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, dag.delayMs));
  }
  if (dag.type === 'mock') {
    return dag.returnValue;
  }
  throw new Error(`Unsupported DAG type: ${(dag as any).type}`);
}
