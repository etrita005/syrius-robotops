export interface RobotSelection {
  mode: "single" | "multiple";
  description?: string;
}

export interface TaskParamDescriptor {
  type: "artifact" | "text" | "number" | "select";
  label: string;
  required: boolean;
  options?: string[];
}

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

export interface TaskTypeDefinition {
  type: string;
  name: string;
  description: string;
  robotSelection: RobotSelection;
  dag: DagDefinition;
  expectedResults: string[];
  errorDag?: DagDefinition;
  params: Record<string, TaskParamDescriptor>;
}

export interface TaskRegistry {
  version: string;
  taskTypes: TaskTypeDefinition[];
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

export const TASK_REGISTRY: TaskRegistry = {
  version: "1.0.0",
  taskTypes: [
    {
      type: "upgrade-bup",
      name: "Upgrade BUP",
      description: "Upgrade the BUP firmware on selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to upgrade BUP firmware.",
      },
      dag: SSH_FILE_TRANSFER_DAG,
      expectedResults: ["upgrade_result"],
      params: {
        artifactId: {
          type: "artifact",
          label: "Artifact file",
          required: true,
        },
      },
    },
    {
      type: "upgrade-movebase",
      name: "Upgrade Movebase",
      description: "Upgrade the Movebase software on selected robots.",
      robotSelection: {
        mode: "single",
        description:
          "Select a single target robot to upgrade Movebase software.",
      },
      dag: UPGRADE_MOVEBASE_DAG,
      expectedResults: ["cleanup_done"],
      errorDag: UPGRADE_MOVEBASE_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "Artifact file",
          required: true,
        },
      },
    },
  ],
};

export function getTaskTypeDefinition(
  type: string
): TaskTypeDefinition | undefined {
  return TASK_REGISTRY.taskTypes.find((t) => t.type === type);
}

export function getTaskTypeDefinitions(): TaskTypeDefinition[] {
  return TASK_REGISTRY.taskTypes;
}

export function parseTaskRegistry(data: unknown): TaskRegistry {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid task registry: expected object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "string") {
    throw new Error("Invalid task registry: version must be a string");
  }
  if (!Array.isArray(obj.taskTypes)) {
    throw new Error("Invalid task registry: taskTypes must be an array");
  }
  for (const tt of obj.taskTypes) {
    if (!tt || typeof tt !== "object") {
      throw new Error("Invalid task registry: each taskType must be an object");
    }
    const task = tt as Record<string, unknown>;
    if (typeof task.type !== "string") {
      throw new Error("Invalid task registry: taskType.type must be a string");
    }
    if (typeof task.name !== "string") {
      throw new Error("Invalid task registry: taskType.name must be a string");
    }
    if (!task.dag || typeof task.dag !== "object") {
      throw new Error(
        `Invalid task registry: taskType ${task.type} dag must be an object`
      );
    }
    if (!Array.isArray(task.expectedResults)) {
      throw new Error(
        `Invalid task registry: taskType ${task.type} expectedResults must be an array`
      );
    }
    if (!task.robotSelection || typeof task.robotSelection !== "object") {
      throw new Error(
        `Invalid task registry: taskType ${task.type} robotSelection must be an object`
      );
    }
    const rs = task.robotSelection as Record<string, unknown>;
    if (rs.mode !== "single" && rs.mode !== "multiple") {
      throw new Error(
        `Invalid task registry: taskType ${task.type} robotSelection.mode must be "single" or "multiple"`
      );
    }
  }
  return data as TaskRegistry;
}
