import * as vscode from "vscode";

/**
 * AI SDK Core Message Types
 * Based on AI SDK v6.x (@ai-sdk/provider-utils)
 */
export type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Array<MessageContentPart> }
  | { role: "assistant"; content: string | Array<MessageContentPart> }
  | { role: "tool"; content: Array<ToolResultPart> };

export type MessageContentPart = TextPart | ReasoningPart | ImagePart | FilePart | ToolCallPart;

export interface TextPart {
  type: "text";
  text: string;
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
}

export interface ImagePart {
  type: "image";
  image: string | Uint8Array | Buffer | URL;
  mediaType?: string;
}

export interface FilePart {
  type: "file";
  data: string | Uint8Array;
  mediaType: string;
  filename?: string;
}

export interface ToolCallPart {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: object;
}

export interface ToolResultPart {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  input: object;
  output: unknown;
}

// ============================================================================
// VS Code 消息类型
// ============================================================================

/**
 * VS Code Language Model Chat API 角色别名
 * 用于与 VS Code 的 LanguageModelChatMessageRole 对应
 */
export type ChatMessageRole = "system" | "user" | "assistant";

/**
 * 将字符串角色转换为 VS Code 的 LanguageModelChatMessageRole
 */
export function toVsCodeRole(role: ChatMessageRole): vscode.LanguageModelChatMessageRole {
  return role === "user"
    ? vscode.LanguageModelChatMessageRole.User
    : role === "assistant"
      ? vscode.LanguageModelChatMessageRole.Assistant
      : vscode.LanguageModelChatMessageRole.User; // system 使用 user 作为后备
}

/**
 * 简化的聊天消息接口
 * 注意：对于完整的 VS Code 集成，建议直接使用 vscode.LanguageModelChatMessage
 */
export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
}

/**
 * VS Code 消息内容部分的联合类型
 * 对应 VS Code 的 LanguageModelTextPart | LanguageModelToolCallPart | LanguageModelThinkingPart 等
 */
export type VsCodeMessageContent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: any }
  | { type: "tool-result"; toolCallId: string; toolName: string; result: any };

/**
 * 创建带有多个部分的 Assistant 消息的辅助函数
 */
export function createAssistantMessage(content: string | VsCodeMessageContent[]) {
  return vscode.LanguageModelChatMessage.Assistant(content as string | any[]);
}

/**
 * 创建带有多个部分的 User 消息的辅助函数
 */
export function createUserMessage(content: string | VsCodeMessageContent[]) {
  return vscode.LanguageModelChatMessage.User(content as string | any[]);
}
