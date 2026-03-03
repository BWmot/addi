import * as vscode from 'vscode';
import { BaseCommandHandler } from './base';
import { Provider } from '../../common/types';
import { UserFeedback, IdGenerator } from '../../common/utils';
import { logger } from '../../common/logger';

/**
 * Configuration-related command handler
 */
export class ConfigCommandHandler extends BaseCommandHandler {
  /**
   * Export configuration to file or clipboard
   */
  async exportConfig(): Promise<void> {
    logger.info('Command exportConfig invoked');
    try {
      const allProviders = this.manager.getProviders();
      if (allProviders.length === 0) {
        UserFeedback.showWarning('No configurations to export');
        logger.warn('exportConfig aborted: no providers configured');
        return;
      }

      // 1. Select providers
      const selectedProviders = await this.selectProvidersForExport(allProviders);
      if (!selectedProviders || selectedProviders.length === 0) {
        logger.debug('exportConfig canceled at provider selection');
        return;
      }

      // 2. Determine if API Keys should be included
      const includeApiKeys = await vscode.window.showQuickPick(
        [
          { label: 'Yes', description: 'Include API Keys (from local storage)' },
          { label: 'No', description: 'Exclude API Keys' },
        ],
        {
          title: 'Include API Keys in Export?',
          placeHolder: 'Choose whether to include API Keys',
        }
      );

      if (!includeApiKeys) {
        logger.debug('exportConfig canceled at API key inclusion selection');
        return;
      }

      const shouldIncludeApiKeys = includeApiKeys.label === 'Yes';

      // 3. Selection Destination
      const destination = await vscode.window.showQuickPick(['Save to File', 'Copy to Clipboard'], {
        title: 'Export Destination',
        placeHolder: 'Where do you want to save the configuration?',
      });

      if (!destination) {
        logger.debug('exportConfig canceled at destination selection');
        return;
      }

      const encoded = await this.encodeProvidersForExport(selectedProviders, shouldIncludeApiKeys);

      if (destination === 'Save to File') {
        const defaultFileName = 'addi-config.json';
        const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const defaultUri = firstWorkspaceFolder
          ? vscode.Uri.joinPath(firstWorkspaceFolder, defaultFileName)
          : undefined;

        const saveDialogOptions: vscode.SaveDialogOptions = {
          filters: {
            'Config Files': ['json'],
            'All Files': ['*'],
          },
          title: 'Export Configuration',
        };

        if (defaultUri) {
          saveDialogOptions.defaultUri = defaultUri;
        }

        const uri = await vscode.window.showSaveDialog(saveDialogOptions);
        if (!uri) {
          logger.debug('exportConfig canceled at save dialog');
          return;
        }

        const targetUri = this.ensureJsonExtension(uri);
        await UserFeedback.showProgress('Saving to file...', async () => {
          await vscode.workspace.fs.writeFile(targetUri, Buffer.from(encoded, 'utf8'));
          UserFeedback.showInfo(`Configuration exported to ${targetUri.fsPath}`);
        });
      } else {
        await vscode.env.clipboard.writeText(encoded);
        UserFeedback.showInfo('Configuration copied to clipboard');
      }

      logger.info('Configuration exported', {
        providerCount: selectedProviders.length,
        includeApiKeys: shouldIncludeApiKeys,
        destination,
      });

      this.refreshTreeView();
    } catch (error) {
      UserFeedback.showError(
        `Failed to export configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      this.logError('exportConfig failed', error);
    }
  }

  /**
   * Import configuration from file or clipboard
   */
  async importConfig(): Promise<void> {
    logger.info('Command importConfig invoked');
    try {
      // 1. Selection Source
      const source = await vscode.window.showQuickPick(
        ['Import from File', 'Import from Clipboard'],
        {
          title: 'Import Source',
          placeHolder: 'Where is the configuration located?',
        }
      );

      if (!source) {
        logger.debug('importConfig canceled at source selection');
        return;
      }

      let content: string;
      if (source === 'Import from File') {
        const openDialogOptions: vscode.OpenDialogOptions = {
          filters: {
            'Config Files': ['json', 'txt'],
            'All Files': ['*'],
          },
          title: 'Import Configuration',
          canSelectMany: false,
        };

        const uri = await vscode.window.showOpenDialog(openDialogOptions);
        if (!uri || uri.length === 0) {
          logger.debug('importConfig canceled at file selection');
          return;
        }
        const data = await vscode.workspace.fs.readFile(uri[0]!);
        content = new TextDecoder().decode(data);
      } else {
        content = await vscode.env.clipboard.readText();
        if (!content || content.trim().length === 0) {
          UserFeedback.showError('Clipboard is empty');
          return;
        }
      }

      const trimmedContent = content.trim();

      // 2. Parse JSON and check format
      let providersToImport: Provider[];
      try {
        const parsed = JSON.parse(trimmedContent);

        if (Array.isArray(parsed)) {
          providersToImport = parsed;
        } else if (parsed.providers && Array.isArray(parsed.providers)) {
          providersToImport = parsed.providers;
        } else {
          throw new Error('Invalid configuration format');
        }

        if (providersToImport.length === 0) {
          throw new Error('No valid providers found in configuration');
        }
        this.validateProviders(providersToImport);
      } catch (err) {
        throw new Error(
          `Failed to parse configuration: ${err instanceof Error ? err.message : 'Invalid format'}`
        );
      }

      // 3. Ask about API Keys
      const hasApiKeys = providersToImport.some((p) => !!p.apiKey);
      let shouldImportApiKeys = false;

      if (hasApiKeys) {
        const includeApiKeys = await vscode.window.showQuickPick(
          [
            { label: 'Yes', description: 'Import API Keys from configuration' },
            { label: 'No', description: 'Skip API Keys (keep local)' },
          ],
          {
            title: 'Import API Keys?',
            placeHolder: 'Configuration contains API Keys. Import them?',
          }
        );

        if (!includeApiKeys) {
          logger.debug('importConfig canceled at API key selection');
          return;
        }

        shouldImportApiKeys = includeApiKeys.label === 'Yes';
      }

      // Strip API Keys if not importing them
      if (!shouldImportApiKeys) {
        providersToImport = providersToImport.map((p) => {
          const { apiKey: _apiKey, ...rest } = p;
          return rest as Provider;
        });
      }

      // 4. Provider Selection
      const selectedToImport = await this.selectProvidersForImport(providersToImport);
      if (!selectedToImport || selectedToImport.length === 0) {
        logger.debug('importConfig canceled at provider selection');
        return;
      }

      // 5. Merge/Conflict Resolution
      await UserFeedback.showProgress('Importing configuration...', async () => {
        const currentProviders = this.manager.getProviders();
        const mergedProviders = [...currentProviders];

        for (const provider of selectedToImport) {
          const existingIndex = mergedProviders.findIndex((p) => p.id === provider.id);
          if (existingIndex !== -1) {
            const result = await vscode.window.showWarningMessage(
              `Provider "${provider.name}" (ID: ${provider.id}) already exists.`,
              { modal: false },
              'Overwrite',
              'Skip',
              'Keep Both (Rename)'
            );

            if (result === 'Overwrite') {
              mergedProviders[existingIndex] = provider;
            } else if (result === 'Keep Both (Rename)') {
              const newProvider = {
                ...provider,
                id: IdGenerator.generate(),
                name: `${provider.name} (Imported)`,
              };
              mergedProviders.push(newProvider);
            }
          } else {
            mergedProviders.push(provider);
          }
        }

        await this.manager.saveProviders(mergedProviders);

        // Import API Keys to SecretStorage if requested
        if (shouldImportApiKeys) {
          for (const provider of selectedToImport) {
            if (provider.apiKey) {
              await this.manager.setApiKey(provider.id, provider.apiKey);
            }
          }
        }

        this.refreshTreeView();
        UserFeedback.showInfo(`${selectedToImport.length} provider(s) imported successfully`);
        logger.info('Configuration imported successfully', {
          providerCount: selectedToImport.length,
        });
      });
    } catch (error) {
      UserFeedback.showError(
        `Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      this.logError('importConfig failed', error);
    }
  }

  /**
   * Reset all plugin settings to their default values
   */
  async resetAllSettings(): Promise<void> {
    logger.info('Command resetAllSettings invoked');

    const confirmResult = await vscode.window.showWarningMessage(
      'This will reset all Addi settings (addi.*) to their default values. Your provider and model data will NOT be affected.',
      { modal: true },
      { title: 'Reset Settings', isDangerous: true },
      { title: 'Cancel', isCloseAffordance: true }
    );

    if (confirmResult?.title !== 'Reset Settings') {
      logger.debug('resetAllSettings canceled by user');
      return;
    }

    try {
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

      UserFeedback.showInfo('All Addi settings have been reset to default values');
      logger.info('resetAllSettings: completed successfully');
    } catch (error) {
      UserFeedback.showError(
        `Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      this.logError('resetAllSettings failed', error);
    }
  }

  /**
   * Clear all plugin storage data
   */
  async cleanAllStorage(): Promise<void> {
    logger.info('Command cleanAllStorage invoked');

    if (!this.storageService) {
      UserFeedback.showError('Storage service not initialized');
      return;
    }

    const warningResult = await vscode.window.showWarningMessage(
      'This will delete ALL plugin data including:\n' +
        '- All providers and their models\n' +
        '- All API keys from SecretStorage\n' +
        '- Provider configuration and stats\n' +
        'This action cannot be undone!',
      { modal: true },
      { title: 'Delete All Data', isDangerous: true },
      { title: 'Cancel', isCloseAffordance: true }
    );

    if (!warningResult || warningResult.title === 'Cancel') {
      logger.debug('cleanAllStorage canceled by user');
      return;
    }

    try {
      await UserFeedback.showProgress('Clearing all storage...', async () => {
        await this.storageService!.clearAllData();
        this.refreshTreeView();
        UserFeedback.showInfo('All plugin storage data has been cleared');
        logger.info('cleanAllStorage: completed successfully');
      });
    } catch (error) {
      UserFeedback.showError(
        `Failed to clear storage: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      this.logError('cleanAllStorage failed', error);
    }
  }

  // ==================== Private Helper Methods ====================

  private async selectProvidersForExport(providers: Provider[]) {
    const items = providers.map((p) => ({
      label: p.name,
      description: `${p.models.length} model(s)`,
      detail: p.apiEndpoint || '',
      provider: p,
      picked: true,
    }));

    const selection = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: 'Export: Pick Providers',
      placeHolder: 'Pick the providers you want to export',
    });

    return selection?.map((s) => s.provider);
  }

