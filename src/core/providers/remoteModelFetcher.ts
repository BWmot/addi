/**
 * Remote Model Fetcher
 *
 * Extracted from ProviderModelManager to reduce file size and improve testability.
 * Handles fetching available models from remote AI provider APIs.
 *
 * Supports:
 * - OpenAI-compatible APIs (/v1/models)
 * - Anthropic Messages API (/v1/models)
 * - Google Generative AI API (/models)
 */

import type { Model, Provider, RemoteModelInfo } from "../../common/types";
import { logger } from "../../common/logger";

const TOKEN_LIMIT = 1024 * 1024 * 4;

/**
 * Options for the fetcher. Accepts a callback to retrieve the API key
 * so the module remains decoupled from storage implementation.
 */
export interface RemoteModelFetcherOptions {
  /** Retrieve the API key for a given provider ID */
  getApiKey: (providerId: string) => Promise<string | undefined>;
}

/**
 * Fetch available models from a remote AI provider.
 *
 * @param provider - The provider configuration
 * @param options - Callbacks for retrieving secrets
 * @returns Array of remote model information
 */
export async function fetchProviderModelsFromApi(
  provider: Provider,
  options: RemoteModelFetcherOptions,
): Promise<RemoteModelInfo[]> {
  const endpoint = provider.apiEndpoint?.trim();
  // Retrieve API key asynchronously from SecretStorage
  const apiKey = await options.getApiKey(provider.id);

  if (!endpoint) {
    throw new Error("Provider API endpoint is not configured");
  }

  if (!apiKey) {
    throw new Error("Provider API key is not configured");
  }

  const providerType = provider.providerType ?? "generic";
  logger.debug("fetchProviderModelsFromApi invoked", {
    provider: logger.sanitizeProvider(provider),
    providerType,
  });

  try {
    switch (providerType) {
      // OpenAI (/completions) or OpenAI (/responses) - Both use OpenAI's models API
      case "openai-completions":
      case "openai-responses": {
        const url = resolveModelsUrl(endpoint, "https://api.openai.com/v1");
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          throw new Error(await readResponseError(response));
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const entries = Array.isArray(payload["data"]) ? payload["data"] : [];
        const models: RemoteModelInfo[] = [];

        for (const entry of entries) {
          if (!entry || typeof entry !== "object") {
            continue;
          }
          const record = entry as Record<string, unknown>;
          const id =
            typeof record["id"] === "string" ? record["id"] : undefined;
          if (!id) {
            continue;
          }
          const displayName =
            typeof record["display_name"] === "string"
              ? record["display_name"]
              : undefined;
          const ownedBy =
            typeof record["owned_by"] === "string"
              ? record["owned_by"]
              : undefined;
          const description =
            typeof record["description"] === "string"
              ? record["description"]
              : ownedBy
                ? `Owner: ${ownedBy}`
                : undefined;
          const info: RemoteModelInfo = {
            id,
            name: displayName ?? id,
          };
          if (description) {
            info.description = description;
          }
          if (ownedBy && ownedBy.trim()) {
            info.family = ownedBy.trim();
          }
          models.push(info);
        }
        return models;
      }

      // Anthropic (/messages) - Uses x-api-key header
      case "anthropic-messages": {
        const baseUrl = normalizeBaseUrl(endpoint, "https://api.anthropic.com");
        const url = buildUrl(baseUrl, "/v1/models");
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
        });

        if (!response.ok) {
          throw new Error(await readResponseError(response));
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const listSource = Array.isArray(payload["models"])
          ? payload["models"]
          : Array.isArray(payload["data"])
            ? payload["data"]
            : [];
        const models: RemoteModelInfo[] = [];

        for (const entry of listSource) {
          if (!entry || typeof entry !== "object") {
            continue;
          }
          const record = entry as Record<string, unknown>;
          const id =
            typeof record["id"] === "string"
              ? record["id"]
              : typeof record["name"] === "string"
                ? record["name"]
                : undefined;
          if (!id) {
            continue;
          }
          const displayName =
            typeof record["display_name"] === "string"
              ? record["display_name"]
              : undefined;
          const description =
            typeof record["description"] === "string"
              ? record["description"]
              : undefined;
          const maxInputTokens = coercePositiveInteger(
            record["input_token_limit"] ??
              record["context_length"] ??
              record["context_limit"],
          );
          const maxOutputTokens = coercePositiveInteger(
            record["output_token_limit"] ?? record["max_output_tokens"],
          );

          const info: RemoteModelInfo = {
            id,
            name: displayName ?? id,
          };
          if (description) {
            info.description = description;
          }
          if (maxInputTokens !== undefined) {
            info.maxInputTokens = maxInputTokens;
          }
          if (maxOutputTokens !== undefined) {
            info.maxOutputTokens = maxOutputTokens;
          }
          models.push(info);
        }
        return models;
      }

      // Google (/name:generateContent) - Uses API key as query parameter
      case "google-generateContent": {
        const baseUrl = normalizeBaseUrl(
          endpoint,
          "https://generativelanguage.googleapis.com/v1beta",
        );
        const url = `${buildUrl(baseUrl, "/models")}?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error(await readResponseError(response));
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const entries = Array.isArray(payload["models"])
          ? payload["models"]
          : [];
        const models: RemoteModelInfo[] = [];

        for (const entry of entries) {
          if (!entry || typeof entry !== "object") {
            continue;
          }
          const record = entry as Record<string, unknown>;
          const name =
            typeof record["name"] === "string" ? record["name"] : undefined;
          if (!name) {
            continue;
          }
          const displayName =
            typeof record["displayName"] === "string"
              ? record["displayName"]
              : undefined;
          const description =
            typeof record["description"] === "string"
              ? record["description"]
              : undefined;
          const maxInputTokens = coercePositiveInteger(
            record["inputTokenLimit"],
          );
          const maxOutputTokens = coercePositiveInteger(
            record["outputTokenLimit"],
          );

          let capabilities: Model["capabilities"] | undefined;
          const modalitiesSource = (record["inputModalities"] ??
            record["supportedInputModalities"] ??
            record["allowedInputModalities"] ??
            record["supportedModalities"]) as unknown;
          if (Array.isArray(modalitiesSource)) {
            const hasImage = modalitiesSource.some(
              (value) =>
                typeof value === "string" &&
                value.toUpperCase().includes("IMAGE"),
            );
            if (hasImage) {
              capabilities = { imageInput: true };
            }
          }

          const info: RemoteModelInfo = {
            id: name,
            name: displayName ?? name,
          };
          if (description) {
            info.description = description;
          }
          if (maxInputTokens !== undefined) {
            info.maxInputTokens = maxInputTokens;
          }
          if (maxOutputTokens !== undefined) {
            info.maxOutputTokens = maxOutputTokens;
          }
          if (capabilities) {
            info.capabilities = capabilities;
          }
          models.push(info);
        }
        return models;
      }

      default:
        logger.warn("Unknown provider type for model fetching", {
          providerType,
        });
        return [];
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("Error fetching provider models", { error: msg });
    throw new Error(`Failed to fetch models: ${msg}`);
  }
}

// ─── Network Utilities ──────────────────────────────────────────────────

function normalizeBaseUrl(endpoint: string | undefined, fallback: string): string {
  const base = (endpoint && endpoint.trim()) || fallback;
  return base.replace(/\/+$/, "");
}

function buildUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function resolveModelsUrl(endpoint: string, fallback: string): string {
  const baseUrl = normalizeBaseUrl(endpoint, fallback);
  const [baseWithoutQueryRaw, queryString] = baseUrl.split("?", 2);
  const baseWithoutQuery = baseWithoutQueryRaw || baseUrl;

  let path = baseWithoutQuery.replace(/\/(?:chat\/)?completions$/i, "");
  if (/\/openai\/deployments\//i.test(path)) {
    path = path.replace(/\/openai\/deployments\/[^/]+$/i, "/openai");
  }

  const modelsUrl = buildUrl(path, "/models");
  return queryString ? `${modelsUrl}?${queryString}` : modelsUrl;
}

async function readResponseError(response: Response): Promise<string> {
  const statusInfo = `${response.status} ${response.statusText}`;
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    return statusInfo;
  }

  if (!body) {
    return statusInfo;
  }

  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === "string") {
      return `${statusInfo} - ${parsed.error}`;
    }
    if (parsed?.error?.message) {
      return `${statusInfo} - ${parsed.error.message}`;
    }
    return `${statusInfo} - ${body}`;
  } catch {
    return `${statusInfo} - ${body}`;
  }
}

function coercePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), TOKEN_LIMIT);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.floor(parsed), TOKEN_LIMIT);
    }
  }
  return undefined;
}
