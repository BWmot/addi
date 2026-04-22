import type { JSONSchema7 } from "ai";

/**
 * Custom Tool 定义
 */

export interface ToolStep {
  name?: string;
  id?: string;
  if?: string;
  env?: Record<string, string>;
  shell?: string;
  // `run` can be a string (script) or a structured command.
  // If string, it will be executed in a shell.
  run?:
    | string
    | {
        command: string;
        args?: string[];
      };
}

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  parameters: JSONSchema7; // JSON Schema object
  steps: ToolStep[];
  source?: "global" | "workspace";
  visibility?: "public" | "private" | "global";
  fileName?: string;
}
