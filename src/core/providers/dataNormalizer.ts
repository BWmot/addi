/**
 * Data Normalization Service
 *
 * Extracted from ProviderModelManager to reduce file size and improve testability.
 * Contains pure functions for normalizing provider and model data structures.
 *
 * Handles:
 * - Legacy provider ID migration (numeric → UUID)
 * - Legacy provider type mapping (e.g., "openai" → "openai-completions")
 * - Provider type inference from endpoint
 * - Model field normalization (tokens, capabilities, IDs, family, version)
 * - Capabilities normalization (vision, toolCalling)
 */

import type { Model, Provider, ProviderType } from "../../common/types";
import { IdGenerator } from "../../common/utils";
import { ConfigManager } from "../../infrastructure/vscode/configService";
import { logger, LogScope } from "../../common/logger";

export interface NormalizationResult {
  mutated: boolean;
  critical: boolean;
}

/**
 * Normalize capabilities object, merging source with optional fallback.
 * Handles boolean ↔ number coercion for toolCalling.
 */
export function normalizeCapabilities(
  source?: Model["capabilities"],
  fallback?: Model["capabilities"],
): Model["capabilities"] {
  const normalized: Model["capabilities"] = {};
  const base = fallback ?? {};
  const candidate = source ?? {};

  if (candidate.vision !== undefined || base.vision !== undefined) {
    normalized.vision = Boolean(candidate.vision ?? base.vision);
  }

  const toolSource = candidate.toolCalling ?? base.toolCalling;
  if (toolSource !== undefined) {
    normalized.toolCalling = typeof toolSource === "number" ? toolSource : Boolean(toolSource);
  }

  if (candidate.reasoning !== undefined || base.reasoning !== undefined) {
    normalized.reasoning = Boolean(candidate.reasoning ?? base.reasoning);
  }

  return normalized;
}

/**
 * Normalize all providers in-place. Mutates the array directly.
 *
 * Handles:
 * 1. Provider ID migration (legacy numeric → UUID)
 * 2. Legacy provider type mapping
 * 3. Provider type inference from endpoint
 * 4. Invalid models array recovery
 * 5. Model field defaults and cleanup
 *
 * @returns `{ mutated: true }` if any field was changed, `{ critical: true }` if data loss occurred
 */
