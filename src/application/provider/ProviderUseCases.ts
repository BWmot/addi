import { Model } from '../../common/types';
import { ProviderModelManager } from '../../core/providers/ProviderModelManager';
import { logger } from '../../common/logger';

export interface SyncResult {
  added: number;
  updated: number;
  totalRemote: number;
  mutated: boolean;
}

/**
 * Provider-related use cases
 * Business logic extracted from ProviderCommandHandler
 */
export class ProviderUseCases {
  constructor(private manager: ProviderModelManager) {}

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

    // TODO: Fetch from actual provider API
    // This is a placeholder that should be replaced with actual provider API calls
    const remoteModels: Model[] = [];

    const existingModels = provider.models || [];
    let added = 0;
    let updated = 0;

    // Merge remote models with existing ones
    for (const remoteModel of remoteModels) {
      const existingIndex = existingModels.findIndex((m) => m.id === remoteModel.id);

      if (existingIndex === -1) {
        existingModels.push(remoteModel);
        added++;
      } else {
        // Update existing model if remote has newer version
        existingModels[existingIndex] = remoteModel;
        updated++;
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

    logger.info('Provider models synced', {
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
    logger.info('Provider deleted', { providerId });
  }

  /**
   * Set API key for a provider
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.manager.setApiKey(providerId, apiKey);
    logger.info('Provider API key updated', { providerId });
  }
}
