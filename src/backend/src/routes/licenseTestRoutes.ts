import { Hono } from "hono";
import type { ILicenseTestService } from "../services/licenseTestService.js";
import {
  NoSessionError,
  InvalidArgumentError,
  RobotConnectionError,
  RobotCommandError,
  RobotTimeoutError,
} from "../services/licenseTestService.js";
import {
  VALID_LICENSE_TYPES,
  LICENSE_KEY_LICENSES,
  LICENSE_KEY_TYPE,
  LICENSE_KEY_AUTH_START,
} from "../types/licenseTest.js";
import type {
  ConnectRequest,
  ConnectResponse,
  SessionResponse,
  ReadResponse,
  ApplyRequest,
  ApplyResponse,
} from "../types/licenseTest.js";

function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== "string") return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6 = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv4.test(ip) || ipv6.test(ip);
}

function isValidPort(port: unknown): port is number {
  return typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function createLicenseTestRoutes(service: ILicenseTestService): Hono {
  const router = new Hono();

  router.post("/connect", async (c) => {
    let body: ConnectRequest;
    try {
      body = await c.req.json<ConnectRequest>();
    } catch {
      return c.json({ error: "INVALID_JSON", message: "Request body must be valid JSON." }, 400);
    }

    const { robotIp, robotPort } = body;

    if (!isValidIp(robotIp)) {
      return c.json(
        { error: "INVALID_IP", message: "Invalid IP address. Provide a valid IPv4 or IPv6 address." },
        400
      );
    }

    const port = robotPort ?? 22;
    if (!isValidPort(port)) {
      return c.json(
        { error: "INVALID_PORT", message: "Invalid port. Must be an integer between 1 and 65535." },
        400
      );
    }

    try {
      const config = await service.connect(robotIp, port);
      const response: ConnectResponse = {
        connected: true,
        robotIp,
        robotPort: port,
        config,
      };
      return c.json(response);
    } catch (err) {
      if (err instanceof RobotConnectionError) {
        return c.json(
          { error: "ROBOT_UNREACHABLE", message: err.message },
          502
        );
      }
      if (err instanceof RobotTimeoutError) {
        return c.json(
          { error: "ROBOT_TIMEOUT", message: err.message },
          504
        );
      }
      if (err instanceof RobotCommandError) {
        return c.json(
          { error: "ROBOT_COMMAND_FAILED", message: err.message },
          502
        );
      }
      throw err;
    }
  });

  router.post("/disconnect", async (c) => {
    await service.disconnect();
    return c.json({ connected: false });
  });

  router.get("/session", async (c) => {
    const session = await service.getSession();
    if (!session) {
      const response: SessionResponse = { connected: false };
      return c.json(response);
    }
    const response: SessionResponse = {
      connected: true,
      robotIp: session.robotIp,
      robotPort: session.robotPort,
    };
    return c.json(response);
  });

  router.post("/read", async (c) => {
    try {
      const config = await service.readConfig();
      const response: ReadResponse = { config };
      return c.json(response);
    } catch (err) {
      if (err instanceof NoSessionError) {
        return c.json(
          { error: "NO_SESSION", message: err.message },
          400
        );
      }
      if (err instanceof RobotCommandError) {
        return c.json(
          { error: "ROBOT_COMMAND_FAILED", message: err.message },
          502
        );
      }
      if (err instanceof RobotTimeoutError) {
        return c.json(
          { error: "ROBOT_TIMEOUT", message: err.message },
          504
        );
      }
      throw err;
    }
  });

  router.post("/apply", async (c) => {
    let body: ApplyRequest;
    try {
      body = await c.req.json<ApplyRequest>();
    } catch {
      return c.json({ error: "INVALID_JSON", message: "Request body must be valid JSON." }, 400);
    }

    const { config } = body;

    if (!config || typeof config !== "object") {
      return c.json(
        { error: "INVALID_CONFIG", message: "Request body must contain a 'config' object." },
        400
      );
    }

    if (config[LICENSE_KEY_LICENSES] !== undefined) {
      const v = config[LICENSE_KEY_LICENSES];
      if (typeof v !== "string" || !/^\d+$/.test(v) || Number(v) < 0) {
        return c.json(
          { error: "INVALID_LICENSES", message: `'${LICENSE_KEY_LICENSES}' must be a string containing a non-negative integer.` },
          400
        );
      }
    }

    if (config[LICENSE_KEY_TYPE] !== undefined) {
      if (!VALID_LICENSE_TYPES.includes(config[LICENSE_KEY_TYPE])) {
        return c.json(
          {
            error: "INVALID_LICENSE_TYPE",
            message: `'${LICENSE_KEY_TYPE}' must be one of: ${VALID_LICENSE_TYPES.join(", ")}.`,
          },
          400
        );
      }
    }

    if (config[LICENSE_KEY_AUTH_START] !== undefined) {
      const ts = config[LICENSE_KEY_AUTH_START];
      if (typeof ts !== "string" || ts.trim() === "") {
        return c.json(
          { error: "INVALID_AUTH_START", message: `'${LICENSE_KEY_AUTH_START}' must be a non-empty string.` },
          400
        );
      }
    }

    try {
      await service.applyConfig(config);
      const response: ApplyResponse = { applied: true };
      return c.json(response);
    } catch (err) {
      if (err instanceof NoSessionError) {
        return c.json(
          { error: "NO_SESSION", message: err.message },
          400
        );
      }
      if (err instanceof InvalidArgumentError) {
        return c.json(
          { error: "INVALID_ARGUMENT", message: err.message },
          400
        );
      }
      if (err instanceof RobotCommandError) {
        return c.json(
          { error: "ROBOT_COMMAND_FAILED", message: err.message },
          502
        );
      }
      if (err instanceof RobotTimeoutError) {
        return c.json(
          { error: "ROBOT_TIMEOUT", message: err.message },
          504
        );
      }
      throw err;
    }
  });

  return router;
}
