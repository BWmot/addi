import type { Model, RemoteModelInfo } from "../../common/types";
import type { IProviderModelManager } from "../../domain/interfaces";
import { logger } from "../../common/logger";
import { IdGenerator } from "../../common/utils";
import { ConfigManager } from "../../infrastructure/vscode/configService";

export interface SyncResult {
  added: number;
  updated: number;
  totalRemote: number;
  mutated: boolean;
}

/**
 * Provider-related use cases
 * Business logic extracted from ProviderCommandHandler
 *
 * Depends on `IProviderModelManager` (DIP) — not the concrete class.
 */
export class ProviderUseCases {
  constructor(private manager: IProviderModelManager) {}

  /**
   * Sync models from a provider
   */
  async syncProviderModels(providerId: string): Promise<SyncResult> {
    const providers = this.manager.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);

    if (providerIndex === -1) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    const provider = providers[providerIndex]!;

    let remoteModels: RemoteModelInfo[];
    try {
      remoteModels = await this.manager.fetchProviderModelsFromApi(provider);
    } catch (error) {
      logger.error("Failed to fetch remote models", {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const existingModels = provider.models || [];
    const existingModelMap = new Map(existingModels.map((m) => [m.rid, m]));
    let added = 0;
    let updated = 0;

    for (const remoteModel of remoteModels) {
      const existing = existingModelMap.get(remoteModel.id);

      if (!existing) {
        const newModel: Model = {
          id: IdGenerator.generate(),
          rid: remoteModel.id,
          name: remoteModel.name || remoteModel.id,
          family: remoteModel.family || ConfigManager.getDefaultModelFamily(),
          version: ConfigManager.getDefaultModelVersion(),
          maxInputTokens:
            remoteModel.maxInputTokens ||
            ConfigManager.getDefaultMaxInputTokens(),
          maxOutputTokens:
            remoteModel.maxOutputTokens ||
            ConfigManager.getDefaultMaxOutputTokens(),
          capabilities: remoteModel.capabilities || {},
          isUserSelectable: true,
        };
        existingModels.push(newModel);
        added++;
      } else {
        const hasChanges =
          existing.name !== (remoteModel.name || remoteModel.id) ||
          existing.maxInputTokens !== remoteModel.maxInputTokens ||
          existing.maxOutputTokens !== remoteModel.maxOutputTokens;

        if (hasChanges) {
          existing.name = remoteModel.name || remoteModel.id;
          existing.family = remoteModel.family || existing.family;
          existing.maxInputTokens =
            remoteModel.maxInputTokens || existing.maxInputTokens;
          existing.maxOutputTokens =
            remoteModel.maxOutputTokens || existing.maxOutputTokens;
          if (remoteModel.capabilities) {
            existing.capabilities = {
              ...existing.capabilities,
              ...remoteModel.capabilities,
            };
          }
          updated++;
        }
        existingModelMap.delete(remoteModel.id);
      }
    }

    provider.models = existingModels;
    providers[providerIndex] = provider;

    await this.manager.saveProviders(providers);

    const result: SyncResult = {
      added,
      updated,
      totalRemote: remoteModels.length,
      mutated: added > 0 || updated > 0,
    };

    logger.info("Provider models synced", {
      providerId,
      ...result,
    });

    return result;
  }

  /**
   * Delete a provider and all its models
   */
  async deleteProvider(providerId: string): Promise<void> {
    await this.manager.deleteProvider(providerId);
    logger.info("Provider deleted", { providerId });
  }

  /**
   * Set API key for a provider
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.manager.setApiKey(providerId, apiKey);
    logger.info("Provider API key updated", { providerId });
  }
}
