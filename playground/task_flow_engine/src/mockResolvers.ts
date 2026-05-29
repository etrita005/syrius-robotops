import type { ValueMap, ITaskResolver } from "flowed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MockTaskBase implements ITaskResolver {
  protected className: string;

  constructor(className: string) {
    this.className = className;
  }

  async exec(params: ValueMap): Promise<ValueMap> {
    const name = (params.name as string) ?? "UnnamedTask";
    const iterations = (params.iterations as number) ?? 3;

    for (let i = 1; i <= iterations; i++) {
      const sleepMs = Math.floor(Math.random() * 5000) + 5000; // 5-10s
      await sleep(sleepMs);
      console.log(
        `[${new Date().toISOString()}] [${this.className}] ${name}: iteration ${i}/${iterations}`
      );
    }

    return { done: true };
  }
}

export class MockTask1 extends MockTaskBase {
  constructor() {
    super("MockTask1");
  }
}

export class MockTask2 extends MockTaskBase {
  constructor() {
    super("MockTask2");
  }
}

export class MockTask3 extends MockTaskBase {
  constructor() {
    super("MockTask3");
  }
}

export const mockResolvers: Record<string, typeof MockTask1> = {
  MockTask1,
  MockTask2,
  MockTask3,
};
