import type { ITaskResolver, OptPromise, ValueMap } from "flowed";
import type { Task as FlowedTask } from "flowed";
import { logger as rootLogger, type Logger } from "../logger/index.js";

const ON_INIT_FALSE_MESSAGE = "onInitialize returned false";
const STANDALONE_FLOW_ID = "<standalone>";
const UNKNOWN_TASK_CODE = "<unknown>";
const DEFAULT_FLOW_PHASE: "main" | "error" = "main";

export interface BaseTaskFailureBody extends ValueMap {
  done: true;
  success: false;
  ignored: true;
  error: string;
}

/**
 * Abstract base class for all backend task resolvers. Implements the
 * Flowed ITaskResolver contract and orchestrates the lifecycle:
 * onInitialize -> onExec -> onDestroy.
 *
 * Subclasses MUST NOT override `exec`; override `onInitialize`,
 * `onExec`, or `onDestroy` instead.
 *
 * See documents/design/backend_base_task_design.md for the full design
 * and documents/requirements/backend_base_task_requirements.md for
 * the requirements this base class satisfies.
 */
export abstract class BaseTask implements ITaskResolver {
  public readonly name: string;
  protected log: Logger;

  constructor() {
    this.name = this.constructor.name;
    // Fallback child logger so `this.log` is safe to use even before
    // `exec` is invoked (e.g. inside subclass constructors).
    this.log = rootLogger.child({ name: this.name });
  }

  protected onInitialize(): OptPromise<boolean> {
    return true;
  }

  protected onExec(_params: ValueMap, _context?: ValueMap): OptPromise<ValueMap> {
    return {};
  }

  protected onDestroy(): OptPromise<void> {
    return;
  }

  public async exec(
    params: ValueMap,
    context?: ValueMap,
    task?: FlowedTask
  ): Promise<ValueMap> {
    const ignoreFailure = (params as ValueMap | undefined)?.ignoreFailure === true;
    const flowId =
      typeof context?.flowId === "string" || typeof context?.flowId === "number"
        ? (context.flowId as string)
        : STANDALONE_FLOW_ID;
    const flowPhase =
      context?.flowPhase === "error" ? "error" : DEFAULT_FLOW_PHASE;
    const taskCode =
      typeof task?.code === "string" && task.code.length > 0
        ? task.code
        : UNKNOWN_TASK_CODE;

    this.log = rootLogger.child({
      flowId,
      flowPhase,
      name: this.name,
      taskCode,
    });

    let failure: Error | undefined;
    let result: ValueMap = {};

    try {
      const initOk = await this.onInitialize();
      if (initOk === false) {
        failure = new Error(ON_INIT_FALSE_MESSAGE);
      } else {
        result = await this.onExec(params, context);
      }
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    }

    try {
      await this.onDestroy();
    } catch (destroyErr) {
      const e = destroyErr instanceof Error ? destroyErr : new Error(String(destroyErr));
      this.log.error({ err: e.message, stack: e.stack }, "onDestroy threw");
      // Cleanup failure does not change the final task verdict.
    }

    if (!failure) {
      return result;
    }

    if (ignoreFailure) {
      this.log.warn(
        { err: failure.message },
        "Task failed (ignored due to ignoreFailure)"
      );
      const body: BaseTaskFailureBody = {
        done: true,
        success: false,
        ignored: true,
        error: failure.message,
      };
      return body;
    }

    this.log.error(
      { err: failure.message, stack: failure.stack },
      "Task failed"
    );
    throw failure;
  }
}
