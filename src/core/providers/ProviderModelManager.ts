import * as vscode from "vscode";
import type { Model, Provider, ModelDraft, RemoteModelInfo } from "../../common/types";
import type { IStorageService, IProviderModelManager, BackupEntry } from "../../domain/interfaces";
import { IdGenerator, InputValidator } from "../../common/utils";
import { ConfigManager } from "../../infrastructure/vscode/configService";
import { logger, LogScope } from "../../common/logger";
import { normalizeCapabilities, normalizeProvidersInPlace } from "./dataNormalizer";
import { fetchProviderModelsFromApi as fetchRemoteModels } from "./remoteModelFetcher";

/**
 * Business Logic for managing AI Providers and Models.
 * - Handles CRUD operations for providers/models.
 * - Bridges the gap between raw storage/config and the Application's object model.
 * - Dependent only on interfaces (DIP compliant).
 *
 * Data normalization logic extracted to `dataNormalizer.ts`.
 * Remote model fetching logic extracted to `remoteModelFetcher.ts`.
 *
 * Implements `IProviderModelManager` to satisfy the DIP contract for UseCases.
 */
export class ProviderModelManager implements IProviderModelManager {
  private _onDidUpdate = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this._onDidUpdate.event;
  /** Mutex: ensures read-modify-write sequences are atomic */
  private _saveLock: Promise<void> = Promise.resolve();

  constructor(private storageService: IStorageService) {
    this.storageService.onDidUpdate(() => this._onDidUpdate.fire());

    // Initialize storage with normalization callback
    this.storageService.initialize((providers) => {
      const { mutated } = normalizeProvidersInPlace(
        providers as Array<Provider & Record<string, unknown>>,
      );
      return { mutated };
    });
  }

  /**
   * Promise-based mutex to serialize read-modify-write sequences.
   * Prevents race conditions when multiple async operations try to
   * modify and save provider data concurrently.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this._saveLock;
    let resolveNext!: () => void;
    this._saveLock = new Promise<void>((r) => {
      resolveNext = r;
    });
    try {
      await prev;
      return await fn();
    } finally {
      resolveNext();
    }
  }

  dispose() {
    // No cleanup needed
  }

  setSettingsSync(enabled: boolean): void {
    this.storageService.setSettingsSync(enabled);
  }

  isSettingsSyncEnabled(): boolean {
    return this.storageService.isSettingsSyncEnabled();
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.storageService.getApiKey(providerId);
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    return this.storageService.setApiKey(providerId, apiKey);
  }

  async deleteApiKey(providerId: string): Promise<void> {
    return this.storageService.deleteApiKey(providerId);
  }

  // ─── Backup / Restore ────────────────────────────────────────────────────

  /**
   * Create a local backup of all providers.
   * Backups are stored in globalState (NOT synced via VS Code Settings Sync).
   */
  async createBackup(description?: string): Promise<string> {
    return this.storageService.createBackup(description);
  }

  /**
   * List all available backups (newest first).
   */
  listBackups(): BackupEntry[] {
    return this.storageService.listBackups();
  }

  /**
   * Restore from a backup. Returns the provider list — caller decides when/how to persist.
   */
  restoreBackup(backupId: string): Provider[] {
    return this.storageService.restoreBackup(backupId);
  }

  /**
   * Delete a specific backup.
   */
  deleteBackup(backupId: string): void {
    this.storageService.deleteBackup(backupId);
  }

  /**
   * Delete all local backups.
   */
  clearAllBackups(): void {
    this.storageService.clearAllBackups();
  }

  refresh(): void {
    this._onDidUpdate.fire();
  }

  getProviders(): Provider[] {
    const stored = this.storageService.getProviders();
    const { mutated, critical } = normalizeProvidersInPlace(
      stored as Array<Provider & Record<string, unknown>>,
    );

    if (critical) {
      // Logic for Risk I: We no longer auto-save in-memory normalization by default in a "getter".
      // This prevents read-only operations from triggering sync storms on multiple devices.
      // Normalization remains in memory for the current session.
      logger.info(
        "Applied critical provider data normalization in-memory, will persist on next manual save",
        {
          providerCount: stored.length,
        },
        LogScope.PROVIDER_MGR,
      );
    } else if (mutated) {
      logger.debug(
        "Applied cosmetic provider data normalization (in-memory only)",
        {
          providerCount: stored.length,
        },
        LogScope.PROVIDER_MGR,
      );
    }

    logger.debug("Loaded providers", { providerCount: stored.length }, LogScope.PROVIDER_MGR);
    return stored;
  }

