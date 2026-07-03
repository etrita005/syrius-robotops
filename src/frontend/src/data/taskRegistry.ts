export interface RobotSelection {
  mode: "single" | "multiple";
  description?: string;
}

export interface TaskParamDescriptor {
  type: "artifact" | "text" | "number" | "select" | "checkbox";
  label: string;
  required: boolean;
  description?: string;
  defaultValue?: string;
  options?: string[];
}

export interface DagResolver {
  name: string;
  params: Record<string, string | { value: unknown }>;
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
    reboot: {
      requires: ["robotIp", "robotPort", "upgrade_done"],
      resolver: {
        name: "RebootRobotTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          ignoreFailure: { value: true },
          retryCount: { value: 1 },
        },
        results: { done: "reboot_done" },
      },
      provides: ["reboot_done"],
    },
    wait_reconnect: {
      requires: ["robotIp", "robotPort", "reboot_done"],
      resolver: {
        name: "WaitSshReconnectTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          timeout: { value: 360000 },
        },
        results: { done: "reconnect_done" },
      },
      provides: ["reconnect_done"],
    },
    verify_version: {
      requires: ["robotIp", "robotPort", "reconnect_done", "expectedVersion"],
      resolver: {
        name: "MatchMovebaseVersionTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          expectedContent: "expectedVersion",
        },
        results: { done: "verify_done" },
      },
      provides: ["verify_done"],
    },
    cleanup: {
      requires: ["robotIp", "robotPort", "verify_done"],
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

const UPGRADE_BUP_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferBUPTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    script_transfer: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "TransferBUPScriptTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "script_transfer_done" },
      },
      provides: ["script_transfer_done"],
    },
    upgrade: {
      requires: ["robotIp", "robotPort", "script_transfer_done"],
      resolver: {
        name: "UpgradeBUPTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "upgrade_done" },
      },
      provides: ["upgrade_done"],
    },
    wait_reconnect: {
      requires: ["robotIp", "robotPort", "upgrade_done"],
      resolver: {
        name: "WaitSshReconnectTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          timeout: { value: 360000 },
        },
        results: { done: "reconnect_done" },
      },
      provides: ["reconnect_done"],
    },
    verify_version: {
      requires: ["robotIp", "robotPort", "reconnect_done", "expectedVersion"],
      resolver: {
        name: "MatchBUPVersionTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          expectedContent: "expectedVersion",
        },
        results: { done: "verify_done" },
      },
      provides: ["verify_done"],
    },
    cleanup: {
      requires: ["robotIp", "robotPort", "verify_done"],
      resolver: {
        name: "DeleteBUPTask",
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

const UPGRADE_BUP_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "DeleteBUPTask",
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

const MOVEBASE_DISK_CLEANUP_DAG: DagDefinition = {
  tasks: {
    cleanup: {
      requires: ["robotIp", "robotPort", "cleanUserHomes"],
      resolver: {
        name: "MovebaseDiskCleanupTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          cleanUserHomes: "cleanUserHomes",
        },
        results: { done: "cleanup_done" },
      },
      provides: ["cleanup_done"],
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

const APPLY_ALPHA2_MAP_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferAlpha2MapTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    apply: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "ApplyAlpha2MapTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "apply_done" },
      },
      provides: ["apply_done"],
    },
    delete_package: {
      requires: ["robotIp", "robotPort", "apply_done"],
      resolver: {
        name: "DeleteAlpha2MapTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "delete_done" },
      },
      provides: ["delete_done"],
    },
    wait: {
      requires: ["delete_done"],
      resolver: {
        name: "SleepTask",
        params: {
          sleepMs: { value: 30000 },
        },
        results: { done: "wait_done" },
      },
      provides: ["wait_done"],
    },
  },
};

const APPLY_ALPHA2_MAP_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "DeleteAlpha2MapTask",
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

