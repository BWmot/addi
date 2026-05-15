import * as vscode from "vscode";
import { BaseCommandHandler } from "./base";
import type { Provider } from "../../common/types";
import { UserFeedback } from "../utils/feedback";
import { IdGenerator } from "../../common/utils";
import { ConfigManager } from "../../infrastructure/vscode/configService";
import { logger, LogScope } from "../../common/logger";
import { CryptoService, type ProviderApiKeys } from "../../infrastructure/crypto";

/**
 * Configuration-related command handler
 */
export class ConfigCommandHandler extends BaseCommandHandler {
  /**
   * Export configuration to file or clipboard
   */
  async exportConfig(): Promise<void> {
    logger.info("Command exportConfig invoked", undefined, LogScope.COMMAND);
    try {
      const allProviders = this.manager.getProviders();
      if (allProviders.length === 0) {
        UserFeedback.showWarning(vscode.l10n.t("No configurations to export"));
        logger.warn("exportConfig aborted: no providers configured", undefined, LogScope.COMMAND);
        return;
      }

      // 1. Select providers
      const selectedProviders = await this.selectProvidersForExport(allProviders);
      if (!selectedProviders || selectedProviders.length === 0) {
        logger.debug("exportConfig canceled at provider selection", undefined, LogScope.COMMAND);
        return;
      }

      // 2. Prompt for password (enter password to encrypt, empty to exclude ApiKey)
      const password = await this.promptForEncryptionPassword();
      if (password === undefined) {
        logger.debug("exportConfig canceled at password prompt", undefined, LogScope.COMMAND);
        return;
      }

      // 3. Selection Destination
      const destination = await vscode.window.showQuickPick(
        [vscode.l10n.t("Save to File"), vscode.l10n.t("Copy to Clipboard")],
        {
          title: vscode.l10n.t("Export Destination"),
          placeHolder: vscode.l10n.t("Where do you want to save the configuration?"),
        },
      );

      if (!destination) {
        logger.debug("exportConfig canceled at destination selection", undefined, LogScope.COMMAND);
        return;
      }

      const encoded = await this.encodeProvidersForExport(selectedProviders, password);

      if (destination === "Save to File") {
        const defaultFileName = "addi-config.json";
        const firstWorkspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
        const defaultUri = firstWorkspaceFolder
          ? vscode.Uri.joinPath(firstWorkspaceFolder, defaultFileName)
          : undefined;

        const saveDialogOptions: vscode.SaveDialogOptions = {
          filters: {
            [vscode.l10n.t("Config Files")]: ["json"],
            [vscode.l10n.t("All Files")]: ["*"],
          },
          title: vscode.l10n.t("Export Configuration"),
        };

        if (defaultUri) {
          saveDialogOptions.defaultUri = defaultUri;
        }

        const uri = await vscode.window.showSaveDialog(saveDialogOptions);
        if (!uri) {
          logger.debug("exportConfig canceled at save dialog", undefined, LogScope.COMMAND);
          return;
        }

        const targetUri = this.ensureJsonExtension(uri);
        await UserFeedback.showProgress(vscode.l10n.t("Saving to file..."), async () => {
          await vscode.workspace.fs.writeFile(targetUri, Buffer.from(encoded, "utf8"));
          UserFeedback.showInfo(vscode.l10n.t("Configuration exported to {0}", targetUri.fsPath));
        });
      } else {
        await vscode.env.clipboard.writeText(encoded);
        UserFeedback.showInfo(vscode.l10n.t("Configuration copied to clipboard"));
      }

      logger.info(
        "Configuration exported",
        {
          providerCount: selectedProviders.length,
          hasPassword: !!password,
          destination,
        },
        LogScope.COMMAND,
      );

      this.refreshTreeView();
    } catch (error) {
      UserFeedback.showError(
        vscode.l10n.t(
          "Failed to export configuration: {0}",
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
      this.logError("exportConfig failed", error);
    }
  }

  /**
   * Import configuration from file or clipboard
   */
  async importConfig(): Promise<void> {
    logger.info("Command importConfig invoked", undefined, LogScope.COMMAND);
    try {
      // 1. Selection Source
      const source = await vscode.window.showQuickPick(
        [vscode.l10n.t("Import from File"), vscode.l10n.t("Import from Clipboard")],
        {
          title: vscode.l10n.t("Import Source"),
          placeHolder: vscode.l10n.t("Where is the configuration located?"),
        },
      );

      if (!source) {
        logger.debug("importConfig canceled at source selection", undefined, LogScope.COMMAND);
        return;
      }

      let content: string;
      if (source === "Import from File") {
        const openDialogOptions: vscode.OpenDialogOptions = {
          filters: {
            [vscode.l10n.t("Config Files")]: ["json", "txt"],
            [vscode.l10n.t("All Files")]: ["*"],
          },
          title: vscode.l10n.t("Import Configuration"),
          canSelectMany: false,
        };

        const uri = await vscode.window.showOpenDialog(openDialogOptions);
        if (!uri || uri.length === 0) {
          logger.debug("importConfig canceled at file selection", undefined, LogScope.COMMAND);
          return;
        }
        const data = await vscode.workspace.fs.readFile(uri[0]!);
        content = new TextDecoder().decode(data);
      } else {
        content = await vscode.env.clipboard.readText();
        if (!content || content.trim().length === 0) {
          UserFeedback.showError(vscode.l10n.t("Clipboard is empty"));
          return;
        }
      }

      const trimmedContent = content.trim();

      // 2. Parse JSON and check format
      let providersToImport: Provider[];
      let encryptedApiKeys: ProviderApiKeys | null = null;
      try {
        const parsed = JSON.parse(trimmedContent);

        if (Array.isArray(parsed)) {
          // Legacy format: raw provider array (version 0 implicit)
          providersToImport = parsed;
        } else if (parsed.providers && Array.isArray(parsed.providers)) {
          providersToImport = parsed.providers;
          // Validate version compatibility
          if (parsed.version !== undefined) {
            const v = Number(parsed.version);
            if (!Number.isFinite(v) || v < 1 || v > 1) {
              UserFeedback.showWarning(
                vscode.l10n.t(
                  'Export version "{0}" may not be fully compatible with this extension. Proceed with caution.',
                  String(parsed.version),
                ),
              );
            }
          }
          // Check for encrypted API Keys
          if (parsed.encryptionApiKey) {
            const password = await this.promptForDecryptionPassword();
            if (password === undefined) {
              logger.debug(
                "importConfig canceled at decryption password prompt",
                undefined,
                LogScope.COMMAND,
              );
              return;
            }
            encryptedApiKeys = CryptoService.decryptApiKeys(parsed.encryptionApiKey, password);
            if (!encryptedApiKeys) {
              UserFeedback.showWarning(
                vscode.l10n.t(
                  "Failed to decrypt API Keys from config (wrong password?), API Keys will be skipped",
                ),
              );
              logger.warn("importConfig: failed to decrypt API keys", undefined, LogScope.COMMAND);
            }
          }
        } else {
          throw new Error("Invalid configuration format");
        }

        if (providersToImport.length === 0) {
          throw new Error("No valid providers found in configuration");
        }
        this.validateProviders(providersToImport);
      } catch (err) {
        throw new Error(
          vscode.l10n.t(
            "Failed to parse configuration: {0}",
            err instanceof Error ? err.message : "Invalid format",
          ),
          { cause: err },
        );
      }

      // 3. Merge encrypted ApiKeys into providers if decryption was successful
      if (encryptedApiKeys) {
        providersToImport = providersToImport.map((p) => {
          const encryptedKey = encryptedApiKeys[p.id];
          if (encryptedKey) {
            return { ...p, apiKey: encryptedKey };
          }
          return p;
        });
      }

      // 4. Provider Selection
      const selectedToImport = await this.selectProvidersForImport(providersToImport);
      if (!selectedToImport || selectedToImport.length === 0) {
        logger.debug("importConfig canceled at provider selection", undefined, LogScope.COMMAND);
        return;
      }

      // 4b. Auto-backup before merge (only if there are existing providers to protect)
      const currentProviders = this.manager.getProviders();
      if (currentProviders.length > 0) {
        try {
          await this.manager.createBackup(vscode.l10n.t("Auto-backup before import"));
          logger.debug("Auto-backup created before import", undefined, LogScope.COMMAND);
        } catch (err) {
          logger.warn("Failed to create auto-backup before import", err, LogScope.COMMAND);
          // Non-fatal: proceed without backup
        }
      }

      // 5. Merge/Conflict Resolution
      await UserFeedback.showProgress(vscode.l10n.t("Importing configuration..."), async () => {
        const currentProviders = this.manager.getProviders();
        const mergedProviders = [...currentProviders];

        for (const provider of selectedToImport) {
          const existingIndex = mergedProviders.findIndex((p) => p.id === provider.id);
          if (existingIndex !== -1) {
            const result = await vscode.window.showWarningMessage(
              vscode.l10n.t('Provider "{0}" (ID: {1}) already exists.', provider.name, provider.id),
              { modal: false },
              vscode.l10n.t("Overwrite"),
              vscode.l10n.t("Skip"),
              vscode.l10n.t("Keep Both (Rename)"),
            );

            if (result === vscode.l10n.t("Overwrite")) {
              mergedProviders[existingIndex] = provider;
            } else if (result === vscode.l10n.t("Keep Both (Rename)")) {
              const newProvider = {
                ...provider,
                id: IdGenerator.generate(),
                name: vscode.l10n.t("{0} (Imported)", provider.name),
              };
              mergedProviders.push(newProvider);
            }
          } else {
            mergedProviders.push(provider);
          }
        }

        // Strip apiKey from merged providers before save (apiKey handled separately below)
        const mergedForSave = mergedProviders.map(({ apiKey: _ak, ...rest }) => rest as Provider);
        await this.manager.saveProviders(mergedForSave);

        // Import API Keys to SecretStorage using the FINAL provider IDs
        for (const provider of mergedProviders) {
          const apiKey =
            selectedToImport.find((p) => p.id === provider.id)?.apiKey ??
            selectedToImport.find((p) => p.name === provider.name)?.apiKey;
          if (apiKey) {
            await this.manager.setApiKey(provider.id, apiKey);
          }
        }

        this.refreshTreeView();
        UserFeedback.showInfo(
          vscode.l10n.t("{0} provider(s) imported successfully", selectedToImport.length),
        );
        logger.info(
          "Configuration imported successfully",
          {
            providerCount: selectedToImport.length,
          },
          LogScope.COMMAND,
        );
      });
    } catch (error) {
      UserFeedback.showError(
        vscode.l10n.t(
          "Failed to import configuration: {0}",
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
      this.logError("importConfig failed", error);
    }
  }

  /**
   * Initialize / Reset the extension.
   * This combines storage clearing into one operation.
   * Shows a confirmation dialog before proceeding.
   */
  async initExtension(): Promise<void> {
    logger.info("Command initExtension invoked", undefined, LogScope.COMMAND);

    if (!this.storageService) {
      UserFeedback.showError(vscode.l10n.t("Storage service not initialized"));
      return;
    }

    // Auto-backup before dangerous operation
    const currentProviders = this.manager.getProviders();
    if (currentProviders.length > 0) {
      try {
        await this.manager.createBackup(vscode.l10n.t("Auto-backup before initialize extension"));
        logger.debug("Auto-backup created before initExtension", undefined, LogScope.COMMAND);
      } catch (err) {
        logger.warn("Failed to create auto-backup before initExtension", err, LogScope.COMMAND);
        // Non-fatal: continue
      }
    }

    const warningResult = await vscode.window.showWarningMessage(
      vscode.l10n.t("Initialize Addi Extension"),
      {
        modal: true,
        detail: vscode.l10n.t(
          "This will clear ALL addi-related storage and reset all settings to defaults.\n\nYou will need to reconfigure the extension after this operation.\n\nContinue?",
        ),
      },
      { title: vscode.l10n.t("Initialize"), isDangerous: true },
      { title: vscode.l10n.t("Cancel"), isCloseAffordance: true },
    );

    if (!warningResult || warningResult.title === vscode.l10n.t("Cancel")) {
      logger.debug("initExtension canceled by user", undefined, LogScope.COMMAND);
      return;
    }

    try {
      await UserFeedback.showProgress(vscode.l10n.t("Initializing extension..."), async () => {
        // Step 1: Clear all storage data using wildcard pattern
        await this.storageService!.clearAllData();

        // Step 2: Refresh tree view
        this.refreshTreeView();

        // Step 3: Show success message
        UserFeedback.showInfo(
          vscode.l10n.t("Addi extension has been initialized. Please reconfigure your providers."),
        );
        logger.info("initExtension: completed successfully", undefined, LogScope.COMMAND);
      });
    } catch (error) {
      UserFeedback.showError(
        vscode.l10n.t(
          "Failed to initialize extension: {0}",
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
      this.logError("initExtension failed", error);
    }
  }

  /**
   * Restore providers from a local backup
   */
  async restoreFromBackup(): Promise<void> {
    logger.info("Command restoreFromBackup invoked", undefined, LogScope.COMMAND);

    const backups = this.manager.listBackups();
    if (backups.length === 0) {
      UserFeedback.showInfo(
        vscode.l10n.t(
          "No backups available. Backups are created automatically before import, reset, or clear operations.",
        ),
      );
      return;
    }

    // Build quick-pick items (newest first)
    const items = backups.map((b) => ({
      label: this.formatBackupLabel(b),
      description: b.description,
      backup: b,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t("Restore from Backup"),
      placeHolder: vscode.l10n.t("Select a backup to restore"),
      canPickMany: false,
    });

    if (!selected) {
      logger.debug("restoreFromBackup canceled by user", undefined, LogScope.COMMAND);
      return;
    }

    const backup = selected.backup;

    // Confirm before overwriting
    const confirmResult = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        "Restore backup from {0}?\nThis will replace your current providers with {1} provider(s) from the backup.\nYour current data will be lost unless you have another backup.",
        new Date(backup.timestamp).toLocaleString(),
        backup.providerCount,
      ),
      { modal: true },
      { title: vscode.l10n.t("Restore"), isDangerous: true },
      { title: vscode.l10n.t("Cancel"), isCloseAffordance: true },
    );

    if (confirmResult?.title !== vscode.l10n.t("Restore")) {
      logger.debug("restoreFromBackup canceled by user", undefined, LogScope.COMMAND);
      return;
    }

    try {
      // Get the backup snapshot (does NOT auto-save — caller controls persistence)
      const restoredProviders = this.manager.restoreBackup(backup.id);

      // Create a safety backup of current state before overwriting
      await this.manager.createBackup(vscode.l10n.t("Auto-backup before restore"));

      // Persist the restored providers
      await this.manager.saveProviders(restoredProviders);

      this.refreshTreeView();
      UserFeedback.showInfo(
        vscode.l10n.t(
          "Restored {0} provider(s) from backup. Note: API keys from SecretStorage are NOT included in backups. You will need to re-enter them manually if needed.",
          restoredProviders.length,
        ),
      );
      logger.info(
        "restoreFromBackup: completed successfully",
        {
          restoredCount: restoredProviders.length,
          backupId: backup.id,
        },
        LogScope.COMMAND,
      );
    } catch (error) {
      UserFeedback.showError(
        vscode.l10n.t(
          "Failed to restore backup: {0}",
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
      this.logError("restoreFromBackup failed", error);
    }
  }

  /**
   * List and manage local backups
   */
  async manageBackups(): Promise<void> {
    logger.info("Command manageBackups invoked", undefined, LogScope.COMMAND);

    const backups = this.manager.listBackups();
    if (backups.length === 0) {
      UserFeedback.showInfo(
        vscode.l10n.t(
          "No backups available. Backups are created automatically before dangerous operations.",
        ),
      );
      return;
    }

    // Build quick-pick items
    const items = backups.map((b) => ({
      label: this.formatBackupLabel(b),
      description: b.description,
      detail: vscode.l10n.t(
        "{0} provider(s) — {1}",
        b.providerCount,
        b.providers.map((p) => p.name).join(", "),
      ),
      backup: b,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: vscode.l10n.t("Manage Backups"),
      placeHolder: vscode.l10n.t("Select a backup to delete (ESC to cancel)"),
      canPickMany: false,
    });

    if (!selected) {
      logger.debug("manageBackups canceled by user", undefined, LogScope.COMMAND);
      return;
    }

    const confirmDelete = await vscode.window.showWarningMessage(
      vscode.l10n.t(
        "Delete backup from {0}?",
        new Date(selected.backup.timestamp).toLocaleString(),
      ),
      { modal: true },
      { title: vscode.l10n.t("Delete"), isDangerous: true },
      { title: vscode.l10n.t("Cancel"), isCloseAffordance: true },
    );

    if (confirmDelete?.title !== vscode.l10n.t("Delete")) {
      logger.debug("manageBackups: delete canceled by user", undefined, LogScope.COMMAND);
      return;
    }

    this.manager.deleteBackup(selected.backup.id);
    UserFeedback.showInfo(vscode.l10n.t("Backup deleted."));
    logger.info(
      "manageBackups: deleted backup",
      {
        backupId: selected.backup.id,
      },
      LogScope.COMMAND,
    );
  }

  // ==================== Private Helper Methods ====================

  private formatBackupLabel(backup: {
    timestamp: number;
    providerCount: number;
    description: string;
  }): string {
    const date = new Date(backup.timestamp);
    const dateStr = date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const timeStr = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dateStr} ${timeStr} — ${backup.providerCount} provider(s) — ${backup.description}`;
  }

  private async selectProvidersForExport(providers: Provider[]) {
    const items = providers.map((p) => ({
      label: p.name,
      description: `${p.models.length} model(s)`,
      detail: p.apiEndpoint || "",
      provider: p,
      picked: true,
    }));

    const selection = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: "Export: Pick Providers",
      placeHolder: "Pick the providers you want to export",
    });

    return selection?.map((s) => s.provider);
  }

  private async selectProvidersForImport(providers: Provider[]) {
    const items = providers.map((p) => ({
      label: p.name,
      description: `${p.models.length} model(s)`,
      detail: p.apiEndpoint || "",
      provider: p,
      picked: true,
    }));

    const selection = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: "Import: Pick Providers",
      placeHolder: "Pick the providers you want to import",
    });

    return selection?.map((s) => s.provider);
  }

  /**
   * Validate and auto-complete imported providers/models.
   * Auto-fills missing fields with sensible defaults.
   */
  private validateProviders(providers: Provider[]): void {
    for (const provider of providers) {
      if (!provider.id || !provider.name || !Array.isArray(provider.models)) {
        throw new Error(`Provider "${provider.name || "unknown"}" is malformed`);
      }
      for (const m of provider.models) {
        if ((!m.id || !m.name) && (!m.rid || !m.name)) {
          throw new Error(
            `Model in provider "${provider.name}" is missing required fields (need id/rid and name)`,
          );
        }
        // Auto-fill missing fields with defaults from ConfigManager
        if (!m.id) {
          m.id = IdGenerator.generate();
        }
        if (!m.rid) {
          // rid is the remote model identifier used in API calls (e.g. "gpt-4o")
          // Cannot infer from display name — requires explicit value
          throw new Error(
            `Model "${m.name}" in provider "${provider.name}" is missing "rid" (remote model identifier)`,
          );
        }
        if (!m.family) {
          m.family = ConfigManager.getDefaultModelFamily();
        }
        if (m.version === undefined || m.version === null) {
          m.version = ConfigManager.getDefaultModelVersion();
        }
        if (!m.maxInputTokens) {
          m.maxInputTokens = ConfigManager.getDefaultMaxInputTokens();
        }
        if (!m.maxOutputTokens) {
          m.maxOutputTokens = ConfigManager.getDefaultMaxOutputTokens();
        }
        // Auto-construct capabilities if missing
        if (!m.capabilities) {
          m.capabilities = {
            toolCalling: true,
          };
        }
      }
    }
  }

  /**
   * Prompt user for encryption password during export
   * @returns password string, or undefined if cancelled/empty
   */
  private async promptForEncryptionPassword(): Promise<string | undefined> {
    const result = await vscode.window.showInputBox({
      title: vscode.l10n.t("Export Configuration - API Key Security"),
      prompt: vscode.l10n.t(
        "Enter a password to encrypt ApiKey (Leave empty to exclude ApiKey from export)",
      ),
      password: true,
      placeHolder: vscode.l10n.t("Password (minimum 8 characters)"),
      validateInput: (value) => {
        if (value && value.length < 8) {
          return vscode.l10n.t("Password must be at least 8 characters");
        }
        return undefined;
      },
    });

    return result;
  }

  /**
   * Prompt user for decryption password during import
   * @returns password string, or undefined if cancelled
   */
  private async promptForDecryptionPassword(): Promise<string | undefined> {
    const result = await vscode.window.showInputBox({
      title: vscode.l10n.t("Import Configuration - Decrypt API Key"),
      prompt: vscode.l10n.t(
        "This configuration contains encrypted API Keys. Enter password to decrypt:",
      ),
      password: true,
      placeHolder: vscode.l10n.t("Password"),
    });

    return result;
  }

  private async encodeProvidersForExport(
    providers: Provider[],
    password: string | undefined,
  ): Promise<string> {
    // Collect API Keys for encryption
    const apiKeys: ProviderApiKeys = {};

    // Clean and filter providers/models for export
    const exportData = await Promise.all(
      providers.map(async (p) => {
        if (password) {
          try {
            const apiKeyValue = await this.manager.getApiKey(p.id);
            if (apiKeyValue) {
              apiKeys[p.id] = apiKeyValue;
            }
          } catch {
            // Ignore errors getting API key
          }
        }

        // Strip unnecessary fields for clean export
        const { apiKey: _apiKey, order: _order, ...providerCore } = p;

        // Filter models: strip runtime stats and empty optional fields
        const cleanedModels = providerCore.models.map((m) => {
          const { speedHistory: _speedHistory, averageSpeed: _averageSpeed, ...modelCore } = m;

          // Remove empty extraBody/extraHeader
          const cleanedModel: Record<string, unknown> = { ...modelCore };
          if (!cleanedModel["extraBody"]) {
            delete cleanedModel["extraBody"];
          }
          if (!cleanedModel["extraHeader"]) {
            delete cleanedModel["extraHeader"];
          }
          if (!cleanedModel["isUserSelectable"]) {
            delete cleanedModel["isUserSelectable"];
          }

          return cleanedModel;
        });

        // Remove empty extraBody/extraHeader from provider
        const cleanedProvider: Record<string, unknown> = {
          ...providerCore,
          models: cleanedModels,
        };
        if (!cleanedProvider["extraBody"]) {
          delete cleanedProvider["extraBody"];
        }
        if (!cleanedProvider["extraHeader"]) {
          delete cleanedProvider["extraHeader"];
        }

        return cleanedProvider;
      }),
    );

    const exportMeta: Record<string, unknown> = {
      version: 1,
      exportedAt: Date.now(),
    };

    // Add encrypted API Keys if password provided
    if (password && Object.keys(apiKeys).length > 0) {
      try {
        exportMeta["encryptionApiKey"] = CryptoService.encryptApiKeys(apiKeys, password);
      } catch (error) {
        logger.error("Failed to encrypt API keys during export", error);
        UserFeedback.showError("Failed to encrypt API keys, exporting without API keys");
      }
    }

    return JSON.stringify({ ...exportMeta, providers: exportData }, null, 2);
  }

  private ensureJsonExtension(uri: vscode.Uri): vscode.Uri {
    if (uri.fsPath.endsWith(".json")) {
      return uri;
    }
    return vscode.Uri.file(uri.fsPath + ".json");
  }
}
