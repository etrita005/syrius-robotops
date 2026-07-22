import {
  ILicenseTestService,
  NoSessionError,
  InvalidArgumentError,
} from "./licenseTestService.js";
import {
  LicenseConfig,
  LicenseTestSession,
  VALID_LICENSE_TYPES,
  LICENSE_KEY_LICENSES,
  LICENSE_KEY_TYPE,
  LICENSE_KEY_AUTH_START,
} from "../types/licenseTest.js";
import { createLogger } from "../logger/index.js";

const DEFAULT_MOCK_CONFIG: LicenseConfig = {
  [LICENSE_KEY_LICENSES]: "100",
  [LICENSE_KEY_TYPE]: "Trial",
  [LICENSE_KEY_AUTH_START]: "2024-01-15T08:30:00Z",
};

export class MockLicenseTestService implements ILicenseTestService {
  private session: LicenseTestSession | null = null;
  private config: LicenseConfig = { ...DEFAULT_MOCK_CONFIG };
  private log = createLogger("MockLicenseTest");

  private requireSession(): LicenseTestSession {
    if (!this.session) {
      throw new NoSessionError();
    }
    return this.session;
  }

  async connect(ip: string, port: number): Promise<LicenseConfig> {
    if (this.session) {
      this.log.warn(
        { previousIp: this.session.robotIp, newIp: ip },
        "Replacing existing robot session (mock)"
      );
    }

    this.log.info({ ip, port }, "Connecting to robot (mock)");
    await new Promise((r) => setTimeout(r, 500));

    this.session = {
      robotIp: ip,
      robotPort: port,
      connectedAt: Date.now(),
    };

    this.config = {
      ...DEFAULT_MOCK_CONFIG,
      [LICENSE_KEY_AUTH_START]: new Date().toISOString(),
    };

    this.log.info({ ip, port }, "Connected to robot (mock), returning mock config");
    return { ...this.config };
  }

  async disconnect(): Promise<void> {
    if (this.session) {
      this.log.info(
        { ip: this.session.robotIp, port: this.session.robotPort },
        "Disconnecting robot session (mock)"
      );
    }
    this.session = null;
  }

  async getSession(): Promise<LicenseTestSession | null> {
    return this.session;
  }

  async readConfig(): Promise<LicenseConfig> {
    this.requireSession();
    this.log.info({ config: this.config }, "Reading license config (mock)");
    return { ...this.config };
  }

  async applyConfig(config: LicenseConfig): Promise<void> {
    this.requireSession();

    if (!VALID_LICENSE_TYPES.includes(config[LICENSE_KEY_TYPE])) {
      throw new InvalidArgumentError(
        `Invalid license type '${config[LICENSE_KEY_TYPE]}'. Must be one of: ${VALID_LICENSE_TYPES.join(", ")}`
      );
    }

    const licensesNum = Number(config[LICENSE_KEY_LICENSES]);
    if (!Number.isInteger(licensesNum) || licensesNum < 0) {
      throw new InvalidArgumentError(
        `Invalid license count '${config[LICENSE_KEY_LICENSES]}'. Must be a non-negative integer.`
      );
    }

    this.config = { ...config };
    this.log.info({ config: this.config }, "Applied license config (mock)");
  }
}
