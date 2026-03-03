import * as vscode from 'vscode';
import { Tool, jsonSchema } from 'ai';
import { logger } from '../../common/logger';

export class ToolOrchestrator {
  /**
   * Prepares VS Code host tools in AI SDK format.
   */
  async prepareTools(
    options: vscode.ProvideLanguageModelChatResponseOptions | undefined
  ): Promise<Record<string, Tool>> {
    const tools: Record<string, Tool> = {};

    // VS Code Host Tools (definition only, as VS Code handles execution)
    // @ts-ignore
    const providedTools = (options as any)?.tools as vscode.LanguageModelChatTool[] | undefined;
    if (providedTools) {
      for (const tool of providedTools) {
        try {
          const schema = tool.inputSchema
            ? JSON.parse(JSON.stringify(tool.inputSchema))
            : { type: 'object', properties: {} };
          tools[tool.name] = {
            description: tool.description,
            inputSchema: jsonSchema(schema),
          } as any;
        } catch (e) {
          logger.error(`Failed to register host tool ${tool.name}`, e);
        }
      }
    }

    return tools;
  }
}