  private async selectProvidersForImport(providers: Provider[]) {
    const items = providers.map((p) => ({
      label: p.name,
      description: `${p.models.length} model(s)`,
      detail: p.apiEndpoint || '',
      provider: p,
      picked: true,
    }));

    const selection = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: 'Import: Pick Providers',
      placeHolder: 'Pick the providers you want to import',
    });

    return selection?.map((s) => s.provider);
  }

  private validateProviders(providers: Provider[]): void {
    for (const provider of providers) {
      if (!provider.id || !provider.name || !Array.isArray(provider.models)) {
        throw new Error(`Provider "${provider.name || 'unknown'}" is malformed`);
      }
      for (const m of provider.models) {
        if ((!m.id || !m.name) && (!m.rid || !m.name)) {
          throw new Error(
            `Model in provider "${provider.name}" is missing required fields (need id/rid and name)`
          );
        }
      }
    }
  }

  private async encodeProvidersForExport(
    providers: Provider[],
    includeApiKeys: boolean
  ): Promise<string> {
    const exportData = await Promise.all(
      providers.map(async (p) => {
        const { apiKey: _apiKey, ...providerData } = p;
        let apiKeyValue: string | undefined;

        if (includeApiKeys) {
          try {
            apiKeyValue = await this.manager.getApiKey(p.id);
          } catch {
            // Ignore errors getting API key
          }
        }

        return {
          ...providerData,
          ...(apiKeyValue && { apiKey: apiKeyValue }),
        };
      })
    );

    const exportMeta = {
      version: 1,
      exportedAt: Date.now(),
      apiKeysIncluded: includeApiKeys,
    };

    return JSON.stringify({ ...exportMeta, providers: exportData }, null, 2);
  }

  private ensureJsonExtension(uri: vscode.Uri): vscode.Uri {
    if (uri.fsPath.endsWith('.json')) {
      return uri;
    }
    return vscode.Uri.file(uri.fsPath + '.json');
  }
}
