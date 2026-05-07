import type { LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { Provider, Model } from "../../common/types";
import { logger } from "../../common/logger";

// AI SDK 的 Provider 实例通常是一个函数，接受 modelId 返回 LanguageModelV1
// 我们定义一个通用的类型别名
type AIProviderInstance = (modelId: string) => LanguageModel;

/**
 * Common settings shape for all AI SDK provider factories.
 * Defined as a concrete type (not using optional properties) to avoid conflicts
 * with `exactOptionalPropertyTypes` in tsconfig.
 */
interface BaseProviderSettings {
  baseURL: string;
  apiKey: string;
  fetch: typeof globalThis.fetch;
}

/**
 * Factory interface for creating AI Provider instances (e.g. OpenAI, Anthropic).
 */
export interface ProviderFactory {
  id: string;
  label: string;
  create: (provider: Provider) => AIProviderInstance;
}

/**
 * Registry for all supported AI Providers.
 * Maps provider types (vendor strings) to their respective factory functions.
 *
 * Instance-based design for testability and dependency injection.
 * Use `AIProviderRegistry.getInstance()` for the global singleton,
 * or create a new instance for testing / custom setups.
 */
export class AIProviderRegistry {
  private static _instance: AIProviderRegistry | undefined;
  private factories: Record<string, ProviderFactory> = {};
  private initialized = false;

  /**
   * Get or create the global singleton instance.
   * Factories are registered lazily on first access.
   */
  static getInstance(): AIProviderRegistry {
    if (!AIProviderRegistry._instance) {
      AIProviderRegistry._instance = new AIProviderRegistry();
    }
    return AIProviderRegistry._instance;
  }

  register(factory: ProviderFactory) {
    this.factories[factory.id] = factory;
  }

  unregister(id: string) {
    delete this.factories[id];
  }

  getFactory(id: string): ProviderFactory | undefined {
    this.ensureInitialized();
    return this.factories[id];
  }

  getAvailableTypes() {
    this.ensureInitialized();
    return Object.values(this.factories).map((f) => ({
      label: f.label,
      value: f.id,
    }));
  }

  private ensureInitialized() {
    if (this.initialized) {
      return;
    }

    // Helper to create a fetch wrapper for error handling
    const createFetchWithErrorHandling = (baseFetch?: typeof globalThis.fetch) => {
      return async (url: string | Request | URL, options?: RequestInit) => {
        const urlStr = url.toString();
        try {
          const fetchFn = baseFetch || fetch;
          // Add default User-Agent if not present (helps with some strict firewalls/providers like Minimax)
          const finalOptions = { ...options };
          if (!finalOptions.headers) {
            finalOptions.headers = {};
          }
          // Handle headers as Headers object or plain object
          if (finalOptions.headers instanceof Headers) {
            if (!finalOptions.headers.has("User-Agent")) {
              finalOptions.headers.set("User-Agent", "VSCode-Addi-Extension");
            }
          } else if (Array.isArray(finalOptions.headers)) {
            // [string, string][] format — add if missing
            const headersArray = finalOptions.headers as [string, string][];
            if (!headersArray.some(([k]) => k.toLowerCase() === "user-agent")) {
              headersArray.push(["User-Agent", "VSCode-Addi-Extension"]);
            }
          } else {
            const headersRecord: Record<string, string> = (finalOptions.headers as Record<string, string>) || {};
            if (!headersRecord["User-Agent"] && !headersRecord["user-agent"]) {
              headersRecord["User-Agent"] = "VSCode-Addi-Extension";
            }
            finalOptions.headers = headersRecord;
          }

          const response = await fetchFn(url, finalOptions);
          if (!response.ok) {
            const errorMsg = `[AI-SDK Fetch] Error ${response.status} from ${urlStr}`;
            try {
              const clone = response.clone();
              const text = await clone.text();
              logger.error(
                errorMsg,
                { status: response.status, body: text.substring(0, 500) },
                "AIRegistry",
              );
            } catch (e) {
              logger.error(errorMsg, e, "AIRegistry");
            }
          }
          return response;
        } catch (e) {
          logger.error(
            `[AI-SDK Fetch] Network Error: ${urlStr}`,
            e,
            "AIRegistry",
          );
          throw e;
        }
      };
    };

    /**
     * Build common provider settings from a Provider config.
     * All properties are non-optional to be compatible with `exactOptionalPropertyTypes`.
     */
    const buildBaseSettings = (p: Provider, overrideBaseURL?: string): BaseProviderSettings => ({
      baseURL: overrideBaseURL ?? p.apiEndpoint ?? "",
      apiKey: p.apiKey ?? "",
      fetch: createFetchWithErrorHandling(),
    });

    // OpenAI (/completions) - Most common, used by OpenAI, DeepSeek, local models, etc.
    this.register({
      id: "openai-completions",
      label: "OpenAI (/completions)",
      create: (p) => {
        const isCustomEndpoint =
          p.apiEndpoint && !p.apiEndpoint.includes("api.openai.com");
        const baseURL = p.apiEndpoint
          ? p.apiEndpoint.replace(/\/chat\/completions\/?$/, "")
          : "";

        // Smart Fallback: use createOpenAICompatible for custom endpoints
        if (isCustomEndpoint) {
          return createOpenAICompatible({
            baseURL,
            apiKey: p.apiKey ?? "",
            name: "openai-proxy",
            fetch: createFetchWithErrorHandling(),
          });
        }

        return createOpenAI(buildBaseSettings(p, baseURL));
      },
    });

    // OpenAI (/responses) - Newer API with built-in tool support
    this.register({
      id: "openai-responses",
      label: "OpenAI (/responses)",
      create: (p) => {
        const baseURL = p.apiEndpoint
          ? p.apiEndpoint.replace(/\/responses\/?$/, "")
          : "";
        return createOpenAI(buildBaseSettings(p, baseURL));
      },
    });

    // Anthropic (/messages)
    this.register({
      id: "anthropic-messages",
      label: "Anthropic (/messages)",
      create: (p) => {
        // Manual mode: User must provide the correct baseURL.
        // e.g. https://api.minimaxi.com/anthropic/v1
        // We only strip /messages because the SDK adds it.
        const baseURL = p.apiEndpoint
          ? p.apiEndpoint.replace(/\/messages\/?$/, "")
          : "";
        return createAnthropic(buildBaseSettings(p, baseURL));
      },
    });

    // Google (/name:generateContent)
    this.register({
      id: "google-generateContent",
      label: "Google (/name:generateContent)",
      create: (p) => {
        return createGoogleGenerativeAI(buildBaseSettings(p));
      },
    });

    this.initialized = true;
  }

  /**
   * 根据 Provider 配置和 Model ID 创建 AI SDK 的 LanguageModel 实例
   * 
   * 重要: 这里必须使用 model.rid (远程模型 ID)，而不是 model.id (本地 UUID)
   * 因为 AI SDK 需要知道实际的远程模型标识符来正确路由请求
   */
  createModel(
    provider: Provider,
    modelOrId: string | Model,
  ): LanguageModel {
    this.ensureInitialized();

    // 关键修复: 如果传入的是 Model 对象，必须使用 rid 而非 id
    // - id 是本地生成的 UUID，用于在 addi 扩展内部唯一标识模型
    // - rid 是远程 API 接受的模型 ID（如 "gpt-4o", "claude-3-5-sonnet"）
    let modelId: string;
    let model: Model | undefined;
    
    if (typeof modelOrId === "string") {
      // 如果直接传入的是字符串，当作 rid 处理
      modelId = modelOrId;
    } else {
      // 如果传入的是 Model 对象，使用 rid
      modelId = modelOrId.rid;
      model = modelOrId as Model;
    }

    // If model object is not provided but ID is, try to find it in the provider's model list
    if (
      !model &&
      typeof modelOrId === "string" &&
      Array.isArray(provider.models)
    ) {
      model = provider.models.find((m) => m.rid === modelOrId);
    }

    // 尝试获取对应的工厂，如果找不到则默认使用 openai (兼容模式)
    let factory = this.factories[provider.providerType];
    if (!factory) {
      if (
        ["openai-completions", "openai-responses"].includes(
          provider.providerType,
        )
      ) {
        factory = this.factories["openai-completions"];
      } else {
        factory = this.factories["openai-completions"]; // Default fallback
      }
    }

    if (!factory) {
      // Should not happen if fallback is correct
      // Ensure factory is strictly not undefined for TypeScript
      factory = this.factories["openai-completions"];
      if (!factory) {
        throw new Error(
          `Provider factory not found for type: ${provider.providerType}`,
        );
      }
    }

    const aiProviderInstance = factory.create(provider);

    // Model instance is created without thinking/reasoning settings.
    // Per AI SDK official docs, thinking must be passed via providerOptions
    // at the streamText/generateText call site, not at model creation.
    // See: buildAiOptions() in llmService.ts
    return aiProviderInstance(modelId);
  }
}
