/**
 * Legacy DAG type definitions.
 * All concrete DAG data has been migrated to the centralized task registry
 * (see ../data/taskRegistry.ts). Use getTaskTypeDefinition() to retrieve
 * the dag / errorDag / expectedResults for a given task type.
 */

export interface DagResolver {
  name: string;
  params: Record<string, string>;
  results: Record<string, string>;
}

export interface DagTaskNode {
  requires: string[];
  resolver: DagResolver;
  provides: string[];
}

export interface DagDefinition {
  tasks: Record<string, DagTaskNode>;
}

export interface DagConfig {
  dag: DagDefinition;
  expectedResults: string[];
  errorDag?: DagDefinition;
}