export function normalizeProvidersInPlace(
  providers: Array<Provider & Record<string, unknown>>,
): NormalizationResult {
  let mutated = false;
  let critical = false;

  for (const provider of providers) {
    // Migrate provider ID to UUID if it's a legacy format (e.g., timestamp-based or numeric string)
    const providerIdCandidate = typeof provider.id === "string" ? provider.id.trim() : "";
    const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      providerIdCandidate,
    );
    const isLegacyNumericId =
      providerIdCandidate && !isUuidFormat && /^[0-9]+$/.test(providerIdCandidate);

    if (!providerIdCandidate || isLegacyNumericId) {
      // Store the old API key (if any) before changing the ID
      // This is needed because secrets are keyed by provider ID
      const oldApiKey = provider.apiKey;

      // Generate new UUID for providers without ID or with legacy numeric ID
      const newId = IdGenerator.generate();

      // Preserve the API key in the new provider object
      // The storage service will handle saving it to the new secret key
      // Cast to allow manipulation for migration purposes
      const providerRecord = provider as unknown as Record<string, unknown>;
      if (oldApiKey !== undefined) {
        providerRecord["apiKey"] = oldApiKey;
      } else {
        // Explicitly delete to match the original behavior
        delete providerRecord["apiKey"];
      }

      logger.info(
        "Migrating provider ID to UUID",
        {
          oldId: providerIdCandidate || "(none)",
          newId,
          hasApiKey: !!oldApiKey,
        },
        LogScope.PROVIDER_MGR,
      );

      provider.id = newId;
      mutated = true;
      critical = true;
    }

    // Normalize legacy provider types to new API-based types
    // CAN BE REMOVE AFTER VERSION 1.0 - This is to ensure older persisted data remains compatible with the new provider type system.
    if (provider.providerType) {
      const legacyMapping: Record<string, ProviderType> = {
        openai: "openai-completions",
        "zhipu-ai": "openai-completions",
        minimax: "openai-completions",
        generic: "openai-completions",
        anthropic: "anthropic-messages",
        google: "google-generateContent",
      };
      const newType = legacyMapping[provider.providerType];
      if (newType && newType !== provider.providerType) {
        provider.providerType = newType;
        mutated = true;
      }
    } else {
      // Infer type from endpoint if not set
      const endpoint = (provider.apiEndpoint || "").toLowerCase();
      if (
        endpoint.includes("openai.com") ||
        endpoint.includes("anthropic.com") ||
        endpoint.includes("googleapis.com")
      ) {
        // Default to the appropriate API type based on endpoint
        if (endpoint.includes("anthropic.com")) {
          provider.providerType = "anthropic-messages";
        } else if (endpoint.includes("googleapis.com")) {
          provider.providerType = "google-generateContent";
        } else {
          provider.providerType = "openai-completions";
        }
      } else {
        // Default for custom endpoints
        provider.providerType = "openai-completions";
      }
      mutated = true;
      // Provider type inference is useful to persist but not strictly critical for ID stability.
      // However, if we don't save it, we re-infer every time.
      // Let's consider it cosmetic-ish unless we want to lock it.
    }

    if (!Array.isArray(provider.models)) {
      logger.warn(
        "Provider models array invalid, resetting",
        logger.sanitizeProvider(provider),
        LogScope.PROVIDER_MGR,
      );
      provider.models = [];
      mutated = true;
      critical = true; // Data loss/reset is critical
      continue;
    }

    // Filter out invalid entries that may be present in persisted state
    const initialLength = provider.models.length;
    provider.models = provider.models.filter((m) => m && typeof m === "object");
    if (provider.models.length !== initialLength) {
      mutated = true;
      critical = true; // Deletion is critical
    }

    provider.models = provider.models.map((model) => {
      const mutableModel = model as unknown as Record<string, unknown>;
      let changed = false;
      let modelCritical = false;

      // Ensure token defaults exist for older or malformed saved models
      if (typeof mutableModel["maxInputTokens"] !== "number") {
        mutableModel["maxInputTokens"] = ConfigManager.getDefaultMaxInputTokens();
        changed = true;
      }
      if (typeof mutableModel["maxOutputTokens"] !== "number") {
        mutableModel["maxOutputTokens"] = ConfigManager.getDefaultMaxOutputTokens();
        changed = true;
      }
      if (!mutableModel["capabilities"] || typeof mutableModel["capabilities"] !== "object") {
        mutableModel["capabilities"] = {} as Record<string, unknown>;
        changed = true;
      }

      const capabilitiesRecord = mutableModel["capabilities"] as Record<string, unknown>;

      // Migrate legacy imageInput → vision
      if (capabilitiesRecord["vision"] === undefined) {
        // Check for legacy imageInput in capabilities or at model root
        if (typeof capabilitiesRecord["imageInput"] === "boolean") {
          (capabilitiesRecord as Record<string, unknown>)["vision"] =
            capabilitiesRecord["imageInput"];
          delete capabilitiesRecord["imageInput"];
          changed = true;
        } else if (typeof mutableModel["imageInput"] === "boolean") {
          (capabilitiesRecord as Record<string, unknown>)["vision"] = mutableModel["imageInput"];
          changed = true;
        }
      }

      // Clean up legacy imageInput from capabilities
      if ("imageInput" in capabilitiesRecord) {
        delete capabilitiesRecord["imageInput"];
        changed = true;
      }

      // Clean up legacy audioInput/videoInput from capabilities
      if ("audioInput" in capabilitiesRecord) {
        delete capabilitiesRecord["audioInput"];
        changed = true;
      }
      if ("videoInput" in capabilitiesRecord) {
        delete capabilitiesRecord["videoInput"];
        changed = true;
      }

      if (
        capabilitiesRecord["toolCalling"] === undefined &&
        mutableModel["toolCalling"] !== undefined
      ) {
        const legacyToolCalling = mutableModel["toolCalling"];
        (capabilitiesRecord as Record<string, unknown>)["toolCalling"] =
          typeof legacyToolCalling === "number" ? legacyToolCalling : Boolean(legacyToolCalling);
        changed = true;
      }

      if ("imageInput" in mutableModel) {
        delete mutableModel["imageInput"];
        changed = true;
      }

      if ("audioInput" in mutableModel) {
        delete mutableModel["audioInput"];
        changed = true;
      }

      if ("videoInput" in mutableModel) {
        delete mutableModel["videoInput"];
        changed = true;
      }

      if ("toolCalling" in mutableModel) {
        delete mutableModel["toolCalling"];
        changed = true;
      }

      if (mutableModel["tooltip"] !== undefined && typeof mutableModel["tooltip"] !== "string") {
        delete mutableModel["tooltip"];
        changed = true;
      }

      if (mutableModel["detail"] !== undefined && typeof mutableModel["detail"] !== "string") {
        delete mutableModel["detail"];
        changed = true;
      }

      // Ensure speed fields are preserved/initialized
      if (
        mutableModel["speedHistory"] !== undefined &&
        !Array.isArray(mutableModel["speedHistory"])
      ) {
        mutableModel["speedHistory"] = [];
        changed = true;
      }
      if (
        mutableModel["averageSpeed"] !== undefined &&
        typeof mutableModel["averageSpeed"] !== "number"
      ) {
        delete mutableModel["averageSpeed"];
        changed = true;
      }

      const normalizedCaps = normalizeCapabilities(capabilitiesRecord as Model["capabilities"]);
      if (
        normalizedCaps.vision !== capabilitiesRecord["vision"] ||
        normalizedCaps.toolCalling !== capabilitiesRecord["toolCalling"]
      ) {
        changed = true;
      }
      mutableModel["capabilities"] = normalizedCaps;

      // id: 本地生成的唯一标识
      const idCandidate = typeof mutableModel["id"] === "string" ? mutableModel["id"].trim() : "";
      if (!idCandidate) {
        mutableModel["id"] = IdGenerator.generate();
        changed = true;
        modelCritical = true; // Generating ID is critical
      }

      // rid: remoteId - 远程模型的ID
      const ridRaw = typeof mutableModel["rid"] === "string" ? mutableModel["rid"].trim() : "";

      if (!ridRaw) {
        // 如果没有 rid，则使用 id 作为 rid
        mutableModel["rid"] = mutableModel["id"] as string;
        changed = true;
        modelCritical = true;
      } else if (ridRaw !== mutableModel["rid"]) {
        mutableModel["rid"] = ridRaw;
        changed = true;
      }

      // family: 模型系列/家族名称 (必须存在，非用户可编辑字段)
      const familyRaw =
        typeof mutableModel["family"] === "string" ? mutableModel["family"].trim() : "";
      if (!familyRaw) {
        // 如果没有 family，则使用配置项默认值
        mutableModel["family"] = ConfigManager.getDefaultModelFamily().trim();
        changed = true;
        modelCritical = true;
      } else if (familyRaw !== mutableModel["family"]) {
        mutableModel["family"] = familyRaw;
        changed = true;
      }

      // version: 模型版本标识 (必须存在，非用户可编辑字段)
      const versionRaw =
        typeof mutableModel["version"] === "string" ? mutableModel["version"].trim() : "";
      if (!versionRaw) {
        // 如果没有 version，则使用配置项默认值
        mutableModel["version"] = ConfigManager.getDefaultModelVersion().trim();
        changed = true;
        modelCritical = true;
      } else if (versionRaw !== mutableModel["version"]) {
        mutableModel["version"] = versionRaw;
        changed = true;
      }

      if (!changed) {
        return model;
      }

      mutated = true;
      if (modelCritical) {
        critical = true;
      }
      return mutableModel as unknown as Model;
    });
  }

  return { mutated, critical };
}
