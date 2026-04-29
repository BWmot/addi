import { randomUUID } from "crypto";

/**
 * ID 生成器
 */
export class IdGenerator {
  static generate(): string {
    return randomUUID();
  }
}
