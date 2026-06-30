import * as vscode from "vscode";
import type { Provider, ProviderRepository } from "../../common/types";
import { TokenFormatter } from "../../common/utils";
import { logger, LogScope, generateTraceId } from "../../common/logger";
import { ToolRegistry } from "../llm/toolRegistry";
import type { LLMService } from "../llm/llmService";
import { MessageConverter } from "../llm/messageConverter";
import { AutoRouter } from "../llm/autoRouter";

/** 虚拟路由模型的特殊 ID — 不会被任何真实模型的 UUID 冲突 */
const AUTO_ROUTER_MODEL_ID = "_auto_router_";

/**
 * Main Chat Provider Implementation for VS Code.
 * - Bridges VS Code's Chat API with abstract LLMService.
 * - Manages the lifecycle of chat models available to Copilot.
 */
export class AddiChatProvider implements vscode.LanguageModelChatProvider {
  private readonly _onDidChangeLanguageModelChatInformation = new vscode.EventEmitter<void>();
  public readonly onDidChangeLanguageModelChatInformation =
    this._onDidChangeLanguageModelChatInformation.event;

  constructor(
    private repository: ProviderRepository,
    private llmService: LLMService,
  ) {
    // Listen for repository updates to refresh the model list in Copilot
    if (this.repository.onDidUpdate) {
      this.repository.onDidUpdate(() => {
        this._onDidChangeLanguageModelChatInformation.fire();
      });
    }
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const providers = this.repository.getProviders();
    logger.debug(
      "provideLanguageModelChatInformation",
      {
        silent: options.silent,
        providerCount: providers.length,
      },
      LogScope.CHAT_PROVIDER,
    );
    // Always expose available providers to the caller. Previously we filtered out
    // providers when `options.silent` was true if they lacked an `apiKey`. That
    // caused transient misses when secrets were still loading from SecretStorage
    // (the StorageService fetches secrets asynchronously). Returning providers
    // unconditionally ensures the host UI (e.g. Copilot) can list and select
    // models; requests will still fail later if the provider is unconfigured.
    const filterProviders = providers;
    logger.debug(
      "Filtered providers for chat information",
      {
        original: providers.length,
        filtered: filterProviders.length,
      },
      LogScope.CHAT_PROVIDER,
    );
    // ── 虚拟 "Auto Router" 模型 ──
    // 仅在有 ≥2 个可用模型时才显示（只有一个模型时路由无意义）
    const allModels = filterProviders.flatMap((p) => p.models);
    const autoRouterEntry: vscode.LanguageModelChatInformation | null =
      allModels.length >= 2
        ? {
            id: `addi-model:${AUTO_ROUTER_MODEL_ID}`,
            name: "Auto Router (Addi)",
            family: "Addi",
            version: "1.0.0",
            maxInputTokens: Math.max(...allModels.map((m) => m.maxInputTokens), 0) || 128000,
            maxOutputTokens: Math.max(...allModels.map((m) => m.maxOutputTokens), 0) || 16384,
            tooltip: "Auto-selects the best Addi model for the request",
            detail: "Addi Auto",
            isUserSelectable: true,
            capabilities: {
              imageInput: allModels.some((m) => m.capabilities?.vision),
              toolCalling: allModels.some((m) => m.capabilities?.toolCalling !== false),
            },
          }
        : null;

    const providerModels = filterProviders.flatMap((p) =>
      p.models.map((m) => {
        const friendlyInput = TokenFormatter.format(m.maxInputTokens) || String(m.maxInputTokens);
        const friendlyOutput =
          TokenFormatter.format(m.maxOutputTokens) || String(m.maxOutputTokens);
        const summary = `${friendlyInput} in / ${friendlyOutput} out`;
        return {
          id: `addi-model:${m.id}`,
          name: `[${p.name}] ${m.name}`,
          family: m.family,
          version: m.version,
          maxInputTokens: m.maxInputTokens,
          maxOutputTokens: m.maxOutputTokens,
          tooltip: `${p.name} - ${summary}`,
          detail: p.name,
          isUserSelectable: m.isUserSelectable ?? true,
          capabilities: {
            imageInput: !!m.capabilities?.vision,
            // LanguageModelChatInformation.capabilities.toolCalling expects number | boolean
            toolCalling: (m.capabilities?.toolCalling ?? false) as number | boolean,
          },
        };
      }),
    );

    const result: vscode.LanguageModelChatInformation[] = [];
    if (autoRouterEntry) {
      result.push(autoRouterEntry);
    }
    result.push(...providerModels);
    return result;
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions | undefined,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const traceId = generateTraceId();
    const modelId =
      typeof model.id === "string" && model.id.startsWith("addi-model:")
        ? model.id.replace("addi-model:", "")
        : model.id;
    logger.info(
      `[${traceId}] Chat response requested`,
      {
        requestedModelId: modelId,
        messageCount: messages.length,
        hasOptions: Boolean(options),
        traceId,
      },
      LogScope.CHAT_PROVIDER,
    );
    const messageSummary = MessageConverter.summarizeMessages(messages);
    const toolDefinitions = this.resolveToolDefinitions(options);
    const toolNames = toolDefinitions?.map((t) => t.name) ?? [];
    logger.debug(
      `[${traceId}] Chat request summary`,
      {
        requestedModelId: modelId,
        messages: messageSummary,
        toolCount: toolDefinitions?.length ?? 0,
        toolNames,
        toolSource:
          toolDefinitions && toolDefinitions.length > 0
            ? Array.isArray(options?.tools)
              ? "host"
              : "fallback"
            : "none",
        traceId,
      },
      LogScope.CHAT_PROVIDER,
    );
    const result = modelId === AUTO_ROUTER_MODEL_ID
      ? this.resolveAutoRouter(messages, toolDefinitions, traceId)
      : this.repository.findModel(modelId);
    if (!result) {
      const allModels = this.repository.getProviders().flatMap((p) =>
        p.models.map((m) => ({
          providerName: p.name,
          modelRid: m.rid,
          modelName: m.name,
        })),
      );
      logger.warn(
        `[${traceId}] Chat response requested for unknown model`,
        {
          requestedModelId: modelId,
          availableModels: allModels,
          traceId,
        },
        LogScope.CHAT_PROVIDER,
      );
      throw new Error(`Model with ID '${modelId}' not found.`);
    }

    const { provider, model: storedModel } = result;
    logger.debug(
      `[${traceId}] Resolved model for chat response`,
      {
        provider: logger.sanitizeProvider(provider),
        model: logger.sanitizeModel(storedModel),
        messages: messageSummary,
        traceId,
      },
      LogScope.CHAT_PROVIDER,
    );

    // Retrieve API key from SecretStorage
    const apiKey = await this.repository.getApiKey(provider.id);

    if (!apiKey || apiKey.trim() === "") {
      logger.warn(
        `[${traceId}] Provider missing API key`,
        { ...logger.sanitizeProvider(provider), traceId },
        LogScope.CHAT_PROVIDER,
      );
      throw new Error(`API key for provider '${provider.name}' is not configured.`);
    }

    if (!provider.apiEndpoint || provider.apiEndpoint.trim() === "") {
      logger.warn(
        `[${traceId}] Provider missing API endpoint`,
        { ...logger.sanitizeProvider(provider), traceId },
        LogScope.CHAT_PROVIDER,
      );
      throw new Error(`API endpoint for provider '${provider.name}' is not configured.`);
    }

    const providerWithKey: Provider = { ...provider, apiKey };

    const startTime = Date.now();
    const onStats = (stats: {
      firstTokenTime: number;
      endTime: number;
      tokenCount: number;
    }) => {
      logger.debug(
        `[${traceId}] onStats called`,
        { ...stats, traceId },
        LogScope.CHAT_PROVIDER,
      );
      // Validate the timing data before calculating speed
      if (
        stats.tokenCount > 0 &&
        stats.firstTokenTime > 0 &&
        stats.endTime > stats.firstTokenTime
      ) {
        const duration = (stats.endTime - stats.firstTokenTime) / 1000;
        // Sanity check: reject unrealistic durations
        // Minimum 0.01 seconds (10ms) to avoid division by near-zero
        // Maximum 60 seconds to avoid measuring extremely slow responses
        if (duration >= 0.01 && duration <= 60) {
          const speed = stats.tokenCount / duration;
          // Sanity check: reject unrealistic speeds (>10000 t/s is physically impossible)
          if (speed <= 10000) {
            logger.info(
              `[${traceId}] Calculated speed`,
              {
                speed,
                duration,
                tokenCount: stats.tokenCount,
                traceId,
              },
              LogScope.CHAT_PROVIDER,
            );
            // Update speed
            if (this.repository.updateModelSpeed) {
              this.repository.updateModelSpeed(provider.id, storedModel.id, speed);
            } else {
              logger.warn(
                "Repository does not support updateModelSpeed",
                undefined,
                LogScope.CHAT_PROVIDER,
              );
            }
          } else {
            logger.warn(
              `[${traceId}] Speed rejected: unrealistic value`,
              { speed, traceId },
              LogScope.CHAT_PROVIDER,
            );
          }
        } else {
          logger.warn(
            `[${traceId}] Speed rejected: unrealistic duration`,
            { duration, traceId },
            LogScope.CHAT_PROVIDER,
          );
        }
      }
    };

    try {
      logger.debug(
        `[${traceId}] Dispatching request via LLMService`,
        logger.sanitizeProvider(providerWithKey),
        LogScope.CHAT_PROVIDER,
      );
      await this.llmService.chat(
        providerWithKey,
        storedModel,
        messages,
        options,
        progress,
        token,
        onStats,
        traceId,
      );
    } catch (error) {
      logger.error(
        `[${traceId}] Model query error`,
        {
          error: error instanceof Error ? error.message : String(error),
          traceId,
          provider: logger.sanitizeProvider(providerWithKey),
          model: logger.sanitizeModel(storedModel),
        },
        LogScope.CHAT_PROVIDER,
      );
      // Just re-throw the error. If it is already a LanguageModelError, VS Code will handle it appropriately.
      // If it's a generic Error, VS Code will still show it as a failure in the chat.
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      logger.info(
        `[${traceId}] Chat response completed`,
        {
          requestedModelId: modelId,
          durationMs: duration,
          traceId,
        },
        LogScope.CHAT_PROVIDER,
      );
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken,
  ): Promise<number> {
    if (typeof text === "string") {
      const words = text.split(/\s+/).length;
      return Math.ceil(words * 1.3);
    }
    // If a message is provided, stringify only text parts
    if (typeof text === "object" && text) {
      const maybe = text as { content?: unknown };
      if (Array.isArray(maybe.content)) {
        const parts = (maybe.content as readonly unknown[])
          .filter(
            (p): p is vscode.LanguageModelTextPart => p instanceof vscode.LanguageModelTextPart,
          )
          .map((p: vscode.LanguageModelTextPart) => p.value)
          .join("");
        return Math.ceil(parts.length / 4);
      }
    }
    const textContent = JSON.stringify(text);
    return Math.ceil(textContent.length / 4);
  }

  private resolveToolDefinitions(
    options: vscode.ProvideLanguageModelChatResponseOptions | undefined,
  ): ReadonlyArray<vscode.LanguageModelChatTool> | undefined {
    const provided = options?.tools;
    if (provided && provided.length > 0) {
      ToolRegistry.captureHostTools(provided);
      return provided;
    }
    const fallback = ToolRegistry.getFallbackToolDefinitions();
    if (fallback.length > 0) {
      return fallback;
    }
    return undefined;
  }

  /**
   * 自动路由：从所有已配置的 provider/model 中选择最佳模型。
   * 返回 { provider, model } 供后续流程使用，若无可选模型则返回 null。
   */
  private resolveAutoRouter(
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    toolDefinitions: ReadonlyArray<vscode.LanguageModelChatTool> | undefined,
    traceId: string,
  ): { provider: Provider; model: import("../../common/types").Model } | null {
    const allProviders = this.repository.getProviders();

    // 收集所有候选 (provider + model)
    const candidates = allProviders.flatMap((p) =>
      p.models.map((m) => ({ provider: p, model: m })),
    );

    if (candidates.length === 0) {
      logger.warn(`[${traceId}] AutoRouter: no candidates available`, undefined, LogScope.CHAT_PROVIDER);
      return null;
    }

    // 检测请求特征
    const hasTools = (toolDefinitions?.length ?? 0) > 0;
    const hasImages = messages.some((msg) => {
      if (!("content" in msg)) return false;
      const content = (msg as { content: unknown }).content;
      if (!Array.isArray(content)) return false;
      return content.some(
        (part: unknown) =>
          part instanceof vscode.LanguageModelDataPart &&
          (part as vscode.LanguageModelDataPart).mimeType?.startsWith("image/"),
      );
    });

    logger.info(
      `[${traceId}] AutoRouter: analyzing request`,
      { candidateCount: candidates.length, hasTools, hasImages },
      LogScope.CHAT_PROVIDER,
    );

    const decision = AutoRouter.select(messages, hasTools, hasImages, candidates);

    if (!decision) {
      logger.warn(`[${traceId}] AutoRouter: no suitable model found`, undefined, LogScope.CHAT_PROVIDER);
      return null;
    }

    logger.info(
      `[${traceId}] AutoRouter: routed to ${decision.reason}`,
      undefined,
      LogScope.CHAT_PROVIDER,
    );

    return { provider: decision.provider, model: decision.model };
  }
}
