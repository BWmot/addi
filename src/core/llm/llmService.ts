import * as vscode from "vscode";
import { streamText, generateText, type ModelMessage, type Tool } from "ai";
import type { Provider, Model, ModelOptions } from "../../common/types";
import { AIProviderRegistry } from "./aiRegistry";
import { MessageConverter } from "./messageConverter";
import { ToolOrchestrator } from "./toolOrchestrator";
import { logger } from "../../common/logger";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ExecutionOptions {
  onStats?:
    | ((stats: {
        firstTokenTime: number;
        endTime: number;
        tokenCount: number;
      }) => void)
    | undefined;
  onReasoning?: ((delta: string) => void) | undefined;
  // Internal flag to prevent duplicate stats reporting in streaming mode
  _streamingReported?: boolean;
}

// ============================================================================
// LLM Service - Main Entry Point
// ============================================================================

export class LLMService {
  private readonly toolOrchestrator: ToolOrchestrator;

  constructor() {
    this.toolOrchestrator = new ToolOrchestrator();
  }

  // ========================================================================
  // Public API - VS Code Language Model Chat Entry Point
  // ========================================================================

  /**
   * VS Code API compatible chat entry point.
   *
   * @param provider - The AI provider configuration
   * @param model - The model configuration
   * @param messages - VS Code chat request messages
   * @param options - Language model response options
   * @param progress - Progress reporter for streaming response parts
   * @param token - Cancellation token
   * @param onStats - Optional callback for statistics
   */
  async chat(
    provider: Provider,
    model: Model,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions | undefined,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
    onStats?: (stats: {
      firstTokenTime: number;
      endTime: number;
      tokenCount: number;
    }) => void,
  ): Promise<void> {
    // Convert VS Code messages to AI SDK format
    const coreMessages = await MessageConverter.toAiCoreMessages(
      messages,
      model.capabilities,
    );
    const systemMessage = MessageConverter.extractSystemMessage(messages);

    // Prepare tools if the model supports tool calling
    let tools: Record<string, Tool> = {};
    if (model.capabilities?.toolCalling !== false) {
      tools = await this.toolOrchestrator.prepareTools(options);
    } else if (model.capabilities?.toolCalling === false && options?.tools) {
      // If tools are requested but model doesn't support them, log a brief info
      logger.info(
        `Model ${model.id} does not support tool calling, tools will be filtered`,
        undefined,
        "LLMService",
      );
    }

    // Execute the chat request
    return this.executeDirect(
      provider,
      model,
      coreMessages,
      systemMessage,
      tools,
      progress,
      token,
      { onStats },
    );
  }

  // ========================================================================
  // Core Execution Logic
  // ========================================================================

