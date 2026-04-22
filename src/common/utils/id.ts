import { randomUUID } from "crypto";

/**
 * ID 生成器
 */
export class IdGenerator {
  static generate(): string {
    try {
      if (typeof randomUUID === "function") {
        return randomUUID();
      }
    } catch {
      /* noop */
    }
    const timeFragment = Date.now().toString(36);
    const randomFragment = Math.random().toString(36).slice(2, 10);
    return `${timeFragment}-${randomFragment}`;
  }
}
