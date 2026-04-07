import * as vscode from 'vscode';
import { Model, Provider, ProviderType, ModelDraft, RemoteModelInfo } from '../../common/types';
import { IStorageService, BackupEntry } from '../../domain/interfaces';
import { ConfigManager, IdGenerator, InputValidator } from '../../common/utils';
import { logger } from '../../common/logger';

/**
 * Business Logic for managing AI Providers and Models.
 * - Handles CRUD operations for providers/models.
 * - Normalizes legacy data structures.
 * - Bridges the Gap between raw storage/config and the Application's object model.
 * - Dependent only on interfaces (DIP compliant).
 */
export class ProviderModelManager {
  private static readonly TOKEN_LIMIT = 1024 * 1024 * 4;
  private _onDidUpdate = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this._onDidUpdate.event;

  constructor(private storageService: IStorageService) {
    this.storageService.onDidUpdate(() => this._onDidUpdate.fire());

    // Initialize storage with normalization callback
    this.storageService.initialize((providers) => {
      const { mutated } = this.normalizeProvidersInPlace(
        providers as Array<Provider & Record<string, unknown>>
      );
      return { mutated };
    });
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
    const { mutated, critical } = this.normalizeProvidersInPlace(
      stored as Array<Provider & Record<string, unknown>>
    );

    if (critical) {
      // Logic for Risk I: We no longer auto-save in-memory normalization by default in a "getter".
      // This prevents read-only operations from triggering sync storms on multiple devices.
      // Normalization remains in memory for the current session.
      logger.info(
        'Applied critical provider data normalization in-memory, will persist on next manual save',
        {
          providerCount: stored.length,
        }
      );
    } else if (mutated) {
      logger.debug('Applied cosmetic provider data normalization (in-memory only)', {
        providerCount: stored.length,
      });
    }

    logger.debug('Loaded providers', { providerCount: stored.length });
    return stored;
  }

  async saveProviders(providers: Provider[]): Promise<void> {
    this.normalizeProvidersInPlace(providers as Array<Provider & Record<string, unknown>>);
    await this.storageService.saveProviders(providers);
    logger.info('Saved providers', { providerCount: providers.length });
  }

  private normalizeProvidersInPlace(providers: Array<Provider & Record<string, unknown>>): {
    mutated: boolean;
    critical: boolean;
  } {
    let mutated = false;
    let critical = false;

    for (const provider of providers) {
      // Migrate provider ID to UUID if it's a legacy format (e.g., timestamp-based or numeric string)
      const providerIdCandidate = typeof provider.id === 'string' ? provider.id.trim() : '';
      const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        providerIdCandidate
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
          providerRecord['apiKey'] = oldApiKey;
        } else {
          // Explicitly delete to match the original behavior
          delete providerRecord['apiKey'];
        }

        logger.info('Migrating provider ID to UUID', {
          oldId: providerIdCandidate || '(none)',
          newId,
          hasApiKey: !!oldApiKey,
        });

        provider.id = newId;
        mutated = true;
        critical = true;
      }

      // Normalize legacy provider types to new API-based types
      // CAN BE REMOVE AFTER VERSION 1.0 - This is to ensure older persisted data remains compatible with the new provider type system.
      if (provider.providerType) {
        const legacyMapping: Record<string, ProviderType> = {
          openai: 'openai-completions',
          deepseek: 'openai-completions',
          'zhipu-ai': 'openai-completions',
          minimax: 'openai-completions',
          generic: 'openai-completions',
          anthropic: 'anthropic-messages',
          google: 'google-generateContent',
        };
        const newType = legacyMapping[provider.providerType];
        if (newType && newType !== provider.providerType) {
          provider.providerType = newType;
          mutated = true;
        }
      } else {
        // Infer type from endpoint if not set
        const endpoint = (provider.apiEndpoint || '').toLowerCase();
        if (
          endpoint.includes('openai.com') ||
          endpoint.includes('anthropic.com') ||
          endpoint.includes('googleapis.com')
        ) {
          // Default to the appropriate API type based on endpoint
          if (endpoint.includes('anthropic.com')) {
            provider.providerType = 'anthropic-messages';
          } else if (endpoint.includes('googleapis.com')) {
            provider.providerType = 'google-generateContent';
          } else {
            provider.providerType = 'openai-completions';
          }
        } else {
          // Default for custom endpoints
          provider.providerType = 'openai-completions';
        }
        mutated = true;
        // Provider type inference is useful to persist but not strictly critical for ID stability.
        // However, if we don't save it, we re-infer every time.
        // Let's consider it cosmetic-ish unless we want to lock it.
      }

