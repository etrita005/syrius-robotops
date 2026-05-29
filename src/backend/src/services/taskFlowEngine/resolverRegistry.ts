import type { TaskResolverClass } from "flowed";

export class ResolverRegistry {
  private resolvers = new Map<string, TaskResolverClass>();

  register(name: string, resolverClass: TaskResolverClass): void {
    this.resolvers.set(name, resolverClass);
  }

  get(name: string): TaskResolverClass | undefined {
    return this.resolvers.get(name);
  }

  getAll(): Record<string, TaskResolverClass> {
    const result: Record<string, TaskResolverClass> = {};
    for (const [name, cls] of this.resolvers) {
      result[name] = cls;
    }
    return result;
  }

  has(name: string): boolean {
    return this.resolvers.has(name);
  }
}
