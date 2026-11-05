import type { TaskResolverClass } from "flowed";
import type { RobotService } from "./robotService.js";
import { createLogger } from "../logger/index.js";

const log = createLogger("RobotPowerService");

export type RobotPowerAction = "shutdown" | "reboot";

export interface RobotPowerResult {
  robotId: string;
  action: RobotPowerAction;
}

export class RobotPowerService {
  constructor(
    private readonly robotService: RobotService,
    private readonly powerTaskClass: TaskResolverClass
  ) {}

  async execute(
    solutionId: string,
    robotId: string,
    action: RobotPowerAction
  ): Promise<RobotPowerResult> {
    const robot = await this.robotService.get(solutionId, robotId);

    log.info({ solutionId, robotId, action, address: robot.address, port: robot.port }, "Executing robot power action");

    const task = new this.powerTaskClass();
    await task.exec(
      { robotIp: robot.address, robotPort: robot.port, powerAction: action },
      { flowId: `robot-power-${robotId}` }
    );

    log.info({ solutionId, robotId, action }, "Robot power action completed");

    return { robotId, action };
  }
}