      if (!Array.isArray(provider.models)) {
        logger.warn('Provider models array invalid, resetting', logger.sanitizeProvider(provider));
        provider.models = [];
        mutated = true;
        critical = true; // Data loss/reset is critical
        continue;
      }

      // Filter out invalid entries that may be present in persisted state
      const initialLength = provider.models.length;
      provider.models = provider.models.filter((m) => m && typeof m === 'object');
      if (provider.models.length !== initialLength) {
        mutated = true;
        critical = true; // Deletion is critical
      }

      provider.models = provider.models.map((model) => {
        const mutableModel = model as unknown as Record<string, unknown>;
        let changed = false;
        let modelCritical = false;

        // Ensure token defaults exist for older or malformed saved models
        if (typeof mutableModel['maxInputTokens'] !== 'number') {
          mutableModel['maxInputTokens'] = ConfigManager.getDefaultMaxInputTokens();
          changed = true;
        }
        if (typeof mutableModel['maxOutputTokens'] !== 'number') {
          mutableModel['maxOutputTokens'] = ConfigManager.getDefaultMaxOutputTokens();
          changed = true;
        }
        if (!mutableModel['capabilities'] || typeof mutableModel['capabilities'] !== 'object') {
          mutableModel['capabilities'] = {} as Record<string, unknown>;
          changed = true;
        }

        const capabilitiesRecord = mutableModel['capabilities'] as Record<string, unknown>;

        if (
          capabilitiesRecord['imageInput'] === undefined &&
          typeof mutableModel['imageInput'] === 'boolean'
        ) {
          (capabilitiesRecord as Record<string, unknown>)['imageInput'] =
            mutableModel['imageInput'];
          changed = true;
        }

        if (
          capabilitiesRecord['toolCalling'] === undefined &&
          mutableModel['toolCalling'] !== undefined
        ) {
          const legacyToolCalling = mutableModel['toolCalling'];
          (capabilitiesRecord as Record<string, unknown>)['toolCalling'] =
            typeof legacyToolCalling === 'number' ? legacyToolCalling : Boolean(legacyToolCalling);
          changed = true;
        }

        if ('imageInput' in mutableModel) {
          delete mutableModel['imageInput'];
          changed = true;
        }

        if ('toolCalling' in mutableModel) {
          delete mutableModel['toolCalling'];
          changed = true;
        }

        if (mutableModel['tooltip'] !== undefined && typeof mutableModel['tooltip'] !== 'string') {
          delete mutableModel['tooltip'];
          changed = true;
        }

        if (mutableModel['detail'] !== undefined && typeof mutableModel['detail'] !== 'string') {
          delete mutableModel['detail'];
          changed = true;
        }

        // Ensure speed fields are preserved/initialized
        if (
          mutableModel['speedHistory'] !== undefined &&
          !Array.isArray(mutableModel['speedHistory'])
        ) {
          mutableModel['speedHistory'] = [];
          changed = true;
        }
        if (
          mutableModel['averageSpeed'] !== undefined &&
          typeof mutableModel['averageSpeed'] !== 'number'
        ) {
          delete mutableModel['averageSpeed'];
          changed = true;
        }

        const normalizedCapabilities = this.normalizeCapabilities(
          capabilitiesRecord as Model['capabilities']
        );
        if (
          normalizedCapabilities.imageInput !== capabilitiesRecord['imageInput'] ||
          normalizedCapabilities.toolCalling !== capabilitiesRecord['toolCalling']
        ) {
          changed = true;
        }
        mutableModel['capabilities'] = normalizedCapabilities;

        // id: 本地生成的唯一标识
        const idCandidate = typeof mutableModel['id'] === 'string' ? mutableModel['id'].trim() : '';
        if (!idCandidate) {
          mutableModel['id'] = IdGenerator.generate();
          changed = true;
          modelCritical = true; // Generating ID is critical
        }

        // rid: remoteId - 远程模型的ID
        const ridRaw = typeof mutableModel['rid'] === 'string' ? mutableModel['rid'].trim() : '';

        if (!ridRaw) {
          // 如果没有 rid，则使用 id 作为 rid
          mutableModel['rid'] = mutableModel['id'] as string;
          changed = true;
          modelCritical = true;
        } else if (ridRaw !== mutableModel['rid']) {
          mutableModel['rid'] = ridRaw;
          changed = true;
        }

        // family: 模型系列/家族名称 (必须存在，非用户可编辑字段)
        const familyRaw =
          typeof mutableModel['family'] === 'string' ? mutableModel['family'].trim() : '';
        if (!familyRaw) {
          // 如果没有 family，则使用配置项默认值
          mutableModel['family'] = ConfigManager.getDefaultModelFamily().trim();
          changed = true;
          modelCritical = true;
        } else if (familyRaw !== mutableModel['family']) {
          mutableModel['family'] = familyRaw;
          changed = true;
        }

        // version: 模型版本标识 (必须存在，非用户可编辑字段)
        const versionRaw =
          typeof mutableModel['version'] === 'string' ? mutableModel['version'].trim() : '';
        if (!versionRaw) {
          // 如果没有 version，则使用配置项默认值
          mutableModel['version'] = ConfigManager.getDefaultModelVersion().trim();
          changed = true;
          modelCritical = true;
        } else if (versionRaw !== mutableModel['version']) {
          mutableModel['version'] = versionRaw;
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

  private normalizeCapabilities(
    source?: Model['capabilities'],
    fallback?: Model['capabilities']
  ): Model['capabilities'] {
    const normalized: Model['capabilities'] = {};
    const base = fallback ?? {};
    const candidate = source ?? {};

    if (candidate.imageInput !== undefined || base.imageInput !== undefined) {
      normalized.imageInput = Boolean(candidate.imageInput ?? base.imageInput);
    }

    const toolSource = candidate.toolCalling ?? base.toolCalling;
    if (toolSource !== undefined) {
      normalized.toolCalling = typeof toolSource === 'number' ? toolSource : Boolean(toolSource);
    }

    return normalized;
  }

  async addProvider(providerData: Omit<Provider, 'id' | 'models'>): Promise<Provider> {
    if (InputValidator.validateName(providerData.name)) {
      throw new Error('Provider name is required');
    }

    const providers = this.getProviders();
    const newProvider: Provider = {
      ...providerData,
      id: IdGenerator.generate(),
      models: [],
    };
    // Ensure providerType exists - default to openai-completions
    if (!newProvider.providerType) {
      newProvider.providerType = 'openai-completions';
    }

    // All providers require an API endpoint
    if (!newProvider.apiEndpoint || !newProvider.apiEndpoint.trim()) {
      throw new Error('API Endpoint is required');
    }

    providers.push(newProvider);
    await this.saveProviders(providers);
    logger.info('Provider added', logger.sanitizeProvider(newProvider));
    return newProvider;
  }

  async updateProvider(
    id: string,
    providerData: Partial<Omit<Provider, 'id' | 'models'>>
  ): Promise<boolean> {
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === id);
    if (index >= 0 && providers[index]) {
      const updatedProvider = {
        ...providers[index]!,
        ...providerData,
      };

      if (InputValidator.validateName(updatedProvider.name)) {
        throw new Error('Provider name cannot be empty');
      }

      if (!updatedProvider.providerType) {
        updatedProvider.providerType = 'openai-completions';
      }

      if (!updatedProvider.apiEndpoint || !updatedProvider.apiEndpoint.trim()) {
        throw new Error('API Endpoint is required');
      }

      providers[index] = updatedProvider;
      await this.saveProviders(providers);
      logger.info('Provider updated', logger.sanitizeProvider(providers[index]!));
      return true;
    }
    logger.warn('Attempted to update missing provider', { providerId: id });
    return false;
  }

  async deleteProvider(id: string): Promise<boolean> {
    const providers = this.getProviders();
    const filtered = providers.filter((p) => p.id !== id);
    if (filtered.length !== providers.length) {
      // Also delete the API key from SecretStorage when provider is deleted
      await this.storageService.deleteApiKey(id);
      await this.saveProviders(filtered);
      logger.info('Provider deleted', { providerId: id });
      return true;
    }
    logger.warn('Attempted to delete missing provider', { providerId: id });
    return false;
  }

  async addModel(providerId: string, modelData: ModelDraft): Promise<Model | null> {
    if (InputValidator.validateName(modelData.name)) {
      throw new Error('Model name is required');
    }

    const providers = this.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);
    if (providerIndex >= 0) {
      const id = modelData.id?.trim() || IdGenerator.generate();

      if (!modelData.rid || !modelData.rid.trim()) {
        throw new Error('Model remote ID (rid) is required');
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
        capabilities: this.normalizeCapabilities(modelData.capabilities),
        ...(modelData.extraBody ? { extraBody: modelData.extraBody } : {}),
        ...(modelData.extraHeader ? { extraHeader: modelData.extraHeader } : {}),
        ...(modelData.options ? { options: modelData.options } : {}),
        // Default to show in picker when model is added
        isUserSelectable: true,
      };
      providers[providerIndex]!.models.push(newModel);
      await this.saveProviders(providers);
      logger.info('Model added', {
        provider: logger.sanitizeProvider(providers[providerIndex]!),
        model: logger.sanitizeModel(newModel),
      });
      return newModel;
    }
    logger.warn('Attempted to add model to missing provider', { providerId });
    return null;
  }

  async updateModel(
    providerId: string,
    modelId: string,
    modelData: Partial<ModelDraft>
  ): Promise<boolean> {
    const providers = this.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);
    if (providerIndex >= 0) {
      const modelIndex = providers[providerIndex]!.models.findIndex((m) => m.id === modelId);
      if (modelIndex >= 0) {
        const existingModel = providers[providerIndex]!.models[modelIndex]!;

        if (modelData.name !== undefined && InputValidator.validateName(modelData.name)) {
          throw new Error('Model name cannot be empty');
        }
        // Only validate rid if it's explicitly provided as a non-empty string
        if (modelData.rid !== undefined && modelData.rid !== '' && !modelData.rid.trim()) {
          throw new Error('Model remote ID (rid) cannot be empty');
        }

        const updatedModel: Model = {
          id: existingModel.id,
          rid:
            modelData.rid !== undefined && modelData.rid !== ''
              ? modelData.rid.trim()
              : existingModel.rid,
          name: modelData.name ?? existingModel.name,
          family: modelData.family ?? existingModel.family,
          version: modelData.version ?? existingModel.version,
          maxInputTokens: modelData.maxInputTokens ?? existingModel.maxInputTokens,
          maxOutputTokens: modelData.maxOutputTokens ?? existingModel.maxOutputTokens,
          capabilities: this.normalizeCapabilities(
            modelData.capabilities,
            existingModel.capabilities
          ),
          ...((modelData.extraBody ?? existingModel.extraBody)
            ? { extraBody: modelData.extraBody ?? existingModel.extraBody }
            : {}),
          ...((modelData.extraHeader ?? existingModel.extraHeader)
            ? { extraHeader: modelData.extraHeader ?? existingModel.extraHeader }
            : {}),
          ...((modelData.options ?? existingModel.options)
            ? { options: modelData.options ?? existingModel.options }
            : {}),
          ...((modelData.speedHistory ?? existingModel.speedHistory)
            ? { speedHistory: modelData.speedHistory ?? existingModel.speedHistory }
            : {}),
          ...((modelData.averageSpeed ?? existingModel.averageSpeed) !== undefined
            ? { averageSpeed: modelData.averageSpeed ?? existingModel.averageSpeed }
            : {}),
        };
        providers[providerIndex]!.models[modelIndex] = updatedModel;
        await this.saveProviders(providers);
        logger.info('Model updated', {
          provider: logger.sanitizeProvider(providers[providerIndex]!),
          model: logger.sanitizeModel(updatedModel),
        });
        return true;
      }
    }
    logger.warn('Attempted to update missing model', { providerId, modelId });
    return false;
  }

