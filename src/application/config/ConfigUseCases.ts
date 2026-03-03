import * as vscode from 'vscode';
import { Provider } from '../../common/types';
import { ProviderModelManager } from '../../core/providers/ProviderModelManager';
import { IStorageService } from '../../domain/interfaces';
import { logger } from '../../common/logger';

export interface ImportResult {
  providerCount: number;
  apiKeysImported: number;
}

/**
 * Configuration-related use cases
 * Business logic extracted from ConfigCommandHandler
 */
export class ConfigUseCases {
  constructor(
    private manager: ProviderModelManager,
    private storageService?: IStorageService
  ) {}

  /**
   * Export providers to JSON string
   */
  async exportProviders(providers: Provider[], includeApiKeys: boolean): Promise<string> {
    let providersToExport = [...providers];

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
    logger.info('Configuration exported', {
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
    shouldImportApiKeys: boolean
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
      const existingIndex = mergedProviders.findIndex((p) => p.id === provider.id);
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
   * Reset all plugin settings to default values
   */
  async resetAllSettings(): Promise<void> {
    const config = vscode.workspace.getConfiguration('addi');
    const settingsToReset = [
      'defaultMaxInputTokens',
      'defaultMaxOutputTokens',
      'confirmDelete',
      'sortRule',
      'sortTarget',
      'syncConfiguration',
    ];

    for (const setting of settingsToReset) {
      await config.update(setting, undefined, vscode.ConfigurationTarget.Global);
    }

    logger.info('Settings reset to defaults');
  }

  /**
   * Clear all storage data
   */
  async cleanAllStorage(): Promise<void> {
    if (!this.storageService) {
      throw new Error('Storage service not initialized');
    }

    // Clear all providers
    await this.manager.saveProviders([]);

    // Clear all API keys
    const providers = this.manager.getProviders();
    for (const provider of providers) {
      await this.manager.deleteApiKey(provider.id);
    }

    logger.info('All storage data cleared');
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
