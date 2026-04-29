import * as vscode from "vscode";
import { BaseCommandHandler } from "./base";
import type { ProviderTreeItem } from "../views/providerView";
import { UserFeedback } from "../utils/feedback";
import { ConfigManager } from "../../infrastructure/vscode/configService";
import { maskSecret, logger } from "../../common/logger";
import type { Provider, Model } from "../../common/types";

/**
 * Provider-related command handler
 */
export class ProviderCommandHandler extends BaseCommandHandler {
  /**
   * Add a new provider
   */
  async addProvider(): Promise<void> {
    if (this.editorViewManager) {
      this.editorViewManager.openEditor(undefined, "create");
    } else {
      UserFeedback.showError("Editor view manager not initialized");
    }
  }

  /**
   * Edit an existing provider
   */
  async editProvider(item: ProviderTreeItem): Promise<void> {
    if (this.editorViewManager) {
      this.editorViewManager.openEditor(item, "edit");
    } else {
      UserFeedback.showError("Editor view manager not initialized");
    }
  }

  /**
   * Delete a provider and all its models
   */
  async deleteProvider(item: ProviderTreeItem): Promise<void> {
    if (ConfigManager.getConfirmDelete()) {
      const deleteOption: vscode.MessageItem = { title: "Delete" };
      const deleteDontAskOption: vscode.MessageItem = {
        title: "Delete and don't ask again",
      };
      const cancelOption: vscode.MessageItem = {
        title: "Cancel",
        isCloseAffordance: true,
      };

      const selection = await vscode.window.showWarningMessage(
        `Are you sure you want to delete provider "${item.provider.name}"? This will also delete all of its models.`,
        { modal: false },
        deleteOption,
        deleteDontAskOption,
        cancelOption,
      );

      if (selection === deleteDontAskOption) {
        await vscode.workspace
          .getConfiguration("addi")
          .update("confirmDelete", false, vscode.ConfigurationTarget.Global);
        void vscode.window.showInformationMessage(
          "Delete confirmation disabled. You can re-enable it in settings.",
        );
      }

      if (!selection || selection === cancelOption) {
        logger.debug(
          "deleteProvider canceled",
          logger.sanitizeProvider(item.provider),
        );
        return;
      }
    }

    try {
      await this.manager.deleteProvider(item.provider.id);
      this.refreshTreeView();
      UserFeedback.showInfo(`Provider "${item.provider.name}" deleted`);
      logger.info("Provider deleted", logger.sanitizeProvider(item.provider));
    } catch (error) {
      UserFeedback.showError(
        `Failed to delete provider: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.logError("deleteProvider failed", error);
    }
  }

  /**
   * Set API key for a provider
   */
  async setApiKey(item: ProviderTreeItem): Promise<void> {
    const currentApiKey =
      (await this.manager.getApiKey(item.provider.id)) || "";

    const newApiKey = await UserFeedback.showInputBox({
      prompt: `Set Api Key for "${item.provider.name}"`,
      value: "",
      password: true,
      placeHolder: currentApiKey
        ? `Current: ${maskSecret(currentApiKey)}`
        : "Please enter the new API key",
    });

    if (newApiKey === undefined || newApiKey === "") {
      logger.debug(
        "setApiKey canceled or empty",
        logger.sanitizeProvider(item.provider),
      );
      return;
    }

    try {
      await this.manager.setApiKey(item.provider.id, newApiKey);
      logger.info(
        "Provider API key updated",
        logger.sanitizeProvider(item.provider),
      );
      this.refreshTreeView();
      UserFeedback.showInfo(`Provider "${item.provider.name}" API key updated`);
    } catch (error) {
      UserFeedback.showError(
        `Failed to update API key: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.logError("setApiKey failed", error);
    }
  }

  /**
   * Pull models from a provider
   */
  async pullProviderModels(item: ProviderTreeItem): Promise<void> {
    logger.info(
      "Command pullProviderModels invoked",
      logger.sanitizeProvider(item.provider),
    );
    await this.syncProviderModels(item.provider.id);
  }

  /**
   * Copy a provider - opens editor for creating a copy
   */
  async copyProvider(item: ProviderTreeItem): Promise<void> {
    logger.info(
      "Command copyProvider invoked",
      logger.sanitizeProvider(item.provider),
    );

    if (this.editorViewManager) {
      // Copy provider data without id/models to ensure it's treated as new
      const { id: _id, models: _models, ...providerWithoutIdModels } = item.provider;
      const prefillData: Record<string, unknown> = {
        ...providerWithoutIdModels,
        name: `${item.provider.name} Copy`,
      };

      this.editorViewManager.openEditor(
        undefined,
        "create",
        undefined,
        prefillData,
      );
    } else {
      UserFeedback.showError("Editor view manager not initialized");
    }
  }

  /**
   * Sync models from a provider
   */
  private async syncProviderModels(providerId: string): Promise<void> {
    type ModelSyncResult = {
      added: number;
      updated: number;
      totalRemote: number;
      mutated: boolean;
    };

    const providers = this.manager.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);
    if (providerIndex < 0) {
      UserFeedback.showError("Provider not found");
      return;
    }

    const provider = providers[providerIndex]!;
    const endpoint = provider.apiEndpoint?.trim();
    if (!endpoint) {
      const message = `Provider "${provider.name}" is missing an API endpoint. Configure it and try pulling models again.`;
      UserFeedback.showWarning(message);
      logger.warn(
        "syncProviderModels missing endpoint",
        logger.sanitizeProvider(provider),
      );
      return;
    }

    // Retrieve API key from SecretStorage
    const apiKey = await this.manager.getApiKey(provider.id);

    if (!apiKey) {
      const message = `Provider "${provider.name}" is missing an API key. Set the key and rerun "Pull Models List".`;
      UserFeedback.showWarning(message);
      logger.warn(
        "syncProviderModels missing api key",
        logger.sanitizeProvider(provider),
      );
      return;
    }

    const fetchableProvider: Provider = {
      ...provider,
      apiEndpoint: endpoint,
      apiKey,
    };

    logger.debug("syncProviderModels start", {
      provider: logger.sanitizeProvider(fetchableProvider),
    });

    try {
      const result = await UserFeedback.showProgress<ModelSyncResult>(
        "Fetching models list...",
        async (_progress, _token) => {
          const remoteModels =
            await this.manager.fetchProviderModelsFromApi(fetchableProvider);
          // Use model.id (remote model's id = rid) as the key for matching
          const existingByRid = new Map(
            provider.models.map((model) => [model.rid, model]),
          );
          let added = 0;
          let updated = 0;
          let skipped = 0;

          if (remoteModels.length === 0) {
            logger.warn("fetchProviderModelsFromApi returned no models", {
              provider: logger.sanitizeProvider(fetchableProvider),
            });
            return {
              added,
              updated,
              totalRemote: 0,
              mutated: false,
            } satisfies ModelSyncResult;
          }

          const defaultFamily = ConfigManager.getDefaultModelFamily().trim();
          const defaultVersion = ConfigManager.getDefaultModelVersion().trim();
          const defaultMaxInputTokens =
            ConfigManager.getDefaultMaxInputTokens();
          const defaultMaxOutputTokens =
            ConfigManager.getDefaultMaxOutputTokens();

          // Normalize remote token values that may be reported using 1024-based units
          const normalizeRemoteToken = (
            v: number | undefined,
          ): number | undefined => {
            if (v === undefined || v === null) {
              return undefined;
            }
            // If value is an exact multiple of 1024, assume provider used 1024-based units
            // and convert to 1000-based friendly value (e.g. 60*1024 -> 60*1000 = 60000)
            if (v % 1024 === 0 && v > 0) {
              return Math.round((v / 1024) * 1000);
            }
            return v;
          };

          // Process remote models and merge with existing
          for (const remote of remoteModels) {
            if (!remote.id) {
              continue;
            }

            // Use remote.id (which is the remote model's rid) to find existing model
            const remoteRid = remote.id.trim();
            const existing = existingByRid.get(remoteRid);
            if (existing) {
              let changed = false;

              // Update name if remote has a better name and local name equals the rid
              if (
                remote.name &&
                remote.name !== existing.name &&
                existing.name === existing.rid
              ) {
                existing.name = remote.name;
                changed = true;
              }

              const remoteFamily = remote.family?.trim();
              if (remoteFamily && remoteFamily !== existing.family) {
                existing.family = remoteFamily;
                changed = true;
              }

              const normalizedRemoteInput = normalizeRemoteToken(
                remote.maxInputTokens,
              );
              if (
                normalizedRemoteInput !== undefined &&
                normalizedRemoteInput !== existing.maxInputTokens
              ) {
                existing.maxInputTokens = normalizedRemoteInput;
                changed = true;
              }

              const normalizedRemoteOutput = normalizeRemoteToken(
                remote.maxOutputTokens,
              );
              if (
                normalizedRemoteOutput !== undefined &&
                normalizedRemoteOutput !== existing.maxOutputTokens
              ) {
                existing.maxOutputTokens = normalizedRemoteOutput;
                changed = true;
              }

              if (remote.capabilities) {
                existing.capabilities = { ...remote.capabilities };
                changed = true;
              }

              if (changed) {
                updated++;
              } else {
                skipped++;
              }

              continue;
            }

            // Check for rid conflict: if there's a model with same rid but different local id
            const conflictingModel = provider.models.find(
              (m) => m.rid === remoteRid,
            );
            if (conflictingModel) {
              logger.warn("Found model with conflicting rid during pull", {
                provider: logger.sanitizeProvider(fetchableProvider),
                remoteRid,
                existingModelId: conflictingModel.id,
              });
              // Update the existing model's other properties instead of adding duplicate
              conflictingModel.name = remote.name?.trim() || remote.id;
              if (remote.family?.trim()) {
                conflictingModel.family = remote.family.trim();
              }
              if (remote.maxInputTokens) {
                conflictingModel.maxInputTokens =
                  normalizeRemoteToken(remote.maxInputTokens) ??
                  defaultMaxInputTokens;
              }
              if (remote.maxOutputTokens) {
                conflictingModel.maxOutputTokens =
                  normalizeRemoteToken(remote.maxOutputTokens) ??
                  defaultMaxOutputTokens;
              }
              if (remote.capabilities) {
                conflictingModel.capabilities = { ...remote.capabilities };
              }
              updated++;
              continue;
            }

            const remoteFamily = remote.family?.trim();
            // Capability sync: Default to false for safety
            const remoteCapabilities = remote.capabilities
              ? { ...remote.capabilities }
              : {};
            if (remoteCapabilities.toolCalling === undefined) {
              remoteCapabilities.toolCalling = false;
            }

            // Generate a UUID for the new model
            const { IdGenerator } = await import("../../common/utils/index.js");
            const model: Model = {
              id: IdGenerator.generate(),
              rid: remoteRid,
              name: remote.name?.trim() || remote.id,
              family: remoteFamily || defaultFamily,
              version: defaultVersion,
              maxInputTokens:
                normalizeRemoteToken(remote.maxInputTokens) ??
                defaultMaxInputTokens,
              maxOutputTokens:
                normalizeRemoteToken(remote.maxOutputTokens) ??
                defaultMaxOutputTokens,
              capabilities: remoteCapabilities,
              // Default to show in picker when model is pulled
              isUserSelectable: true,
            };

            provider.models.push(model);
            existingByRid.set(remoteRid, model);
            added++;
          }

          const mutated = added > 0 || updated > 0;
          if (mutated) {
            await this.manager.saveProviders(providers);
          }

          return {
            added,
            updated,
            totalRemote: remoteModels.length,
            mutated,
          } satisfies ModelSyncResult;
        },
      );

      if (!result) {
        return;
      }

      if (!result.mutated) {
        logger.info("syncProviderModels: no changes", {
          provider: logger.sanitizeProvider(fetchableProvider),
        });
        return;
      }

      const fragments: string[] = [];
      if (result.added > 0) {
        fragments.push(`${result.added} added`);
      }
      if (result.updated > 0) {
        fragments.push(`${result.updated} updated`);
      }
      const summary =
        fragments.length > 0 ? fragments.join(", ") : "up to date";
      UserFeedback.showInfo(
        `Synced models for "${provider.name}" (${summary})`,
      );
      logger.info("syncProviderModels success", {
        provider: logger.sanitizeProvider(fetchableProvider),
        added: result.added,
        updated: result.updated,
        skipped: result.totalRemote - result.added - result.updated,
        totalRemote: result.totalRemote,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      UserFeedback.showError(
        `Failed to sync models for "${provider.name}": ${message}`,
      );
      logger.error("syncProviderModels error", {
        provider: logger.sanitizeProvider(fetchableProvider),
        error: message,
      });
    }
  }
}