  async updateModels(
    providerId: string,
    modelIds: string[],
    modelData: Partial<ModelDraft>
  ): Promise<number> {
    const providers = this.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);
    if (providerIndex < 0) {
      logger.warn('Attempted batch update on missing provider', { providerId });
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

      if (modelData.name !== undefined && InputValidator.validateName(modelData.name)) {
        throw new Error('Model name cannot be empty');
      }
      if (modelData.rid !== undefined && (!modelData.rid || !modelData.rid.trim())) {
        throw new Error('Model remote ID (rid) cannot be empty');
      }

      const updatedModel: Model = {
        id: existingModel.id,
        rid: (modelData.rid ?? existingModel.rid)?.trim() || existingModel.rid,
        name: modelData.name ?? existingModel.name,
        family: modelData.family ?? existingModel.family,
        version: modelData.version ?? existingModel.version,
        maxInputTokens: modelData.maxInputTokens ?? existingModel.maxInputTokens,
        maxOutputTokens: modelData.maxOutputTokens ?? existingModel.maxOutputTokens,
        capabilities: this.normalizeCapabilities(
          modelData.capabilities,
          existingModel.capabilities
        ),
        ...((modelData.extraBody ?? existingModel.extraBody)
          ? { extraBody: modelData.extraBody ?? existingModel.extraBody }
          : {}),
        ...((modelData.extraHeader ?? existingModel.extraHeader)
          ? { extraHeader: modelData.extraHeader ?? existingModel.extraHeader }
          : {}),
        ...((modelData.options ?? existingModel.options)
          ? { options: modelData.options ?? existingModel.options }
          : {}),
        ...((modelData.speedHistory ?? existingModel.speedHistory)
          ? { speedHistory: modelData.speedHistory ?? existingModel.speedHistory }
          : {}),
        ...((modelData.averageSpeed ?? existingModel.averageSpeed) !== undefined
          ? { averageSpeed: modelData.averageSpeed ?? existingModel.averageSpeed }
          : {}),
      };

      providers[providerIndex]!.models[modelIndex] = updatedModel;
      updatedCount++;
    }

