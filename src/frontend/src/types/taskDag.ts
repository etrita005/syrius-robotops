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

const UPGRADE_MOVEBASE_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferMovebaseTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    upgrade: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "UpgradeMovebaseTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "upgrade_done" },
      },
      provides: ["upgrade_done"],
    },
    cleanup: {
      requires: ["robotIp", "robotPort", "upgrade_done"],
      resolver: {
        name: "DeleteMovebaseTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "cleanup_done" },
      },
      provides: ["cleanup_done"],
    },
  },
};

const UPGRADE_MOVEBASE_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "DeleteMovebaseTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "error_cleanup_done" },
      },
      provides: ["error_cleanup_done"],
    },
  },
};

const SSH_FILE_TRANSFER_DAG: DagDefinition = {
  tasks: {
    upgrade: {
      requires: ["robotIp", "robotPort", "localFilePath", "remoteFilePath"],
      resolver: {
        name: "SshFileTransferTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          localFilePath: "localFilePath",
          remoteFilePath: "remoteFilePath",
        },
        results: { done: "upgrade_result" },
      },
      provides: ["upgrade_result"],
    },
  },
};

const TASK_DAG_MAP: Record<string, DagConfig> = {
  "upgrade-movebase": {
    dag: UPGRADE_MOVEBASE_DAG,
    expectedResults: ["cleanup_done"],
    errorDag: UPGRADE_MOVEBASE_ERROR_DAG,
  },
  "upgrade-bup": {
    dag: SSH_FILE_TRANSFER_DAG,
    expectedResults: ["upgrade_result"],
  },
};

export function getDagConfig(taskType: string): DagConfig {
  const config = TASK_DAG_MAP[taskType];
  if (config) return config;
  return {
    dag: SSH_FILE_TRANSFER_DAG,
    expectedResults: ["upgrade_result"],
  };
}