  /**
   * Main execution method that handles both streaming and non-streaming requests.
   */
  private async executeDirect(
    provider: Provider,
    model: Model,
    messages: ModelMessage[],
    systemMessage: string | undefined,
    tools: Record<string, Tool>,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
    options: ExecutionOptions,
  ): Promise<void> {
    try {
      // Build AI SDK options
      const aiOptions = this.buildAiOptions(
        provider,
        model,
        messages,
        systemMessage,
        tools,
        options,
      );

      // Execute based on streaming preference from extraBody
      let useStreaming = true;
      if (model.extraBody) {
        try {
          const parsed = JSON.parse(model.extraBody);
          useStreaming = parsed["stream"] !== false;
        } catch {
          useStreaming = true;
        }
      }

      if (useStreaming) {
        await this.executeStreaming(aiOptions, progress, token, options);
      } else {
        await this.executeNonStreaming(aiOptions, progress, options);
      }
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Get merged model options (provider defaults overridden by model-specific options).
   */
  private getModelOptions(model: Model, provider: Provider): ModelOptions {
    // Provider-level options as defaults
    const providerOptions: ModelOptions = provider.options || {};
    // Model-level options override provider defaults
    const modelOptions: ModelOptions = model.options || {};

    return {
      ...providerOptions,
      ...modelOptions,
    };
  }

  /**
   * Parse extra body parameters from model configuration.
   * Model-level extraBody overrides provider-level extraBody.
   */
  private parseExtraBody(
    model: Model,
    provider: Provider,
  ): Record<string, any> {
    // Model-level extraBody takes precedence, then provider-level
    const extraBodyStr = model.extraBody || provider.extraBody;
    if (!extraBodyStr) {
      return {};
    }

    try {
      return JSON.parse(extraBodyStr);
    } catch {
      logger.warn("Failed to parse extraBody JSON", {
        extraBody: extraBodyStr,
      });
      return {};
    }
  }

  /**
   * Parse extra header parameters from model configuration.
   * Model-level extraHeader overrides provider-level extraHeader.
   */
  private parseExtraHeaders(
    model: Model,
    provider: Provider,
  ): Record<string, string> {
    // Model-level extraHeader takes precedence, then provider-level
    const extraHeaderStr = model.extraHeader || provider.extraHeader;
    if (!extraHeaderStr) {
      return {};
    }

    try {
      return JSON.parse(extraHeaderStr);
    } catch {
      logger.warn("Failed to parse extraHeader JSON", {
        extraHeader: extraHeaderStr,
      });
      return {};
    }
  }

  /**
   * Build AI SDK options object.
   * Note: abortSignal is NOT included here - it's created in executeStreaming/executeNonStreaming
   * and properly connected to the VS Code cancellation token.
   */
  private buildAiOptions(
    provider: Provider,
    model: Model,
    messages: ModelMessage[],
    system: string | undefined,
    tools: Record<string, Tool>,
    options: ExecutionOptions,
  ): any {
    const aiModel = AIProviderRegistry.createModel(provider, model);
    const extraBody = this.parseExtraBody(model, provider);
    const extraHeaders = this.parseExtraHeaders(model, provider);
    const modelOptions = this.getModelOptions(model, provider);

    const baseOptions: any = {
      model: aiModel,
      system,
      messages,
      maxOutputTokens: modelOptions.maxOutputTokens ?? model.maxOutputTokens,
      temperature: modelOptions.temperature,
      topP: modelOptions.topP,
      topK: modelOptions.topK,
      stopSequences: modelOptions.stopSequences,
      presencePenalty: modelOptions.presencePenalty,
      frequencyPenalty: modelOptions.frequencyPenalty,
      seed: modelOptions.seed,
      responseFormat: modelOptions.responseFormat,
      headers: Object.keys(extraHeaders).length > 0 ? extraHeaders : undefined,
      extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
      onFinish: ({ usage }: any) => {
        if (options.onStats && usage && !options._streamingReported) {
          options.onStats({
            firstTokenTime: Date.now(),
            endTime: Date.now(),
            tokenCount: usage.outputTokens || 0,
          });
        }
      },
    };

    if (Object.keys(tools).length > 0) {
      baseOptions.tools = tools;
      baseOptions.maxSteps = modelOptions.maxSteps ?? 100;
      baseOptions.toolChoice = modelOptions.toolChoice;
    }

    const handledParams = [
      "temperature",
      "topP",
      "topK",
      "maxOutputTokens",
      "stopSequences",
      "presencePenalty",
      "frequencyPenalty",
      "seed",
      "responseFormat",
      "maxSteps",
    ];
    for (const [key, value] of Object.entries(extraBody)) {
      if (!handledParams.includes(key) && value !== undefined) {
        baseOptions[key] = value;
      }
    }

    return baseOptions;
  }

  // ========================================================================
  // Streaming Execution
  // ========================================================================

  /**
   * Handle streaming response from AI SDK.
   */
  private async executeStreaming(
    options: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
    executionOptions: ExecutionOptions,
  ): Promise<void> {
    const abortController = new AbortController();
    token.onCancellationRequested(() => {
      logger.debug("Cancellation requested, aborting stream");
      abortController.abort();
    });

    let firstTokenTime: number | undefined;
    let hasReportedContent = false;
    let hasFinished = false;
    let finishReason: string | undefined;
    let tokenCount = 0;

    try {
      const result = streamText({
        ...options,
        abortSignal: abortController.signal,
      });

      for await (const part of result.fullStream) {
        if (token.isCancellationRequested) {
          break;
        }

        if (
          !firstTokenTime &&
          part.type !== "finish" &&
          part.type !== "error"
        ) {
          firstTokenTime = Date.now();
        }

        if (part.type === "finish") {
          hasFinished = true;
          finishReason = part.finishReason;
          if (part.finishReason === "content-filter") {
            progress.report(
              new vscode.LanguageModelTextPart("[Content filtered]"),
            );
            hasReportedContent = true;
          }
          continue;
        }

        if (part.type === "error") {
          const error = part.error as any;
          const errorMsg = error?.message || String(part.error);
          logger.error("Stream error part received", { error: errorMsg });
          throw error;
        }

        this.processResponsePart(part, progress, executionOptions);

        if (part.type === "text-delta" && part.text) {
          hasReportedContent = true;
          const textLength = part.text.length;
          tokenCount += Math.ceil(textLength / 4);
        }
      }

      if (!hasReportedContent && !token.isCancellationRequested) {
        if (finishReason === "content-filter") {
          throw vscode.LanguageModelError.Blocked(
            "Message blocked by model content safety filters.",
          );
        }
        if (!hasFinished) {
          logger.warn("Stream completed without any content reported");
        }
      }
    } catch (error) {
      if (!hasReportedContent) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Streaming error before any content reported", {
          error: errorMessage,
        });
        progress.report(
          new vscode.LanguageModelTextPart(`[Error: ${errorMessage}]`),
        );
      }
      throw error;
    } finally {
      if (executionOptions.onStats && firstTokenTime) {
        const endTime = Date.now();
        executionOptions._streamingReported = true;
        executionOptions.onStats({
          firstTokenTime,
          endTime,
          tokenCount,
        });
      }
    }
  }

  // ========================================================================
  // Non-Streaming Execution
  // ========================================================================

  /**
   * Handle non-streaming response from AI SDK.
   */
  private async executeNonStreaming(
    options: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    executionOptions: ExecutionOptions,
  ): Promise<void> {
    let hasReportedContent = false;

    try {
      const result = await generateText(options);
      const steps = (result.steps as any[]) || [];

      for (const step of steps) {
        this.processReasoning(step, progress, executionOptions);
        this.processToolCalls(step, progress);
      }

      if (result.text) {
        progress.report(new vscode.LanguageModelTextPart(result.text));
        hasReportedContent = true;
      }

      if (result.finishReason === "content-filter") {
        throw vscode.LanguageModelError.Blocked(
          "Message blocked by model content safety filters.",
        );
      }

      if (!hasReportedContent && result.finishReason === "stop") {
        logger.warn(
          "Non-streaming response completed but no content was generated",
        );
        progress.report(
          new vscode.LanguageModelTextPart("[No response generated]"),
        );
      }
    } catch (error) {
      if (!hasReportedContent) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("Non-streaming error before any content reported", {
          error: errorMessage,
        });
        progress.report(
          new vscode.LanguageModelTextPart(`[Error: ${errorMessage}]`),
        );
      }
      throw error;
    }
  }

  // ========================================================================
  // Response Processing Helpers
  // ========================================================================

  /**
   * Process and report a response part to VS Code UI.
   *
   * AI SDK已经处理了thinking/reasoning的提取工作。
   * 我们只需要正确转换到VSCode API格式。
   */
  private processResponsePart(
    part: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    options: ExecutionOptions,
  ): void {
    // Handler map for different stream part types
    const handlers: Record<string, (part: any) => void> = {
      // 文本内容 - AI SDK fullStream 使用 'text' 属性
      "text-delta": (p) => {
        progress.report(new vscode.LanguageModelTextPart(p.text));
      },

      // Thinking/Reasoning内容 - AI SDK已提取
      "reasoning-delta": (p) => {
        this.handleThinkingDelta(p, progress, options);
      },

      // Thinking签名 - 加密内容，通常不需要直接显示
      "reasoning-signature": (p) => {
        this.handleThinkingSignature(p);
      },

      // Thinking流结束标记
      "reasoning-complete": (p) => {
        this.handleThinkingComplete(p);
      },

      // 工具调用
      "tool-call": (p) => {
        progress.report(
          new vscode.LanguageModelToolCallPart(
            p.toolCallId,
            p.toolName,
            p.args || p.input,
          ),
        );
      },

      // 工具结果
      "tool-result": (p) => {
        const toolRes = p.result || p.output;
        const res =
          typeof toolRes === "string" ? toolRes : JSON.stringify(toolRes);
        progress.report(
          new vscode.LanguageModelToolResultPart(p.toolCallId, [
            new vscode.LanguageModelTextPart(res),
          ]),
        );
      },

      // 错误处理
      error: (p) => {
        throw p.error;
      },

      // 结束处理 (如有内容过滤等错误需在此由 provider 反映给 VS Code)
      finish: (p) => {
        if (p.finishReason === "content-filter") {
          throw vscode.LanguageModelError.Blocked(
            "Message blocked by model content safety filters.",
          );
        }
      },
    };

    const handler = handlers[part.type];
    if (handler) {
      handler(part);
    }
  }

  /**
   * 处理thinking delta内容
   * AI SDK已提取reasoning内容，我们只需要正确转换
   */
  private handleThinkingDelta(
    part: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    options: ExecutionOptions,
  ): void {
    const reasoningDelta = part.reasoningDelta;

    if (!reasoningDelta) {
      return;
    }

    // 创建VSCode格式的thinking part
    const thinkingPart = new vscode.LanguageModelThinkingPart(
      reasoningDelta,
      part.id,
      part.metadata,
    );

    // 通知回调（如果有）
    if (options.onReasoning) {
      options.onReasoning(reasoningDelta);
    }

    // 报告给UI
    progress.report(thinkingPart as any);
  }

  /**
   * 处理thinking签名
   * 通常用于验证，不需要直接显示给用户
   */
  private handleThinkingSignature(_part: any): void {
    // Signature validation happens silently, no logging needed
  }

  /**
   * 处理thinking流结束
   */
  private handleThinkingComplete(_part: any): void {
    // Stream completed silently
  }

  /**
   * Extract reasoning/thinking content from step response.
   *
   * 对于非流式响应，AI SDK会在steps中包含thinking内容。
   * 这个方法简化了提取逻辑，直接从标准字段获取。
   */
  private extractReasoningContent(step: any): string {
    // AI SDK的steps中，reasoning内容通常在以下字段：
    const reasoning = step.reasoning || step.thinking || step.reasoning_details;

    if (!reasoning) {
      return "";
    }

    // 处理字符串格式
    if (typeof reasoning === "string") {
      return reasoning;
    }

    // 处理数组格式
    if (Array.isArray(reasoning)) {
      return reasoning
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          if (typeof item === "object") {
            return item.text || item.content || item.value || "";
          }
          return String(item);
        })
        .filter(Boolean)
        .join("\n");
    }

    return "";
  }

  /**
   * Process reasoning/thinking content from a step.
   * 对于非流式响应，AI SDK已将thinking内容放在step中。
   */
  private processReasoning(
    step: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    options: ExecutionOptions,
  ): void {
    const reasoning = this.extractReasoningContent(step);

    if (!reasoning) {
      return;
    }

    // 简化处理，直接创建thinking part
    const thinkingPart = new vscode.LanguageModelThinkingPart(reasoning);

    if (options.onReasoning) {
      options.onReasoning(reasoning);
    } else {
      progress.report(thinkingPart as any);
    }
  }

  /**
   * Process tool calls from a step.
   */
  private processToolCalls(
    step: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  ): void {
    for (const tc of step.toolCalls || []) {
      progress.report(
        new vscode.LanguageModelToolCallPart(
          tc.toolCallId,
          tc.toolName,
          tc.args || tc.input,
        ),
      );

      const tr = step.toolResults?.find(
        (r: any) => r.toolCallId === tc.toolCallId,
      );
      if (tr) {
        const res =
          typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output);
        progress.report(
          new vscode.LanguageModelToolResultPart(tc.toolCallId, [
            new vscode.LanguageModelTextPart(res),
          ]),
        );
      }
    }
  }

  /**
   * Handle errors during execution.
   */
  private handleError(error: any): void {
    if (
      error.name === "AbortError" ||
      error.message?.includes("The operation was aborted")
    ) {
      return;
    }

    // ALWAYS log the full error for developers to see in the logs
    logger.error("LLMService execution error", error, "LLMService");

    // Throw the original error directly as requested
    throw error;
  }
}
