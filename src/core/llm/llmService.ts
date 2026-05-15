import * as vscode from "vscode";
import { streamText, generateText, type ModelMessage, type Tool } from "ai";
import type { Provider, Model, ModelOptions } from "../../common/types";
import { AIProviderRegistry } from "./aiRegistry";
import { MessageConverter } from "./messageConverter";
import { extractReasoningContentFromStep, hasStreamPartVisibleContent } from "./reasoningUtils";
import { ToolOrchestrator } from "./toolOrchestrator";
import { logger, LogScope, generateTraceId } from "../../common/logger";

// ============================================================================
// Types & Interfaces
// ============================================================================

interface ExecutionOptions {
  onStats?:
    | ((stats: { firstTokenTime: number; endTime: number; tokenCount: number }) => void)
    | undefined;
  onReasoning?: ((delta: string) => void) | undefined;
  // Internal flag to prevent duplicate stats reporting in streaming mode
  _streamingReported?: boolean;
  // Timestamp when the request was initiated (for accurate TTFT)
  requestStartTime?: number;
  // Trace ID for correlating logs across the entire request chain
  traceId?: string;
}

// ============================================================================
// LLM Service - Main Entry Point
// ============================================================================

export class LLMService {
  private readonly toolOrchestrator: ToolOrchestrator;
  private readonly registry: AIProviderRegistry;

