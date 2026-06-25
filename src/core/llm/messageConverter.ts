import * as vscode from "vscode";
import type { ModelMessage, UserContent, ToolContent, AssistantContent } from "ai";
import { logger, LogScope } from "../../common/logger";
import type { ModelCapabilities } from "../../common/types";


// Extended proposed API interface per coding-standards §1.2
interface DataPartExtended extends vscode.LanguageModelDataPart {
  data?: unknown;
  mediaType?: string;
}

// AI SDK tool result output type
type ToolResultOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: unknown }
  | { type: "content"; value: unknown[] };
export class MessageConverter {
  static async toAiCoreMessages(
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    capabilities?: ModelCapabilities,
  ): Promise<ModelMessage[]> {
    const coreMessages: ModelMessage[] = [];

    // Optimization: Build a map of toolCallId -> toolName once to avoid O(N*M) lookups
    const toolCallMap = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
        for (const part of msg.content) {
          if (part instanceof vscode.LanguageModelToolCallPart) {
            toolCallMap.set(part.callId, part.name);
          }
        }
      }
    }

    for (const msg of messages) {
      if (msg.role === vscode.LanguageModelChatMessageRole.User) {
        const userContent: UserContent = [];
        const toolResults: vscode.LanguageModelToolResultPart[] = [];

        for (const part of msg.content) {
          if (part instanceof vscode.LanguageModelTextPart) {
            userContent.push({ type: "text", text: part.value });
          } else if (part instanceof vscode.LanguageModelDataPart) {
            // @ts-expect-error: vscode.LanguageModelDataPart.value might be missing in types
            const data = part.value || (part as DataPartExtended).data;
            const mime = part.mimeType || (part as DataPartExtended).mediaType || "application/octet-stream";

            if (mime.startsWith("image/")) {
              if (capabilities?.vision === false) {
                userContent.push({
                  type: "text",
                  text: "[Image Content - Not Supported by Model]",
                });
              } else {
                userContent.push({ type: "image", image: data });
              }
            } else if (mime.startsWith("audio/")) {
              userContent.push({ type: "text", text: "[Audio Content]" });
            } else if (mime.startsWith("video/")) {
              userContent.push({ type: "text", text: "[Video Content]" });
            }
          } else if (part instanceof vscode.LanguageModelToolResultPart) {
            toolResults.push(part);
          }
        }

        // 1. 先处理 Tool Results (作为单独的 Tool Message)
        if (toolResults.length > 0) {
          const toolContent: ToolContent = [];

          for (const tr of toolResults) {
            const toolName = toolCallMap.get(tr.callId) || "unknown";

            // If we can't find the tool name, it means the tool call message is missing from history.
            // We should skip this result to avoid confusing the AI model or causing errors (like "text part not found" from ai-sdk).
            if (toolName === "unknown") {
              logger.warn(
                `Dropping orphan tool result for callId: ${tr.callId} (No matching tool call found in history)`,
                undefined,
                LogScope.MSG_CONVERTER,
              );
              continue;
            }

            // Check for images or mixed content
            const hasImage = tr.content.some((c) => c instanceof vscode.LanguageModelDataPart);

            let output: ToolResultOutput;

            if (hasImage) {
              const contentParts = tr.content
                .map((c) => {
                  if (c instanceof vscode.LanguageModelTextPart) {
                    return { type: "text", text: c.value };
                  } else if (c instanceof vscode.LanguageModelDataPart) {
                    // @ts-expect-error -- VS Code proposed API may not expose .data in stable typings
                    const data = c.value || (c as DataPartExtended).data;
                    const base64 =
                      data instanceof Uint8Array
                        ? MessageConverter.uint8ArrayToBase64(data)
                        : Buffer.from(data).toString("base64");
                    return {
                      type: "file-data",
                      data: base64,
                      mediaType: c.mimeType,
                    };
                  }
                  return null;
                })
                .filter((p) => p !== null);
              output = { type: "content", value: contentParts };
            } else {
              // 提取结果文本
              const resultText = tr.content
                .map((c) => {
                  if (c instanceof vscode.LanguageModelTextPart) {
                    return c.value;
                  }
                  return "";
                })
                .join("");

              output = { type: "text", value: resultText || "Success" };
              // Try to parse as JSON if it looks like JSON (starts with { or [)
              const trimmed = resultText.trim();
              if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length < 100000) {
                try {
                  const json = JSON.parse(resultText);
                  if (typeof json === "object" && json !== null) {
                    output = { type: "json", value: json };
                  }
                } catch (e) {
                  // Not valid JSON, keep as text
                }
              }
            }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
            toolContent.push({
              type: "tool-result",
              toolCallId: tr.callId,
              toolName: toolName,
              output: output,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          }

          if (toolContent.length > 0) {
            coreMessages.push({ role: "tool", content: toolContent });
          }
        }

        // 2. 再处理 User Content (Text/Image)
        if (userContent.length > 0) {
          coreMessages.push({ role: "user", content: userContent });
        }
      } else if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
        const content: AssistantContent = [];

        // 检测是否支持 ThinkingPart (LanguageModelChatMessage2)
        const hasThinkingSupport = "LanguageModelThinkingPart" in vscode;

        for (const part of msg.content) {
          if (part instanceof vscode.LanguageModelTextPart) {
            content.push({ type: "text", text: part.value });
          } else if (part instanceof vscode.LanguageModelToolCallPart) {
            content.push({
              type: "tool-call",
              toolCallId: part.callId,
              toolName: part.name,
              input: part.input,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          } else if (hasThinkingSupport && part instanceof vscode.LanguageModelThinkingPart) {
            // 处理 Reasoning/Thinking part
            // AI SDK v4 CoreAssistantMessage 中 reasoning part 的字段名为 text
            const thinkingValue = part.value;
            const reasoning = Array.isArray(thinkingValue)
              ? thinkingValue.join("")
              : thinkingValue || "";
            if (reasoning) {
              content.push({ type: "reasoning", text: reasoning });
            }
          }
        }

        // Ensure assistant message has content
        if (content.length > 0) {
          coreMessages.push({ role: "assistant", content });
        } else {
          // If empty, maybe skip or add placeholder?
          // VS Code might send empty assistant message if it's just a placeholder?
          // Let's log warning
          logger.warn(
            "Encountered empty assistant message, skipping.",
            undefined,
            LogScope.MSG_CONVERTER,
          );
        }
      }
    }

    return coreMessages;
  }

  /**
   * 将 AI SDK ModelMessage 转换为 VS Code 的 LanguageModelChatRequestMessage
   * 用于反向转换场景（如保存对话历史）
   *
   * P0-02 修复：保留 AI SDK reasoning part → VS Code LanguageModelThinkingPart，
   * 避免反向转换过程中推理/思考内容的丢失。仅在 VS Code 支持
   * LanguageModelChatMessage2 + LanguageModelThinkingPart 时生效。
   */
  static fromAiCoreMessage(
    message: ModelMessage,
  ): vscode.LanguageModelChatMessage | vscode.LanguageModelChatMessage2 {
    const role =
      message.role === "user"
        ? vscode.LanguageModelChatMessageRole.User
        : vscode.LanguageModelChatMessageRole.Assistant;

    // 检查是否支持 LanguageModelChatMessage2（含 ThinkingPart 支持）
    const useChatMessage2 = "LanguageModelChatMessage2" in vscode;
    const hasThinkingSupport = "LanguageModelThinkingPart" in vscode;

    if (typeof message.content === "string") {
      // 简单文本内容
      if (useChatMessage2) {
        return new vscode.LanguageModelChatMessage2(
          role,
          message.content,
        );
      }
      if (role === vscode.LanguageModelChatMessageRole.User) {
        return vscode.LanguageModelChatMessage.User(message.content);
      }
      return vscode.LanguageModelChatMessage.Assistant(message.content);
    }

    // ─── 多部分内容：构建包含 text + reasoning 的混合 parts 数组 ───
    // 使用联合类型以同时容纳 LanguageModelTextPart 和 LanguageModelThinkingPart
    const parts: (
      | vscode.LanguageModelTextPart
      | vscode.LanguageModelThinkingPart
    )[] = [];

    for (const part of message.content) {
      if (part.type === "text") {
        parts.push(new vscode.LanguageModelTextPart(part.text));
      } else if (part.type === "reasoning" && hasThinkingSupport) {
        // P0-02: 将 AI SDK reasoning part 转换为 VS Code LanguageModelThinkingPart
        const text = typeof part.text === "string" ? part.text : "";
        parts.push(new vscode.LanguageModelThinkingPart(text));
      }
      // tool-call parts 需要更复杂的处理，暂略
    }

    if (useChatMessage2) {
      // 使用构造函数（而非静态工厂方法）传递 parts 数组，
      // 因为 LanguageModelChatMessage2 的构造函数签名包含
      // LanguageModelThinkingPart，而静态工厂方法 Assistant() 不包含。
      return new vscode.LanguageModelChatMessage2(role, parts);
    }

    // Fallback: LanguageModelChatMessage（不支持 ThinkingPart）
    // 过滤出纯文本 parts
    const textParts = parts.filter(
      (p): p is vscode.LanguageModelTextPart =>
        p instanceof vscode.LanguageModelTextPart,
    );
    if (role === vscode.LanguageModelChatMessageRole.User) {
      return vscode.LanguageModelChatMessage.User(textParts);
    }
    return vscode.LanguageModelChatMessage.Assistant(textParts);
  }

  static mapChatRole(role: vscode.LanguageModelChatMessageRole): string {
    return role === vscode.LanguageModelChatMessageRole.User ? "user" : "assistant";
  }

  static uint8ArrayToBase64(array: Uint8Array): string {
    return Buffer.from(array).toString("base64");
  }

  static extractToolCallFromParts(
    parts: readonly unknown[],
  ): { name: string; arguments: string; id?: string } | undefined {
    for (const part of parts) {
      if (part instanceof vscode.LanguageModelToolCallPart) {
        return {
          name: part.name,
          arguments: JSON.stringify(part.input),
          id: part.callId,
        };
      }
      if (!part || typeof part !== "object") {
        continue;
      }
      const candidate = part as Record<string, unknown>;
      const name = typeof candidate["name"] === "string" ? candidate["name"] : undefined;
      const argsRaw = candidate["arguments"] ?? candidate["input"];
      if (!name) {
        continue;
      }
      if (argsRaw === undefined) {
        continue;
      }
      const id =
        typeof candidate["callId"] === "string"
          ? candidate["callId"]
          : typeof candidate["id"] === "string"
            ? candidate["id"]
            : undefined;
      const args = typeof argsRaw === "string" ? argsRaw : JSON.stringify(argsRaw ?? {});
      const result: { name: string; arguments: string; id?: string } = {
        name,
        arguments: args,
      };
      if (id) {
        result.id = id;
      }
      return result;
    }
    return undefined;
  }

  static extractToolResultFromParts(
    parts: readonly unknown[],
  ): { id?: string; content: string } | undefined {
    for (const part of parts) {
      if (part instanceof vscode.LanguageModelToolResultPart) {
        const content = part.content
          .map((p) => {
            if (p instanceof vscode.LanguageModelTextPart) {
              return p.value;
            }
            return "";
          })
          .join("");
        return { id: part.callId, content };
      }
      if (!part || typeof part !== "object") {
        continue;
      }
      const candidate = part as Record<string, unknown>;
      const id =
        typeof candidate["callId"] === "string"
          ? candidate["callId"]
          : typeof candidate["toolCallId"] === "string"
            ? candidate["toolCallId"]
            : typeof candidate["id"] === "string"
              ? candidate["id"]
              : undefined;
      if (!id) {
        continue;
      }
      const payload = candidate["result"] ?? candidate["output"] ?? candidate["content"];
      const content = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
      return { id, content };
    }
    return undefined;
  }

  static extractSystemMessage(messages: readonly vscode.LanguageModelChatRequestMessage[]): string {
    for (const msg of messages) {
      if (msg.name === "system") {
        if (typeof msg.content === "string") {
          return msg.content;
        }
        if (Array.isArray(msg.content)) {
          return (msg.content as Array<unknown>)
            .filter(
              (p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart,
            )
            .map((p) => p.value)
            .join("");
        }
        return String(msg.content);
      }
    }
    return "";
  }

  static summarizeMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): {
    total: number;
    byRole: Record<string, number>;
    toolCallMessages: number;
    toolResultMessages: number;
    textCharacters: number;
    attachmentParts: number;
    thinkingParts: number;
  } {
    const summary = {
      total: messages.length,
      byRole: {} as Record<string, number>,
      toolCallMessages: 0,
      toolResultMessages: 0,
      textCharacters: 0,
      attachmentParts: 0,
      thinkingParts: 0,
    };

    const hasThinkingSupport = "LanguageModelThinkingPart" in vscode;

    for (const message of messages) {
      const role = MessageConverter.mapChatRole(message.role);
      summary.byRole[role] = (summary.byRole[role] ?? 0) + 1;
      const parts = Array.isArray(message.content)
        ? (message.content as readonly unknown[])
        : [message.content];

      if (MessageConverter.extractToolCallFromParts(parts)) {
        summary.toolCallMessages += 1;
      }
      if (MessageConverter.extractToolResultFromParts(parts)) {
        summary.toolResultMessages += 1;
      }

      for (const part of parts) {
        if (typeof part === "string") {
          summary.textCharacters += part.length;
          continue;
        }
        if (part instanceof vscode.LanguageModelTextPart) {
          summary.textCharacters += part.value?.length ?? 0;
          continue;
        }
        if (hasThinkingSupport && part instanceof vscode.LanguageModelThinkingPart) {
          const thinkingValue = part.value;
          const reasoning = Array.isArray(thinkingValue)
            ? thinkingValue.join("")
            : thinkingValue || "";
          // Only count non-empty/meaningful thinking content
          if (reasoning.trim().length > 0) {
            summary.thinkingParts += 1;
          }
          continue;
        }
        if (part && typeof part === "object") {
          const candidate = part as Record<string, unknown>;
          const text = candidate["text"] ?? candidate["value"] ?? candidate["content"];
          if (typeof text === "string") {
            summary.textCharacters += text.length;
          }
          if (typeof candidate["mimeType"] === "string" || typeof candidate["type"] === "string") {
            summary.attachmentParts += 1;
          }
        }
      }
    }

    return summary;
  }

  /**
   * 统计 AI SDK ModelMessage[] 的详细类型分布。
   * 专用于 "AI SDK options built" 日志，展示各 part 类型的数量。
   *
   * 对于 reasoning part，排除空/空白占位内容（如 " " 占位符），
   * 确保只有有实际思考内容的 reasoning part 才被计入。
   */
  static summarizeCoreMessages(messages: ModelMessage[]): {
    total: number;
    byRole: Record<string, number>;
    textParts: number;
    reasoningPartsActual: number;
    reasoningPlaceholders: number;
    toolCallParts: number;
    toolResultParts: number;
  } {
    const summary = {
      total: messages.length,
      byRole: {} as Record<string, number>,
      textParts: 0,
      reasoningPartsActual: 0,
      reasoningPlaceholders: 0,
      toolCallParts: 0,
      toolResultParts: 0,
    };

    for (const message of messages) {
      summary.byRole[message.role] = (summary.byRole[message.role] ?? 0) + 1;

      if (typeof message.content === "string") {
        summary.textParts += 1;
        continue;
      }

      for (const part of message.content) {
        switch (part.type) {
          case "text":
            summary.textParts += 1;
            break;
          case "reasoning": {
            const text = part.text ?? "";
            if (text.trim().length > 0) {
              summary.reasoningPartsActual += 1;
            } else {
              summary.reasoningPlaceholders += 1;
            }
            break;
          }
          case "tool-call":
            summary.toolCallParts += 1;
            break;
          case "tool-result":
            summary.toolResultParts += 1;
            break;
        }
      }
    }

    return summary;
  }
}