  async saveProviders(providers: Provider[]): Promise<void> {
    normalizeProvidersInPlace(providers as Array<Provider & Record<string, unknown>>);
    await this.storageService.saveProviders(providers);
    logger.info("Saved providers", { providerCount: providers.length }, LogScope.PROVIDER_MGR);
  }

  async addProvider(providerData: Omit<Provider, "id" | "models">): Promise<Provider> {
    return this.withLock(async () => {
      if (InputValidator.getNameError(providerData.name)) {
        throw new Error("Provider name is required");
      }

      const providers = this.getProviders();
      const newProvider: Provider = {
        ...providerData,
        id: IdGenerator.generate(),
        models: [],
      };
      // Ensure providerType exists - default to openai-completions
      if (!newProvider.providerType) {
        newProvider.providerType = "openai-completions";
      }

      // All providers require an API endpoint
      if (!newProvider.apiEndpoint || !newProvider.apiEndpoint.trim()) {
        throw new Error("API Endpoint is required");
      }

      providers.push(newProvider);
      await this.saveProviders(providers);
      logger.info("Provider added", logger.sanitizeProvider(newProvider), LogScope.PROVIDER_MGR);
      return newProvider;
    });
  }

  async updateProvider(
    id: string,
    providerData: Partial<Omit<Provider, "id" | "models">>,
  ): Promise<boolean> {
    return this.withLock(async () => {
      const providers = this.getProviders();
      const index = providers.findIndex((p) => p.id === id);
      if (index >= 0 && providers[index]) {
        const updatedProvider = {
          ...providers[index]!,
          ...providerData,
        };

        if (InputValidator.getNameError(updatedProvider.name)) {
          throw new Error("Provider name cannot be empty");
        }

        if (!updatedProvider.providerType) {
          updatedProvider.providerType = "openai-completions";
        }

        if (!updatedProvider.apiEndpoint || !updatedProvider.apiEndpoint.trim()) {
          throw new Error("API Endpoint is required");
        }

        providers[index] = updatedProvider;
        await this.saveProviders(providers);
        logger.info(
          "Provider updated",
          logger.sanitizeProvider(providers[index]!),
          LogScope.PROVIDER_MGR,
        );
        return true;
      }
      logger.warn(
        "Attempted to update missing provider",
        { providerId: id },
        LogScope.PROVIDER_MGR,
      );
      return false;
    });
  }