const UPDATE_IOT_GATEWAY_CONFIG_DAG: DagDefinition = {
  tasks: {
    transfer_config: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "TransferIotGatewayConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    update_config: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "UpdateIotGatewayConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "update_done" },
      },
      provides: ["update_done"],
    },
    reboot: {
      requires: ["robotIp", "robotPort", "update_done"],
      resolver: {
        name: "RebootRobotTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          ignoreFailure: { value: true },
          retryCount: { value: 1 },
        },
        results: { done: "reboot_done" },
      },
      provides: ["reboot_done"],
    },
  },
};

const DOWNLOAD_ALPHA2_MAP_DAG: DagDefinition = {
  tasks: {
    download: {
      requires: ["robotIp", "robotPort", "localTargetDir"],
      resolver: {
        name: "SshFileDownloadTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          localTargetDir: "localTargetDir",
          remoteFilePath: { value: "/opt/cosmos/map/preview/sketch.zip" },
        },
        results: { done: "download_result" },
      },
      provides: ["download_result"],
    },
  },
};

const DEPLOY_APPLET_ENGINE_CONFIG_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferAppletEngineConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    deploy: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "DeployAppletEngineConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "deploy_done" },
      },
      provides: ["deploy_done"],
    },
  },
};

const DEPLOY_APPLET_ENGINE_CONFIG_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "DeleteAppletEngineConfigTask",
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

const INSTALL_APP_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferAppTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    install: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "InstallAppTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "install_done" },
      },
      provides: ["install_done"],
    },
  },
};

const INSTALL_APP_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "CleanupAppTask",
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

const DEPLOY_GGR3_CONFIG_DAG: DagDefinition = {
  tasks: {
    transfer: {
      requires: ["robotIp", "robotPort", "artifactId"],
      resolver: {
        name: "TransferGGR3ConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    deploy: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "DeployGGR3ConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "deploy_done" },
      },
      provides: ["deploy_done"],
    },
  },
};

const DEPLOY_GGR3_CONFIG_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "DeleteGGR3ConfigTask",
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

const INSTALL_DRAGONBALL3_DAG: DagDefinition = {
  tasks: {
    detect_reboot: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "WaitSshReconnectTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          timeout: { value: 600000 },
        },
        results: { done: "reboot_detected" },
      },
      provides: ["reboot_detected"],
    },
    transfer: {
      requires: ["robotIp", "robotPort", "reboot_detected", "artifactId"],
      resolver: {
        name: "TransferDragonball3Task",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    install: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "InstallDragonball3Task",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "install_done" },
      },
      provides: ["install_done"],
    },
    reboot: {
      requires: ["robotIp", "robotPort", "install_done"],
      resolver: {
        name: "RebootRobotTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          ignoreFailure: { value: true },
          retryCount: { value: 1 },
        },
        results: { done: "reboot_done" },
      },
      provides: ["reboot_done"],
    },
  },
};

const INSTALL_DRAGONBALL3_ERROR_DAG: DagDefinition = {
  tasks: {
    error_cleanup: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "DeleteDragonball3Task",
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

const SYNC_TIME_DAG: DagDefinition = {
  tasks: {
    sync: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "SyncTimeTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "sync_done" },
      },
      provides: ["sync_done"],
    },
  },
};

const UNINSTALL_L4T_DOWNLOADER_DAG: DagDefinition = {
  tasks: {
    uninstall: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "UninstallL4TDownloaderTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "uninstall_done" },
      },
      provides: ["uninstall_done"],
    },
  },
};

const FIX_BROKEN_PACKAGES_DAG: DagDefinition = {
  tasks: {
    fix: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "FixBrokenPackagesTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "fix_done" },
      },
      provides: ["fix_done"],
    },
  },
};