  constructor(registry?: AIProviderRegistry) {
    this.registry = registry ?? AIProviderRegistry.getInstance();
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
    onStats?: (stats: { firstTokenTime: number; endTime: number; tokenCount: number }) => void,
    traceId?: string,
  ): Promise<void> {
    const execTraceId = traceId ?? generateTraceId();

    const msgSummary = MessageConverter.summarizeMessages(messages);

    logger.info(
      `[${execTraceId}] Chat started`,
      {
        providerName: provider.name,
        modelRid: model.rid,
        modelName: model.name,
        messages: msgSummary,
        traceId: execTraceId,
      },
      LogScope.LLM_SERVICE,
    );

    // Convert VS Code messages to AI SDK format
    const coreMessages = await MessageConverter.toAiCoreMessages(messages, model.capabilities);
    const systemMessage = MessageConverter.extractSystemMessage(messages);

    // Prepare tools if the model supports tool calling
    let tools: Record<string, Tool> = {};
    if (model.capabilities?.toolCalling !== false) {
      tools = await this.toolOrchestrator.prepareTools(options);
    } else if (model.capabilities?.toolCalling === false && options?.tools) {
      // If tools are requested but model doesn't support them, log a brief info
      logger.info(
        `[${execTraceId}] Model ${model.rid} does not support tool calling, tools will be filtered`,
        { traceId: execTraceId },
        LogScope.LLM_SERVICE,
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
      { onStats, traceId: execTraceId },
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

    try {
      // Record request start time for accurate speed measurement
      options.requestStartTime = Date.now();

      // Build AI SDK options
      const aiOptions = this.buildAiOptions(
        provider,
        model,
        messages,
        systemMessage,
        tools,
        options,
      );

      if (useStreaming) {
        await this.executeStreaming(aiOptions, progress, token, options);
      } else {
        await this.executeNonStreaming(aiOptions, progress, options);
      }
    } catch (error) {
      this.handleError(error, provider, model, options.traceId, useStreaming);
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
  private parseExtraBody(model: Model, provider: Provider): Record<string, unknown> {
    // Model-level extraBody takes precedence, then provider-level
    const extraBodyStr = model.extraBody || provider.extraBody;
    if (!extraBodyStr) {
      return {};
    }

    try {
      return JSON.parse(extraBodyStr);
    } catch {
      logger.warn(
        "Failed to parse extraBody JSON",
        {
          extraBody: extraBodyStr,
        },
        LogScope.LLM_SERVICE,
      );
      return {};
    }
  }

  /**
   * Parse extra header parameters from model configuration.
   * Model-level extraHeader overrides provider-level extraHeader.
   */
  private parseExtraHeaders(model: Model, provider: Provider): Record<string, string> {
    // Model-level extraHeader takes precedence, then provider-level
    const extraHeaderStr = model.extraHeader || provider.extraHeader;
    if (!extraHeaderStr) {
      return {};
    }

    try {
      return JSON.parse(extraHeaderStr);
    } catch {
      logger.warn(
        "Failed to parse extraHeader JSON",
        {
          extraHeader: extraHeaderStr,
        },
        LogScope.LLM_SERVICE,
      );
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
    const aiModel = this.registry.createModel(provider, model);
    const extraBody = this.parseExtraBody(model, provider);
    const extraHeaders = this.parseExtraHeaders(model, provider);
    const modelOptions = this.getModelOptions(model, provider);

    // Merge traceId into headers if present
    const mergedHeaders = { ...extraHeaders };
    if (options.traceId) {
      mergedHeaders["X-Addi-Trace-Id"] = options.traceId;
    }

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
      headers: Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined,
      extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
      // onFinish fallback for non-streaming: streaming mode reports via fullStream
      onFinish: ({ usage }: any) => {
        if (options.onStats && usage && !options._streamingReported) {
          const now = Date.now();
          options.onStats({
            firstTokenTime: options.requestStartTime ?? now,
            endTime: now,
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

    // ──────────────────────────────────────────────────────────────────────
    // providerOptions — the correct location for thinking/reasoning config.
    //
    // Per AI SDK official docs, provider-specific options (thinking,
    // reasoningEffort, thinkingConfig, etc.) MUST be passed via
    // `providerOptions` on the streamText / generateText call, NOT at
    // model creation time.
    //
    // 注意：当启用 reasoningContentInject 实验性功能时，中间件会自动处理
    // reasoning_content 字段的注入/提取，providerOptions 主要用于原生
    // thinking/reasoning 开关（如 Anthropic thinking、OpenAI reasoningEffort）。
    // ──────────────────────────────────────────────────────────────────────

    // Start with any user-configured providerOptions from model/provider settings
    const providerOptions: Record<string, Record<string, unknown>> = {};

    if (modelOptions.providerOptions) {
      Object.assign(providerOptions, modelOptions.providerOptions);
    }

    // 当 reasoningContentInject 启用时，中间件自动处理 reasoning_content 字段，
    // 但仍需传递思考开关（enabled/disabled）给底层 provider
    const hasReasoningMiddleware = modelOptions.reasoningContentInject === true;

    // ──────────────────────────────────────────────────────────────────────
    // 推理层级 (reasoningEffort) 统一处理
    //
    // 用户可以在模型编辑页面的设置中配置 reasoningEffort (low/medium/high)，
    // 该配置会被映射为各 provider 的特定参数：
    //
    //   OpenAI (openai-responses):     { reasoningEffort: "low|medium|high" }
    //   OpenAI (openai-completions):   同 OpenAI (仅当 !hasReasoningMiddleware)
    //   Anthropic:                     { thinking: { budgetTokens: N } }
    //   Google:                        { thinkingConfig: { thinkingBudget: N } }
    //   openai-completions + 中间件:   通过 extraBody 传递 thinking.type
    //
    // 如果用户未配置 reasoningEffort，则使用各 provider 的默认值。
    // ──────────────────────────────────────────────────────────────────────

    // 将用户配置的 reasoningEffort 映射为各 provider 的参数
    if (modelOptions.reasoningEffort) {
      const effort = modelOptions.reasoningEffort;
      const providerType = provider.providerType;

      // OpenAI — direct mapping
      if (providerType === "openai-responses" && !providerOptions["openai"]) {
        providerOptions["openai"] = { reasoningEffort: effort };
      }

      // openai-completions — pass reasoningEffort (unless middleware handles it)
      if (providerType === "openai-completions" && !providerOptions["openai"]) {
        if (!hasReasoningMiddleware) {
          providerOptions["openai"] = { reasoningEffort: effort };
        }
      }

      // Anthropic — map effort to budgetTokens
      if (providerType === "anthropic-messages" && !providerOptions["anthropic"]) {
        const budgetMap: Record<string, number> = { low: 1024, medium: 4096, high: 8192 };
        providerOptions["anthropic"] = {
          thinking: { type: "enabled", budgetTokens: budgetMap[effort] ?? 4096 },
        };
      }

      // Google — map effort to thinkingConfig
      if (providerType === "google-generateContent" && !providerOptions["google"]) {
        const budgetMap: Record<string, number> = { low: 1024, medium: 4096, high: 8192 };
        providerOptions["google"] = {
          thinkingConfig: {
            thinkingBudget: budgetMap[effort] ?? 4096,
            includeThoughts: true,
          },
        };
      }
    }

    // Fallback: when no reasoningEffort is configured, use provider defaults
    if (!modelOptions.reasoningEffort && model.capabilities?.reasoning) {
      const providerType = provider.providerType;

      // Anthropic — thinking (budget-based by default)
      if (providerType === "anthropic-messages" && !providerOptions["anthropic"]) {
        const budget = model.maxOutputTokens ? Math.floor(model.maxOutputTokens / 2) : 4096;
        providerOptions["anthropic"] = {
          thinking: { type: "enabled", budgetTokens: Math.max(1024, budget) },
        };
      }

      // OpenAI — reasoningEffort (default: medium)
      if (
        (providerType === "openai-responses" || providerType === "openai-completions") &&
        !providerOptions["openai"]
      ) {
        if (!hasReasoningMiddleware) {
          providerOptions["openai"] = { reasoningEffort: "medium" };
        }
      }

      // Google — thinkingConfig
      if (providerType === "google-generateContent" && !providerOptions["google"]) {
        const budget = model.maxOutputTokens ? Math.floor(model.maxOutputTokens / 2) : 8192;
        providerOptions["google"] = {
          thinkingConfig: {
            thinkingBudget: Math.max(1024, budget),
            includeThoughts: true,
          },
        };
      }
    }

    // When reasoning capability is NOT enabled, explicitly disable
    if (!model.capabilities?.reasoning) {
      const providerType = provider.providerType;

      if (
        (providerType === "openai-responses" || providerType === "openai-completions") &&
        !providerOptions["openai"] &&
        !hasReasoningMiddleware
      ) {
        providerOptions["openai"] = { reasoningEffort: "none" };
      }
    }

    // Only attach providerOptions when there's actually something to pass
    if (Object.keys(providerOptions).length > 0) {
      baseOptions.providerOptions = providerOptions;
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

    // ──────────────────────────────────────────────────────────────────────
    // Debug log: capture what options are actually being sent to AI SDK
    // ──────────────────────────────────────────────────────────────────────
    const coreMsgSummary = MessageConverter.summarizeCoreMessages(messages);

    logger.debug(
      `[${options.traceId ?? "?"}] AI SDK options built`,
      {
        modelRid: model.rid,
        providerType: provider.providerType,
        endpoint: provider.apiEndpoint,
        systemLength: system?.length ?? 0,
        messages: coreMsgSummary,
        temperature: baseOptions.temperature,
        maxTokens: baseOptions.maxOutputTokens,
        hasTools: Object.keys(tools).length > 0,
        hasProviderOptions: Object.keys(providerOptions).length > 0,
        streamMode: baseOptions.stream !== false ? "streaming" : "non-streaming",
        hasHeaders: !!baseOptions.headers,
        traceId: options.traceId,
      },
      LogScope.LLM_SERVICE,
    );

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
      logger.debug("Cancellation requested, aborting stream", undefined, LogScope.LLM_SERVICE);
      abortController.abort();
    });

    let firstTokenTime: number | undefined;
    let hasReportedContent = false;
    let hasFinished = false;
    let finishReason: string | undefined;

    let result: any;
    try {
      result = streamText({
        ...options,
        abortSignal: abortController.signal,
      });

      for await (const part of result.fullStream) {
        if (token.isCancellationRequested) {
          break;
        }

        if (!firstTokenTime && part.type !== "finish" && part.type !== "error") {
          firstTokenTime = Date.now();
        }

        if (part.type === "finish") {
          hasFinished = true;
          finishReason = part.finishReason;
          logger.debug(
            `[${executionOptions.traceId ?? "?"}] Stream finished`,
            {
              finishReason: part.finishReason,
              usage: part.usage,
              hasReportedContent,
              traceId: executionOptions.traceId,
            },
            LogScope.LLM_SERVICE,
          );
          if (part.finishReason === "content-filter") {
            progress.report(new vscode.LanguageModelTextPart("[Content filtered]"));
            hasReportedContent = true;
          }
          continue;
        }

        if (part.type === "error") {
          const error = part.error as any;
          const errorMsg = error?.message || String(part.error);
          logger.error(
            `[${executionOptions.traceId ?? "?"}] Stream error part received`,
            { error: errorMsg, traceId: executionOptions.traceId },
            LogScope.LLM_SERVICE,
          );
          throw error;
        }

        this.processResponsePart(part, progress, executionOptions);

        if (hasStreamPartVisibleContent(part)) {
          hasReportedContent = true;
        }
      }

      if (!hasReportedContent && !token.isCancellationRequested) {
        if (finishReason === "content-filter") {
          throw vscode.LanguageModelError.Blocked(
            "Message blocked by model content safety filters.",
          );
        }
        if (!hasFinished) {
          logger.warn(
            `[${executionOptions.traceId ?? "?"}] Stream completed without any content reported`,
            { traceId: executionOptions.traceId },
            LogScope.LLM_SERVICE,
          );
        }
      }
    } catch (error) {
      if (!hasReportedContent) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          `[${executionOptions.traceId ?? "?"}] Streaming error before any content reported`,
          {
            error: errorMessage,
            finishReason,
            traceId: executionOptions.traceId,
          },
          LogScope.LLM_SERVICE,
        );
        progress.report(new vscode.LanguageModelTextPart(`[Error: ${errorMessage}]`));
      }
      throw error;
    } finally {
      // Report usage data to VS Code (even if onStats callback is not set)
      try {
        const usage = await result.usage;
        this.reportUsageData(usage, progress, executionOptions.traceId);

        // Report onStats with accurate token count
        if (executionOptions.onStats && firstTokenTime) {
          const endTime = Date.now();
          executionOptions._streamingReported = true;
          executionOptions.onStats({
            firstTokenTime,
            endTime,
            tokenCount: usage.outputTokens || 0,
          });
        }
      } catch {
        // Usage unavailable (e.g. stream cancelled early)
        logger.debug(
          `[${executionOptions.traceId ?? "?"}] Could not get usage from stream result`,
          { traceId: executionOptions.traceId },
          LogScope.LLM_SERVICE,
        );

        if (executionOptions.onStats && firstTokenTime) {
          const endTime = Date.now();
          executionOptions._streamingReported = true;
          executionOptions.onStats({
            firstTokenTime,
            endTime,
            tokenCount: 0,
          });
        }
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

      // Report usage data to VS Code
      if (result.usage) {
        this.reportUsageData(result.usage, progress, executionOptions.traceId);
      }

      if (result.finishReason === "content-filter") {
        throw vscode.LanguageModelError.Blocked("Message blocked by model content safety filters.");
      }

      if (!hasReportedContent && result.finishReason === "stop") {
        logger.warn(
          `[${executionOptions.traceId ?? "?"}] Non-streaming response completed but no content was generated`,
          { finishReason: result.finishReason, traceId: executionOptions.traceId },
          LogScope.LLM_SERVICE,
        );
        progress.report(new vscode.LanguageModelTextPart("[No response generated]"));
      }
    } catch (error) {
      if (!hasReportedContent) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          `[${executionOptions.traceId ?? "?"}] Non-streaming error before any content reported`,
          {
            error: errorMessage,
            traceId: executionOptions.traceId,
          },
          LogScope.LLM_SERVICE,
        );
        progress.report(new vscode.LanguageModelTextPart(`[Error: ${errorMessage}]`));
      }
      throw error;
    }
  }

  // ========================================================================
  // Response Processing Helpers
  // ========================================================================

  /**
   * Report token usage data to VS Code as a LanguageModelDataPart.
   * This allows VS Code and Copilot to track usage statistics for third-party providers.
   */
  private reportUsageData(
    usage: { inputTokens: number | undefined; outputTokens: number | undefined; totalTokens: number | undefined },
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    traceId?: string,
  ): void {
    const usageData = {
      prompt_tokens: usage.inputTokens ?? 0,
      completion_tokens: usage.outputTokens ?? 0,
      total_tokens: usage.totalTokens ?? 0,
    };

    logger.debug(
      `[${traceId ?? "?"}] Reporting usage data to VS Code`,
      usageData,
      LogScope.LLM_SERVICE,
    );

    progress.report(vscode.LanguageModelDataPart.json(usageData, "usage"));
  }

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

      // Thinking/Reasoning内容 - AI SDK fullStream uses type 'reasoning-delta' with 'delta' property
      "reasoning-delta": (p) => {
        this.handleThinkingDelta(p, progress, options);
      },

      // AI SDK v6 fullStream may also expose explicit reasoning lifecycle markers.
      // reasoning-start/end do not contain displayable text and can be ignored.
      "reasoning-start": () => {},
      "reasoning-end": () => {},

      // AI SDK v7 may emit 'reasoning' type directly
      reasoning: (p) => {
        if (p.text) {
          this.reportReasoning(p.text, p, progress, options);
        }
      },

      // Thinking签名 - 加密内容，通常不需要直接显示
      "reasoning-part-finish": () => {
        // Part finished silently
      },

      // 工具调用
      "tool-call": (p) => {
        progress.report(
          new vscode.LanguageModelToolCallPart(p.toolCallId, p.toolName, p.args || p.input),
        );
      },

      // 工具结果
      "tool-result": (p) => {
        const toolRes = p.result || p.output;
        const res = typeof toolRes === "string" ? toolRes : JSON.stringify(toolRes);
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
   * AI SDK fullStream reasoning-delta parts have:
   *   - part.delta (string): the reasoning text delta
   *   - part.id (string): reasoning sequence ID
   *   - part.providerMetadata (optional)
   */
  private handleThinkingDelta(
    part: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    options: ExecutionOptions,
  ): void {
    // CRITICAL: AI SDK fullStream uses 'delta' property, NOT 'reasoningDelta' or 'text'
    const text = part.delta;

    if (!text) {
      return;
    }

    this.reportReasoning(text, part, progress, options);
  }

  /**
   * Shared helper to report reasoning text to VS Code UI.
   */
  private reportReasoning(
    text: string,
    part: any,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    options: ExecutionOptions,
  ): void {
    // 创建VSCode格式的thinking part
    const thinkingPart = new vscode.LanguageModelThinkingPart(text, part.id, part.providerMetadata);

    // 通知回调（如果有）
    if (options.onReasoning) {
      options.onReasoning(text);
    }

    // 报告给UI
    progress.report(thinkingPart as any);
  }

  /**
   * Extract reasoning/thinking content from step response.
   *
   * 对于非流式响应，AI SDK会在steps中包含thinking内容。
   * 这个方法简化了提取逻辑，直接从标准字段获取。
   */
  private extractReasoningContent(step: any): string {
    return extractReasoningContentFromStep(step);
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

    // Always report to VS Code UI
    const thinkingPart = new vscode.LanguageModelThinkingPart(reasoning);
    progress.report(thinkingPart as any);

    // Also invoke callback if present
    if (options.onReasoning) {
      options.onReasoning(reasoning);
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
        new vscode.LanguageModelToolCallPart(tc.toolCallId, tc.toolName, tc.args || tc.input),
      );

      const tr = step.toolResults?.find((r: any) => r.toolCallId === tc.toolCallId);
      if (tr) {
        const res = typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output);
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
  private handleError(
    error: any,
    provider?: Provider,
    model?: Model,
    traceId?: string,
    isStreaming?: boolean,
  ): void {
    if (error.name === "AbortError" || error.message?.includes("The operation was aborted")) {
      return;
    }

    // ALWAYS log the full error with rich context for developers
    const errorContext: Record<string, unknown> = {
      traceId,
      isStreaming,
    };

    if (provider) {
      errorContext["providerId"] = provider.id;
      errorContext["providerName"] = provider.name;
      errorContext["providerType"] = provider.providerType;
      errorContext["providerEndpoint"] = provider.apiEndpoint;
    }

    if (model) {
      errorContext["modelRid"] = model.rid;
      errorContext["modelName"] = model.name;
      errorContext["modelFamily"] = model.family;
    }

    if (error instanceof Error) {
      errorContext["errorName"] = error.name;
      errorContext["errorMessage"] = error.message;
      errorContext["errorStack"] = error.stack;
    }

    logger.error(
      `[${traceId ?? "?"}] LLMService execution error`,
      errorContext,
      LogScope.LLM_SERVICE,
    );

    // Throw the original error directly as requested
    throw error;
  }
}
