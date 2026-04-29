import * as vscode from "vscode";
import type { Provider, ProviderRepository } from "../../common/types";
import { TokenFormatter } from "../../common/utils";
import { logger } from "../../common/logger";
import { ToolRegistry } from "../llm/toolRegistry";
import type { LLMService } from "../llm/llmService";
import { MessageConverter } from "../llm/messageConverter";

/**
 * Main Chat Provider Implementation for VS Code.
 * - Bridges VS Code's Chat API with abstract LLMService.
 * - Manages the lifecycle of chat models available to Copilot.
 */
export class AddiChatProvider implements vscode.LanguageModelChatProvider {
  private readonly _onDidChangeLanguageModelChatInformation =
    new vscode.EventEmitter<void>();
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
    logger.debug("provideLanguageModelChatInformation", {
      silent: options.silent,
      providerCount: providers.length,
    });
    // Always expose available providers to the caller. Previously we filtered out
    // providers when `options.silent` was true if they lacked an `apiKey`. That
    // caused transient misses when secrets were still loading from SecretStorage
    // (the StorageService fetches secrets asynchronously). Returning providers
    // unconditionally ensures the host UI (e.g. Copilot) can list and select
    // models; requests will still fail later if the provider is unconfigured.
    const filterProviders = providers;
    logger.debug("Filtered providers for chat information", {
      original: providers.length,
      filtered: filterProviders.length,
    });
    return filterProviders.flatMap((p) =>
      p.models.map((m) => {
        const friendlyInput =
          TokenFormatter.format(m.maxInputTokens) || String(m.maxInputTokens);
        const friendlyOutput =
          TokenFormatter.format(m.maxOutputTokens) || String(m.maxOutputTokens);
        const summary = `${friendlyInput}↑/${friendlyOutput}↓`;
        return {
          id: `addi-model:${m.id}`,
          name: `[${p.name}] ${m.name}`,
          family: m.family,
          version: m.version,
          maxInputTokens: m.maxInputTokens,
          maxOutputTokens: m.maxOutputTokens,
          tooltip: `${p.name} - ${summary}`,
          isUserSelectable: m.isUserSelectable ?? true,
          category: {
            label: p.name,
            order: p.order ?? 100,
          },
          capabilities: {
            imageInput: !!m.capabilities?.imageInput,
            // LanguageModelChatInformation.capabilities.toolCalling expects number | boolean
            toolCalling: (m.capabilities?.toolCalling ?? false) as
              | number
              | boolean,
          },
        };
      }),
    );
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions | undefined,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const modelId =
      typeof model.id === "string" && model.id.startsWith("addi-model:")
        ? model.id.replace("addi-model:", "")
        : model.id;
    logger.info("Chat response requested", {
      requestedModelId: modelId,
      messageCount: messages.length,
      hasOptions: Boolean(options),
    });
    const messageSummary = MessageConverter.summarizeMessages(messages);
    const toolDefinitions = this.resolveToolDefinitions(options);
    const toolNames = toolDefinitions?.map((t) => t.name) ?? [];
    logger.debug("Chat request summary", {
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
    });
    const result = this.repository.findModel(modelId);
    if (!result) {
      logger.warn("Chat response requested for unknown model", {
        requestedModelId: modelId,
      });
      throw new Error(`Model with ID '${modelId}' not found.`);
    }

    const { provider, model: storedModel } = result;
    logger.debug("Resolved model for chat response", {
      provider: logger.sanitizeProvider(provider),
      model: logger.sanitizeModel(storedModel),
      messages: messageSummary,
    });

    // Retrieve API key from SecretStorage
    const apiKey = await this.repository.getApiKey(provider.id);

    if (!apiKey || apiKey.trim() === "") {
      logger.warn(
        "Provider missing API key",
        logger.sanitizeProvider(provider),
      );
      throw new Error(
        `API key for provider '${provider.name}' is not configured.`,
      );
    }

    if (!provider.apiEndpoint || provider.apiEndpoint.trim() === "") {
      logger.warn(
        "Provider missing API endpoint",
        logger.sanitizeProvider(provider),
      );
      throw new Error(
        `API endpoint for provider '${provider.name}' is not configured.`,
      );
    }

    const providerWithKey: Provider = { ...provider, apiKey };

    const startTime = Date.now();
    const onStats = (stats: {
      firstTokenTime: number;
      endTime: number;
      tokenCount: number;
    }) => {
      logger.debug("onStats called", stats);
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
            logger.info("Calculated speed", {
              speed,
              duration,
              tokenCount: stats.tokenCount,
            });
            // Update speed
            if (this.repository.updateModelSpeed) {
              this.repository.updateModelSpeed(
                provider.id,
                storedModel.id,
                speed,
              );
            } else {
              logger.warn("Repository does not support updateModelSpeed");
            }
          } else {
            logger.warn("Speed rejected: unrealistic value", { speed });
          }
        } else {
          logger.warn("Speed rejected: unrealistic duration", { duration });
        }
      }
    };

    try {
      logger.debug(
        "Dispatching request via LLMService",
        logger.sanitizeProvider(providerWithKey),
      );
      await this.llmService.chat(
        providerWithKey,
        storedModel,
        messages,
        options,
        progress,
        token,
        onStats,
      );
    } catch (error) {
      logger.error("Model query error", {
        error: error instanceof Error ? error.message : String(error),
        provider: logger.sanitizeProvider(providerWithKey),
        model: logger.sanitizeModel(storedModel),
      });
      // Just re-throw the error. If it is already a LanguageModelError, VS Code will handle it appropriately.
      // If it's a generic Error, VS Code will still show it as a failure in the chat.
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      logger.info("Chat response completed", {
        requestedModelId: modelId,
        durationMs: duration,
      });
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
            (p): p is vscode.LanguageModelTextPart =>
              p instanceof vscode.LanguageModelTextPart,
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
}
