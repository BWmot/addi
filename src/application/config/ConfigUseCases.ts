import type { Provider } from "../../common/types";
import type { ProviderModelManager } from "../../core/providers/ProviderModelManager";
import { logger } from "../../common/logger";

export interface ImportResult {
  providerCount: number;
  apiKeysImported: number;
}

/**
 * Configuration-related use cases
 * Business logic extracted from ConfigCommandHandler
 */
export class ConfigUseCases {
  constructor(private manager: ProviderModelManager) {}

  /**
   * Export providers to JSON string
   */
  async exportProviders(
    providers: Provider[],
    includeApiKeys: boolean,
  ): Promise<string> {
    const providersToExport = [...providers];

    // Fetch API keys if requested
    if (includeApiKeys) {
      for (const provider of providersToExport) {
        const apiKey = await this.manager.getApiKey(provider.id);
        if (apiKey) {
          (provider as any).apiKey = apiKey;
        }
      }
    }

    const encoded = JSON.stringify(providersToExport, null, 2);
    logger.info("Configuration exported", {
      providerCount: providers.length,
      includeApiKeys,
    });

    return encoded;
  }

  /**
   * Import providers from JSON string
   */
  async importProviders(
    providersToImport: Provider[],
    shouldImportApiKeys: boolean,
  ): Promise<ImportResult> {
    // Strip API Keys if not importing them
    if (!shouldImportApiKeys) {
      providersToImport = providersToImport.map((p) => {
        const { apiKey: _apiKey, ...rest } = p;
        return rest as Provider;
      });
    }

    // Merge with existing providers
    const currentProviders = this.manager.getProviders();
    const mergedProviders = [...currentProviders];

    for (const provider of providersToImport) {
      const existingIndex = mergedProviders.findIndex(
        (p) => p.id === provider.id,
      );
      if (existingIndex !== -1) {
        // Provider exists - will be handled by caller for conflict resolution
        mergedProviders[existingIndex] = provider;
      } else {
        mergedProviders.push(provider);
      }
    }

    await this.manager.saveProviders(mergedProviders);

    // Import API Keys to SecretStorage if requested
    let apiKeysImported = 0;
    if (shouldImportApiKeys) {
      for (const provider of providersToImport) {
        if ((provider as any).apiKey) {
          await this.manager.setApiKey(provider.id, (provider as any).apiKey);
          apiKeysImported++;
        }
      }
    }

    return {
      providerCount: providersToImport.length,
      apiKeysImported,
    };
  }

  /**
   * Get all providers
   */
  getProviders(): Provider[] {
    return this.manager.getProviders();
  }

  /**
   * Save providers
   */
  async saveProviders(providers: Provider[]): Promise<void> {
    await this.manager.saveProviders(providers);
  }
}