const FIX_ALPHA19_OTA_DAG: DagDefinition = {
  tasks: {
    detect_reboot: {
      requires: ["robotIp", "robotPort"],
      resolver: {
        name: "WaitSshReconnectTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          timeout: { value: 600000 },
        },
        results: { done: "reboot_detected" },
      },
      provides: ["reboot_detected"],
    },
    transfer: {
      requires: ["robotIp", "robotPort", "reboot_detected", "artifactId"],
      resolver: {
        name: "TransferDragonball3Task",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          artifactId: "artifactId",
        },
        results: { done: "transfer_done" },
      },
      provides: ["transfer_done"],
    },
    install: {
      requires: ["robotIp", "robotPort", "transfer_done"],
      resolver: {
        name: "InstallDragonball3Task",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "install_done" },
      },
      provides: ["install_done"],
    },
    transfer_iot_config: {
      requires: ["robotIp", "robotPort", "install_done"],
      resolver: {
        name: "TransferIotGatewayConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "iot_transfer_done" },
      },
      provides: ["iot_transfer_done"],
    },
    update_iot_config: {
      requires: ["robotIp", "robotPort", "iot_transfer_done"],
      resolver: {
        name: "UpdateIotGatewayConfigTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "iot_update_done" },
      },
      provides: ["iot_update_done"],
    },
    fix: {
      requires: ["robotIp", "robotPort", "iot_update_done"],
      resolver: {
        name: "FixBrokenPackagesTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "fix_done" },
      },
      provides: ["fix_done"],
    },
    sync_time: {
      requires: ["robotIp", "robotPort", "fix_done"],
      resolver: {
        name: "SyncTimeTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "sync_done" },
      },
      provides: ["sync_done"],
    },
    uninstall_l4t: {
      requires: ["robotIp", "robotPort", "sync_done"],
      resolver: {
        name: "UninstallL4TDownloaderTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
        },
        results: { done: "uninstall_done" },
      },
      provides: ["uninstall_done"],
    },
    reboot: {
      requires: ["robotIp", "robotPort", "uninstall_done"],
      resolver: {
        name: "RebootRobotTask",
        params: {
          robotIp: "robotIp",
          robotPort: "robotPort",
          ignoreFailure: { value: true },
          retryCount: { value: 1 },
        },
        results: { done: "reboot_done" },
      },
      provides: ["reboot_done"],
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
      dag: UPGRADE_BUP_DAG,
      expectedResults: ["cleanup_done"],
      errorDag: UPGRADE_BUP_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "Artifact file",
          required: true,
        },
        expectedVersion: {
          type: "text",
          label: "Expected version",
          required: true,
        },
      },
    },
    {
      type: "movebase-disk-cleanup",
      name: "Movebase Disk Cleanup",
      description: "Clean residual disk files after Alpha2 Movebase upgrades.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more Alpha2 Movebase robots that require post-upgrade disk cleanup.",
      },
      dag: MOVEBASE_DISK_CLEANUP_DAG,
      expectedResults: ["cleanup_done"],
      params: {
        cleanUserHomes: {
          type: "checkbox",
          label: "Clean /home/developer and /home/factory user-generated files",
          required: true,
          defaultValue: "false",
          description:
            "Disabled by default because home directories may contain FAE or factory files that require confirmation before removal.",
        },
      },
    },
    {
      type: "upgrade-movebase",
      name: "Upgrade Movebase",
      description: "Upgrade the Movebase software on selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to upgrade Movebase software.",
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
        expectedVersion: {
          type: "text",
          label: "Expected version",
          required: true,
        },
      },
    },
    {
      type: "apply-alpha2-map",
      name: "Apply Alpha2 Map",
      description: "Apply an Alpha2 format map package to selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to apply the Alpha2 map.",
      },
      dag: APPLY_ALPHA2_MAP_DAG,
      expectedResults: ["wait_done"],
      errorDag: APPLY_ALPHA2_MAP_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "Artifact file",
          required: true,
        },
      },
    },
    {
      type: "update-iot-gateway-config",
      name: "Update IoT Gateway Config",
      description: "Update iot-gateway configuration and restart related services on selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to update iot-gateway configuration.",
      },
      dag: UPDATE_IOT_GATEWAY_CONFIG_DAG,
      expectedResults: ["reboot_done"],
      params: {},
    },
    {
      type: "download-alpha2-map",
      name: "Download Alpha2 Map",
      description: "Download the Alpha2 map package from the selected robot to a local directory.",
      robotSelection: {
        mode: "single",
        description:
          "Select one target robot to download the map package from.",
      },
      dag: DOWNLOAD_ALPHA2_MAP_DAG,
      expectedResults: ["download_result"],
      params: {
        localTargetDir: {
          type: "text",
          label: "Local target directory",
          required: true,
          defaultValue: "/tmp",
          description:
            "Directory on this machine where map.zip will be saved.",
        },
      },
    },
    {
      type: "deploy-applet-engine-config",
      name: "Deploy AppletEngine Config",
      description:
        "Deploy an AppletEngine config package to /opt/cosmos/bin/applet-engine and restart the AppletEngine service.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to deploy the AppletEngine config package.",
      },
      dag: DEPLOY_APPLET_ENGINE_CONFIG_DAG,
      expectedResults: ["deploy_done"],
      errorDag: DEPLOY_APPLET_ENGINE_CONFIG_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "AppletEngine config package",
          required: true,
        },
      },
    },
    {
      type: "install-app",
      name: "Install App",
      description: "Install or upgrade an app on selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to install the app.",
      },
      dag: INSTALL_APP_DAG,
      expectedResults: ["install_done"],
      errorDag: INSTALL_APP_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "Artifact file",
          required: true,
        },
      },
    },
    {
      type: "deploy-ggr3-config",
      name: "Deploy GGR3 Config",
      description:
        "Upload a GGR3 config package to the robot, extract it, and push it to the Android target directory via ADB.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to deploy the GGR3 config package.",
      },
      dag: DEPLOY_GGR3_CONFIG_DAG,
      expectedResults: ["deploy_done"],
      errorDag: DEPLOY_GGR3_CONFIG_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "GGR3 Config Package",
          required: true,
        },
      },
    },
    {
      type: "install-dragonball3",
      name: "Install Dragonball3 firmware",
      description:
        "Reinstall the dragonball3 firmware on selected robots. The task waits for a manual robot reboot, then transfers, installs, and triggers another reboot.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to reinstall the dragonball3 firmware.",
      },
      dag: INSTALL_DRAGONBALL3_DAG,
      expectedResults: ["reboot_done"],
      errorDag: INSTALL_DRAGONBALL3_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "Dragonball3 firmware package (.deb)",
          required: true,
        },
      },
    },
    {
      type: "sync-time",
      name: "Sync Time",
      description: "Synchronize robot system time with the current PC time.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to synchronize their system time.",
      },
      dag: SYNC_TIME_DAG,
      expectedResults: ["sync_done"],
      params: {},
    },
    {
      type: "uninstall-l4t-downloader",
      name: "Uninstall L4TDownloader",
      description:
        "Completely remove the l4t-downloader package and its configuration files from selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to uninstall l4t-downloader.",
      },
      dag: UNINSTALL_L4T_DOWNLOADER_DAG,
      expectedResults: ["uninstall_done"],
      params: {},
    },
    {
      type: "fix-broken-packages",
      name: "Fix Broken Packages",
      description:
        "Fix interrupted or broken dpkg/apt package installations on selected robots.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more target robots to fix broken packages.",
      },
      dag: FIX_BROKEN_PACKAGES_DAG,
      expectedResults: ["fix_done"],
      params: {},
    },
    {
      type: "fix-alpha19-ota",
      name: "Fix Alpha1.9 OTA Environment",
      description:
        "Repair the Alpha1.9 OTA environment by fixing broken packages, reinstalling dragonball3 firmware, updating iot-gateway configuration, syncing time, and removing l4t-downloader.",
      robotSelection: {
        mode: "multiple",
        description:
          "Select one or more Alpha1.9 target robots to repair the OTA environment.",
      },
      dag: FIX_ALPHA19_OTA_DAG,
      expectedResults: ["reboot_done"],
      errorDag: INSTALL_DRAGONBALL3_ERROR_DAG,
      params: {
        artifactId: {
          type: "artifact",
          label: "Dragonball3 firmware package (.deb)",
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