    if (updatedCount > 0) {
      await this.saveProviders(providers);
      logger.info('Models batch updated', { providerId, count: updatedCount });
    }

    return updatedCount;
  }

  /**
   * Update isUserSelectable for a single model
   */
  async updateModelVisibility(
    providerId: string,
    modelId: string,
    isUserSelectable: boolean
  ): Promise<boolean> {
    return (await this.updateModelVisibilityBatch(providerId, [modelId], isUserSelectable)) > 0;
  }

  /**
   * Batch update isUserSelectable for multiple models in the same provider
   */
  async updateModelVisibilityBatch(
    providerId: string,
    modelIds: string[],
    isUserSelectable: boolean
  ): Promise<number> {
    if (!Array.isArray(modelIds) || modelIds.length === 0) {
      return 0;
    }

    const providers = this.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);
    if (providerIndex < 0) {
      logger.warn('Attempted visibility update on missing provider', { providerId });
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
      logger.info('Models visibility updated', {
        providerId,
        count: updatedCount,
        isUserSelectable,
      });
    }

    return updatedCount;
  }

  /**
   * Batch update isUserSelectable for ALL models in a provider (for provider-level toggle)
   */
  async updateProviderAllModelsVisibility(
    providerId: string,
    isUserSelectable: boolean
  ): Promise<number> {
    const providers = this.getProviders();
    const providerIndex = providers.findIndex((p) => p.id === providerId);
    if (providerIndex < 0) {
      logger.warn('Attempted visibility update on missing provider', { providerId });
      return 0;
    }

    const models = providers[providerIndex]!.models;
    let updatedCount = 0;

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
      logger.info('Provider all models visibility updated', {
        providerId,
        count: updatedCount,
        isUserSelectable,
      });
    }

    return updatedCount;
  }

  async updateModelSpeed(providerId: string, modelId: string, speed: number): Promise<void> {
    logger.debug('updateModelSpeed called', { providerId, modelId, speed });
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
        logger.debug('Model speed updated', { modelId, speed, average });
      } else {
        logger.warn('Model not found for speed update', { modelId });
      }
    } else {
      logger.warn('Provider not found for speed update', { providerId });
    }
  }

  async deleteModel(modelId: string): Promise<boolean> {
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
      logger.info('Model deleted', { modelId });
    }

    return deleted;
  }

  async deleteModels(modelIds: string[]): Promise<number> {
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
      logger.info('Models batch deleted', { count: deletedCount });
    }

    return deletedCount;
  }

  findModel(modelId: string): { provider: Provider; model: Model } | null {
    const providers = this.getProviders();
    for (const provider of providers) {
      // First try to find by local id (UUID)
      let model = provider.models.find((m) => m.id === modelId);
      if (model) {
        logger.debug('Model lookup hit by id', {
          provider: logger.sanitizeProvider(provider),
          model: logger.sanitizeModel(model),
        });
        return { provider, model };
      }
      // If not found by id, try by rid (remote id)
      model = provider.models.find((m) => m.rid === modelId);
      if (model) {
        logger.debug('Model lookup hit by rid', {
          provider: logger.sanitizeProvider(provider),
          model: logger.sanitizeModel(model),
        });
        return { provider, model };
      }
    }
    logger.warn('Model lookup miss', { modelId });
    return null;
  }

  // --- Network / Sync Logic ---

  public async fetchProviderModelsFromApi(provider: Provider): Promise<RemoteModelInfo[]> {
    const endpoint = provider.apiEndpoint?.trim();
    // Retrieve API key asynchronously from SecretStorage
    const apiKey = await this.getApiKey(provider.id);

    if (!endpoint) {
      throw new Error('Provider API endpoint is not configured');
    }

    if (!apiKey) {
      throw new Error('Provider API key is not configured');
    }

    const providerType = provider.providerType ?? 'generic';
    logger.debug('fetchProviderModelsFromApi invoked', {
      provider: logger.sanitizeProvider(provider),
      providerType,
    });

    try {
      switch (providerType) {
        // OpenAI (/completions) or OpenAI (/responses) - Both use OpenAI's models API
        case 'openai-completions':
        case 'openai-responses': {
          const url = this.resolveModelsUrl(endpoint, 'https://api.openai.com/v1');
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          });

          if (!response.ok) {
            throw new Error(await this.readResponseError(response));
          }

          const payload = (await response.json()) as Record<string, unknown>;
          const entries = Array.isArray(payload['data']) ? payload['data'] : [];
          const models: RemoteModelInfo[] = [];

          for (const entry of entries) {
            if (!entry || typeof entry !== 'object') {
              continue;
            }
            const record = entry as Record<string, unknown>;
            const id = typeof record['id'] === 'string' ? record['id'] : undefined;
            if (!id) {
              continue;
            }
            const displayName =
              typeof record['display_name'] === 'string' ? record['display_name'] : undefined;
            const ownedBy = typeof record['owned_by'] === 'string' ? record['owned_by'] : undefined;
            const description =
              typeof record['description'] === 'string'
                ? record['description']
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
        case 'anthropic-messages': {
          const baseUrl = this.normalizeBaseUrl(endpoint, 'https://api.anthropic.com');
          const url = this.buildUrl(baseUrl, '/v1/models');
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
          });

          if (!response.ok) {
            throw new Error(await this.readResponseError(response));
          }

          const payload = (await response.json()) as Record<string, unknown>;
          const listSource = Array.isArray(payload['models'])
            ? payload['models']
            : Array.isArray(payload['data'])
              ? payload['data']
              : [];
          const models: RemoteModelInfo[] = [];

          for (const entry of listSource) {
            if (!entry || typeof entry !== 'object') {
              continue;
            }
            const record = entry as Record<string, unknown>;
            const id =
              typeof record['id'] === 'string'
                ? record['id']
                : typeof record['name'] === 'string'
                  ? record['name']
                  : undefined;
            if (!id) {
              continue;
            }
            const displayName =
              typeof record['display_name'] === 'string' ? record['display_name'] : undefined;
            const description =
              typeof record['description'] === 'string' ? record['description'] : undefined;
            const maxInputTokens = this.coercePositiveInteger(
              record['input_token_limit'] ?? record['context_length'] ?? record['context_limit']
            );
            const maxOutputTokens = this.coercePositiveInteger(
              record['output_token_limit'] ?? record['max_output_tokens']
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
        case 'google-generateContent': {
          const baseUrl = this.normalizeBaseUrl(
            endpoint,
            'https://generativelanguage.googleapis.com/v1beta'
          );
          const url = `${this.buildUrl(baseUrl, '/models')}?key=${encodeURIComponent(apiKey)}`;
          const response = await fetch(url, {
            method: 'GET',
          });

          if (!response.ok) {
            throw new Error(await this.readResponseError(response));
          }

          const payload = (await response.json()) as Record<string, unknown>;
          const entries = Array.isArray(payload['models']) ? payload['models'] : [];
          const models: RemoteModelInfo[] = [];

          for (const entry of entries) {
            if (!entry || typeof entry !== 'object') {
              continue;
            }
            const record = entry as Record<string, unknown>;
            const name = typeof record['name'] === 'string' ? record['name'] : undefined;
            if (!name) {
              continue;
            }
            const displayName =
              typeof record['displayName'] === 'string' ? record['displayName'] : undefined;
            const description =
              typeof record['description'] === 'string' ? record['description'] : undefined;
            const maxInputTokens = this.coercePositiveInteger(record['inputTokenLimit']);
            const maxOutputTokens = this.coercePositiveInteger(record['outputTokenLimit']);

            let capabilities: Model['capabilities'] | undefined;
            const modalitiesSource = (record['inputModalities'] ??
              record['supportedInputModalities'] ??
              record['allowedInputModalities'] ??
              record['supportedModalities']) as unknown;
            if (Array.isArray(modalitiesSource)) {
              const hasImage = modalitiesSource.some(
                (value) => typeof value === 'string' && value.toUpperCase().includes('IMAGE')
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
          logger.warn('Unknown provider type for model fetching', { providerType });
          return [];
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Error fetching provider models', { error: msg });
      throw new Error(`Failed to fetch models: ${msg}`);
    }
  }

  private normalizeBaseUrl(endpoint: string | undefined, fallback: string): string {
    const base = (endpoint && endpoint.trim()) || fallback;
    return base.replace(/\/+$/, '');
  }

  private buildUrl(base: string, path: string): string {
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private resolveModelsUrl(endpoint: string, fallback: string): string {
    const baseUrl = this.normalizeBaseUrl(endpoint, fallback);
    const [baseWithoutQueryRaw, queryString] = baseUrl.split('?', 2);
    const baseWithoutQuery = baseWithoutQueryRaw || baseUrl;

    let path = baseWithoutQuery.replace(/\/(?:chat\/)?completions$/i, '');
    if (/\/openai\/deployments\//i.test(path)) {
      path = path.replace(/\/openai\/deployments\/[^/]+$/i, '/openai');
    }

    const modelsUrl = this.buildUrl(path, '/models');
    return queryString ? `${modelsUrl}?${queryString}` : modelsUrl;
  }

  private async readResponseError(response: Response): Promise<string> {
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
      if (typeof parsed?.error === 'string') {
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

  private coercePositiveInteger(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.min(Math.floor(value), ProviderModelManager.TOKEN_LIMIT);
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(Math.floor(parsed), ProviderModelManager.TOKEN_LIMIT);
      }
    }
    return undefined;
  }
}