  async deleteProvider(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const providers = this.getProviders();
      const filtered = providers.filter((p) => p.id !== id);
      if (filtered.length !== providers.length) {
        // Also delete the API key from SecretStorage when provider is deleted
        await this.storageService.deleteApiKey(id);
        await this.saveProviders(filtered);
        logger.info("Provider deleted", { providerId: id }, LogScope.PROVIDER_MGR);
        return true;
      }
      logger.warn(
        "Attempted to delete missing provider",
        { providerId: id },
        LogScope.PROVIDER_MGR,
      );
      return false;
    });
  }

  async addModel(providerId: string, modelData: ModelDraft): Promise<Model | null> {
    return this.withLock(async () => {
      if (InputValidator.getNameError(modelData.name)) {
        throw new Error("Model name is required");
      }

      const providers = this.getProviders();
      const providerIndex = providers.findIndex((p) => p.id === providerId);
      if (providerIndex >= 0) {
        const id = modelData.id?.trim() || IdGenerator.generate();

        if (!modelData.rid || !modelData.rid.trim()) {
          throw new Error("Model remote ID (rid) is required");
        }
        const rid = modelData.rid.trim();

        const newModel: Model = {
          id,
          rid,
          name: modelData.name,
          family: modelData.family || ConfigManager.getDefaultModelFamily(),
          version: modelData.version || ConfigManager.getDefaultModelVersion(),
          maxInputTokens: modelData.maxInputTokens,
          maxOutputTokens: modelData.maxOutputTokens,
          capabilities: normalizeCapabilities(modelData.capabilities),
          ...(modelData.extraBody ? { extraBody: modelData.extraBody } : {}),
          ...(modelData.extraHeader ? { extraHeader: modelData.extraHeader } : {}),
          ...(modelData.options ? { options: modelData.options } : {}),
          // Default to show in picker when model is added
          isUserSelectable: true,
        };
        providers[providerIndex]!.models.push(newModel);
        await this.saveProviders(providers);
        logger.info(
          "Model added",
          {
            provider: logger.sanitizeProvider(providers[providerIndex]!),
            model: logger.sanitizeModel(newModel),
          },
          LogScope.PROVIDER_MGR,
        );
        return newModel;
      }
      logger.warn(
        "Attempted to add model to missing provider",
        { providerId },
        LogScope.PROVIDER_MGR,
      );
      return null;
    });
  }

  async updateModel(
    providerId: string,
    modelId: string,
    modelData: Partial<ModelDraft>,
  ): Promise<boolean> {
    return this.withLock(async () => {
      const providers = this.getProviders();
      const providerIndex = providers.findIndex((p) => p.id === providerId);
      if (providerIndex >= 0) {
        const modelIndex = providers[providerIndex]!.models.findIndex((m) => m.id === modelId);
        if (modelIndex >= 0) {
          const existingModel = providers[providerIndex]!.models[modelIndex]!;

          if (modelData.name !== undefined && InputValidator.getNameError(modelData.name)) {
            throw new Error("Model name cannot be empty");
          }
          // Only validate rid if it's explicitly provided as a non-empty string
          if (modelData.rid !== undefined && modelData.rid !== "" && !modelData.rid.trim()) {
            throw new Error("Model remote ID (rid) cannot be empty");
          }

          const updatedModel: Model = {
            id: existingModel.id,
            rid:
              modelData.rid !== undefined && modelData.rid !== ""
                ? modelData.rid.trim()
                : existingModel.rid,
            name: modelData.name ?? existingModel.name,
            family: modelData.family ?? existingModel.family,
            version: modelData.version ?? existingModel.version,
            maxInputTokens: modelData.maxInputTokens ?? existingModel.maxInputTokens,
            maxOutputTokens: modelData.maxOutputTokens ?? existingModel.maxOutputTokens,
            capabilities: normalizeCapabilities(modelData.capabilities, existingModel.capabilities),
            ...((modelData.extraBody ?? existingModel.extraBody)
              ? { extraBody: modelData.extraBody ?? existingModel.extraBody }
              : {}),
            ...((modelData.extraHeader ?? existingModel.extraHeader)
              ? {
                  extraHeader: modelData.extraHeader ?? existingModel.extraHeader,
                }
              : {}),
            ...((modelData.options ?? existingModel.options)
              ? { options: modelData.options ?? existingModel.options }
              : {}),
            ...((modelData.speedHistory ?? existingModel.speedHistory)
              ? {
                  speedHistory: modelData.speedHistory ?? existingModel.speedHistory,
                }
              : {}),
            ...((modelData.averageSpeed ?? existingModel.averageSpeed) !== undefined
              ? {
                  averageSpeed: modelData.averageSpeed ?? existingModel.averageSpeed,
                }
              : {}),
          };
          providers[providerIndex]!.models[modelIndex] = updatedModel;
          await this.saveProviders(providers);
          logger.info(
            "Model updated",
            {
              provider: logger.sanitizeProvider(providers[providerIndex]!),
              model: logger.sanitizeModel(updatedModel),
            },
            LogScope.PROVIDER_MGR,
          );
          return true;
        }
      }
      logger.warn(
        "Attempted to update missing model",
        {
          providerId,
          modelId,
        },
        LogScope.PROVIDER_MGR,
      );
      return false;
    });
  }

  async updateModels(
    providerId: string,
    modelIds: string[],
    modelData: Partial<ModelDraft>,
  ): Promise<number> {
    return this.withLock(async () => {
      const providers = this.getProviders();
      const providerIndex = providers.findIndex((p) => p.id === providerId);
      if (providerIndex < 0) {
        logger.warn(
          "Attempted batch update on missing provider",
          {
            providerId,
          },
          LogScope.PROVIDER_MGR,
        );
        return 0;
      }

      let updatedCount = 0;
      const models = providers[providerIndex]!.models;

      for (const id of modelIds) {
        const modelIndex = models.findIndex((m) => m.id === id);
        if (modelIndex < 0) {
          continue;
        }

        const existingModel = models[modelIndex]!;

        if (modelData.name !== undefined && InputValidator.getNameError(modelData.name)) {
          throw new Error("Model name cannot be empty");
        }
        if (modelData.rid !== undefined && (!modelData.rid || !modelData.rid.trim())) {
          throw new Error("Model remote ID (rid) cannot be empty");
        }

        const updatedModel: Model = {
          id: existingModel.id,
          rid:
            modelData.rid !== undefined && modelData.rid !== ""
              ? modelData.rid.trim()
              : existingModel.rid,
          name: modelData.name ?? existingModel.name,
          family: modelData.family ?? existingModel.family,
          version: modelData.version ?? existingModel.version,
          maxInputTokens: modelData.maxInputTokens ?? existingModel.maxInputTokens,
          maxOutputTokens: modelData.maxOutputTokens ?? existingModel.maxOutputTokens,
          capabilities: normalizeCapabilities(modelData.capabilities, existingModel.capabilities),
          ...((modelData.extraBody ?? existingModel.extraBody)
            ? { extraBody: modelData.extraBody ?? existingModel.extraBody }
            : {}),
          ...((modelData.extraHeader ?? existingModel.extraHeader)
            ? {
                extraHeader: modelData.extraHeader ?? existingModel.extraHeader,
              }
            : {}),
          ...((modelData.options ?? existingModel.options)
            ? { options: modelData.options ?? existingModel.options }
            : {}),
          ...((modelData.speedHistory ?? existingModel.speedHistory)
            ? {
                speedHistory: modelData.speedHistory ?? existingModel.speedHistory,
              }
            : {}),
          ...((modelData.averageSpeed ?? existingModel.averageSpeed) !== undefined
            ? {
                averageSpeed: modelData.averageSpeed ?? existingModel.averageSpeed,
              }
            : {}),
        };

        providers[providerIndex]!.models[modelIndex] = updatedModel;
        updatedCount++;
      }

      if (updatedCount > 0) {
        await this.saveProviders(providers);
        logger.info(
          "Models batch updated",
          {
            providerId,
            count: updatedCount,
          },
          LogScope.PROVIDER_MGR,
        );
      }

      return updatedCount;
    });
  }

  /**
   * Update isUserSelectable for a single model
   */
  async updateModelVisibility(
    providerId: string,
    modelId: string,
    isUserSelectable: boolean,
  ): Promise<boolean> {
    return (await this.updateModelVisibilityBatch(providerId, [modelId], isUserSelectable)) > 0;
  }

  /**
   * Batch update isUserSelectable for multiple models in the same provider
   */
  async updateModelVisibilityBatch(
    providerId: string,
    modelIds: string[],
    isUserSelectable: boolean,
  ): Promise<number> {
    return this.withLock(async () => {
      if (!Array.isArray(modelIds) || modelIds.length === 0) {
        return 0;
      }

      const providers = this.getProviders();
      const providerIndex = providers.findIndex((p) => p.id === providerId);
      if (providerIndex < 0) {
        logger.warn(
          "Attempted visibility update on missing provider",
          {
            providerId,
          },
          LogScope.PROVIDER_MGR,
        );
        return 0;
      }

      let updatedCount = 0;
      const models = providers[providerIndex]!.models;

      for (const id of modelIds) {
        const modelIndex = models.findIndex((m) => m.id === id);
        if (modelIndex < 0) {
          continue;
        }

        models[modelIndex] = {
          ...models[modelIndex]!,
          isUserSelectable,
        };
        updatedCount++;
      }

      if (updatedCount > 0) {
        await this.saveProviders(providers);
        logger.info(
          "Models visibility updated",
          {
            providerId,
            count: updatedCount,
            isUserSelectable,
          },
          LogScope.PROVIDER_MGR,
        );
      }

      return updatedCount;
    });
  }

  /**
   * Batch update isUserSelectable for ALL models in a provider (for provider-level toggle)
   */
  async updateProviderAllModelsVisibility(
    providerId: string,
    isUserSelectable: boolean,
  ): Promise<number> {
    return this.withLock(async () => {
      const providers = this.getProviders();
      const providerIndex = providers.findIndex((p) => p.id === providerId);
      if (providerIndex < 0) {
        logger.warn(
          "Attempted visibility update on missing provider",
          {
            providerId,
          },
          LogScope.PROVIDER_MGR,
        );
        return 0;
      }

      let updatedCount = 0;
      const models = providers[providerIndex]!.models;

      for (let i = 0; i < models.length; i++) {
        if (models[i]!.isUserSelectable !== isUserSelectable) {
          models[i] = {
            ...models[i]!,
            isUserSelectable,
          };
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await this.saveProviders(providers);
        logger.info(
          "Provider all models visibility updated",
          {
            providerId,
            count: updatedCount,
            isUserSelectable,
          },
          LogScope.PROVIDER_MGR,
        );
      }

      return updatedCount;
    });
  }

  async updateModelSpeed(providerId: string, modelId: string, speed: number): Promise<void> {
    await this.withLock(async () => {
      logger.debug(
        "updateModelSpeed called",
        { providerId, modelId, speed },
        LogScope.PROVIDER_MGR,
      );
      const providers = this.getProviders();
      const providerIndex = providers.findIndex((p) => p.id === providerId);
      if (providerIndex >= 0) {
        const modelIndex = providers[providerIndex]!.models.findIndex((m) => m.id === modelId);
        if (modelIndex >= 0) {
          const model = providers[providerIndex]!.models[modelIndex]!;
          const history = model.speedHistory ? [...model.speedHistory] : [];
          history.push(speed);
          if (history.length > 5) {
            history.shift();
          }
          const average = history.reduce((a, b) => a + b, 0) / history.length;

          providers[providerIndex]!.models[modelIndex] = {
            ...model,
            speedHistory: history,
            averageSpeed: average,
          };
          await this.saveProviders(providers);
          logger.debug("Model speed updated", { modelId, speed, average }, LogScope.PROVIDER_MGR);
        } else {
          logger.warn("Model not found for speed update", { modelId }, LogScope.PROVIDER_MGR);
        }
      } else {
        logger.warn("Provider not found for speed update", { providerId }, LogScope.PROVIDER_MGR);
      }
    });
  }

  async deleteModel(modelId: string): Promise<boolean> {
    return this.withLock(async () => {
      const providers = this.getProviders();
      let deleted = false;

      for (const provider of providers) {
        const initialLength = provider.models.length;
        provider.models = provider.models.filter((m) => m.id !== modelId);
        if (provider.models.length !== initialLength) {
          deleted = true;
          break;
        }
      }

      if (deleted) {
        await this.saveProviders(providers);
        logger.info("Model deleted", { modelId }, LogScope.PROVIDER_MGR);
      }

      return deleted;
    });
  }

  async deleteModels(modelIds: string[]): Promise<number> {
    return this.withLock(async () => {
      if (!Array.isArray(modelIds) || modelIds.length === 0) {
        return 0;
      }
      const providers = this.getProviders();
      const idSet = new Set(modelIds);
      let deletedCount = 0;

      for (const provider of providers) {
        provider.models = provider.models.filter((m) => {
          if (idSet.has(m.id)) {
            deletedCount++;
            return false;
          }
          return true;
        });
        // continue to next provider to remove models across providers
      }

      if (deletedCount > 0) {
        await this.saveProviders(providers);
        logger.info("Models batch deleted", { count: deletedCount }, LogScope.PROVIDER_MGR);
      }

      return deletedCount;
    });
  }

  findModel(modelId: string): { provider: Provider; model: Model } | null {
    const providers = this.getProviders();
    for (const provider of providers) {
      // First try to find by local id (UUID)
      let model = provider.models.find((m) => m.id === modelId);
      if (model) {
        logger.debug(
          "Model lookup hit by id",
          {
            provider: logger.sanitizeProvider(provider),
            model: logger.sanitizeModel(model),
          },
          LogScope.PROVIDER_MGR,
        );
        return { provider, model };
      }
      // If not found by id, try by rid (remote id)
      model = provider.models.find((m) => m.rid === modelId);
      if (model) {
        logger.debug(
          "Model lookup hit by rid",
          {
            provider: logger.sanitizeProvider(provider),
            model: logger.sanitizeModel(model),
          },
          LogScope.PROVIDER_MGR,
        );
        return { provider, model };
      }
    }
    logger.warn("Model lookup miss", { modelId }, LogScope.PROVIDER_MGR);
    return null;
  }

  // --- Network / Sync Logic ---

  /**
   * Fetch available models from a remote AI provider API.
   * Delegates to the extracted remoteModelFetcher module.
   */
  public async fetchProviderModelsFromApi(provider: Provider): Promise<RemoteModelInfo[]> {
    return fetchRemoteModels(provider, {
      getApiKey: (id) => this.getApiKey(id),
    });
  }
}
