import * as vscode from "vscode";
import type {
  Provider,
  ProviderConfig,
  ModelConfig,
  ModelStats,
  Model,
} from "../../common/types";
import type { IStorageService, BackupEntry } from "../../domain/interfaces";
import { logger } from "../../common/logger";
import { ApiKeyService } from "./ApiKeyService";
import { IdGenerator } from "../../common/utils";

export class StorageService implements IStorageService {
  // 设计文档标准存储键
  private static readonly CONFIG_KEY = "addi.config"; // Memento，同步
  private static readonly CONFIG_MODIFIED_AT_KEY = "addi.config.modifiedAt";
  private static readonly STATS_STORAGE_KEY = "addi.local.stats"; // 本地存储
  private static readonly DEVICE_ID_KEY = "addi.local.deviceId"; // SecretStorage
  private static readonly BACKUPS_KEY = "addi.local.backups"; // 本地备份（不同步）
  private static readonly MAX_BACKUPS = 10; // 最多保留 10 份备份
  // Flag for VS Code settings sync
  private syncEnabled = false;
  private deviceId: string;
  private readonly _onDidUpdate = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this._onDidUpdate.event;

  // ApiKeyService instance for API key management
  private apiKeyService: ApiKeyService;

  constructor(private context: vscode.ExtensionContext) {
    // Initialize ApiKeyService
    this.apiKeyService = new ApiKeyService(context);

    // Initialize device ID
    this.deviceId = this.getOrCreateDeviceId();

    // Listen for secret changes from other windows or background processes
    this.context.secrets.onDidChange(async (e) => {
      if (e.key.startsWith("addi.local.apikeys.")) {
        // SecretStorage changed externally (e.g., from another window)
        // Fire update to refresh UI
        this._onDidUpdate.fire();
      }
    });

    // Handle settings sync events by refreshing when relevant configuration changes
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("addi")) {
          this._onDidUpdate.fire();
        }
      }),
    );
  }

  /**
   * Initializes the storage service.
   * Performs migration of API keys from globalState to SecretStorage.
   * @param normalizer A function to normalize provider data during initialization.
   */
  async initialize(
    normalizer?: (providers: Provider[]) => { mutated: boolean },
  ) {
    try {
      // Initially read as Provider[] to handle migration from old format
      // Note: We cast to Provider[] because runtime data might still have old fields like apiKey
      // but conceptually we are treating it as ProviderConfig + optional extra fields
      const stored = this.context.globalState.get<Provider[]>(
        StorageService.CONFIG_KEY,
        [],
      );

      // Step 1: Capture existing secrets BEFORE normalization
      // This is crucial because normalization might change provider IDs (e.g., migrating to UUID)
      // We need to preserve the secret mapping before IDs change
      const preNormalizationSecretMap = new Map<string, string>();
      for (const p of stored) {
        const oldId = p.id;
        const secretKey = `addi.local.apikeys.${oldId}`;
        const secret = await this.context.secrets.get(secretKey);
        if (secret) {
          preNormalizationSecretMap.set(oldId, secret);
        }
      }

      let migrationNeeded = false;

      // Step 2: Perform data migration/normalization (which may change provider IDs)
      if (normalizer) {
        const { mutated } = normalizer(stored);
        if (mutated) {
          migrationNeeded = true;
        }
      }

      // Step 3: Handle secrets after normalization
      // If provider IDs changed during normalization, we need to migrate secrets from old keys to new keys
      for (const p of stored) {
        const currentSecretKey = `addi.local.apikeys.${p.id}`;

        // Check if there's a secret cached from before normalization
        const secret = await this.context.secrets.get(currentSecretKey);

        if (!secret) {
          // Secret not found with new ID.
          // Since we removed plain apiKey handling (destructive update), we don't check p.apiKey here anymore.
          // If the ID changed and we can't find the secret, the user will need to re-enter the API key.
          // Try to migrate from pre-normalization map if possible (best effort)
          // But since we don't track ID changes easily, we skip complex migration logic here
          // as per "destructive update" allowance.
          // Note for debugging:
          // If p.apiKey existed in old data, it is heavily discouraged to use it.
          // We rely solely on SecretStorage now.
        } else {
          // Secret exists with new ID key - no need to cache, will be retrieved from SecretStorage on demand
        }
      }

      if (migrationNeeded) {
        // We will save using the new strict saveProviders method which handles types correctly
        await this.saveProviders(stored);
        logger.info("Migrated provider IDs and normalized data on startup");
      }

      this._onDidUpdate.fire();
    } catch (error) {
      logger.error("Failed to initialize secrets", error);
    }
  }

  setSettingsSync(enabled: boolean): void {
    if (this.syncEnabled === enabled) {
      logger.debug("Settings sync already at requested state", { enabled });
      return;
    }
    this.syncEnabled = enabled;
    if (enabled) {
      this.context.globalState.setKeysForSync([StorageService.CONFIG_KEY]);
    } else {
      this.context.globalState.setKeysForSync([]);
    }
    logger.info("Settings sync preference updated", { enabled });
  }

  isSettingsSyncEnabled(): boolean {
    return this.syncEnabled ?? false;
  }

  /**
   * Loads extended data from storage.
   * Extended data includes auxiliary information like speedHistory, averageSpeed, etc.
   * This data is NOT synced to avoid frequent sync operations.
   * @returns A map of provider ID to model ID to extended data.
   */
  private getExtendedData(): Map<string, Map<string, ModelStats>> {
    const stored = this.context.globalState.get<
      Record<string, Record<string, ModelStats>>
    >(StorageService.STATS_STORAGE_KEY, {});
    const result = new Map<string, Map<string, ModelStats>>();

    for (const [providerId, models] of Object.entries(stored)) {
      const modelMap = new Map<string, ModelStats>();
      for (const [modelId, extendData] of Object.entries(models)) {
        modelMap.set(modelId, extendData);
      }
      result.set(providerId, modelMap);
    }

    return result;
  }

  /**
   * Saves extended data to storage.
   * Extended data includes auxiliary information like speedHistory, averageSpeed, etc.
   * This data is NOT synced to avoid frequent sync operations.
   * @param providers The providers to extract extended data from.
   */
  private async saveExtendedData(providers: Provider[]): Promise<void> {
    const extendData: Record<string, Record<string, ModelStats>> = {};

    for (const provider of providers) {
      const providerStats: Record<string, ModelStats> = {};

      for (const model of provider.models) {
        if (model.speedHistory || model.averageSpeed !== undefined) {
          const stats: ModelStats = {};
          if (model.speedHistory) {
            stats.speedHistory = model.speedHistory;
          }
          if (model.averageSpeed !== undefined) {
            stats.averageSpeed = model.averageSpeed;
          }

          if (Object.keys(stats).length > 0) {
            providerStats[model.id] = stats;
          }
        }
      }

      if (Object.keys(providerStats).length > 0) {
        extendData[provider.id] = providerStats;
      }
    }

    await this.context.globalState.update(
      StorageService.STATS_STORAGE_KEY,
      extendData,
    );
  }

  /**
   * Get API Key for a provider from SecretStorage
   *
   * @param providerId The provider ID
   * @returns The API key or undefined
   */
  async getApiKey(providerId: string): Promise<string | undefined> {
    // Get from SecretStorage
    const secret = await this.apiKeyService.getApiKey(providerId);
    return secret;
  }

  /**
   * Delete API key from SecretStorage.
   *
   * @param providerId The provider ID
   */
  async deleteApiKey(providerId: string): Promise<void> {
    await this.apiKeyService.deleteApiKey(providerId);
    logger.info(`Deleted API key for provider ${providerId}`);
  }

  /**
   * Set API key directly to SecretStorage (without modifying config)
   * This is useful for quick local updates without triggering full provider save
   *
   * @param providerId The provider ID
   * @param apiKey The API key to store
   */
  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.apiKeyService.setApiKey(providerId, apiKey);
    logger.info(`Set API key for provider ${providerId}`);
  }

  /**
   * Clear all plugin data using wildcard pattern "addi.*".
   * This includes:
   * - All secrets from SecretStorage (any key starting with "addi.")
   * - All keys from globalState (any key starting with "addi.")
   * - Sync state
   */
  async clearAllData(): Promise<void> {
    logger.info(
      'Starting to clear all plugin data with wildcard pattern "addi.*"',
    );

    // 1. Clear ALL SecretStorage keys matching "addi.*"
    try {
      const secretKeys = await this.context.secrets.keys();
      const secretsDeleted = secretKeys.filter((key) =>
        key.startsWith("addi."),
      );

      for (const key of secretsDeleted) {
        await this.context.secrets.delete(key);
        logger.debug(`Deleted SecretStorage key: ${key}`);
      }
      logger.info(
        `Cleared ${secretsDeleted.length} SecretStorage keys matching "addi.*"`,
      );
    } catch (error) {
      // keys() might not be available on older VS Code versions
      logger.warn("Failed to use secrets.keys() method", error);
      // Fallback: clear known api keys individually
      await this.apiKeyService.deleteAllApiKeys();
    }

    // 2. Clear ALL globalState keys matching "addi.*"
    try {
      // Use getKeys to get all globalState keys
      const allKeys = this.context.globalState.keys();
      const globalStateKeys = allKeys.filter((key) => key.startsWith("addi."));

      for (const key of globalStateKeys) {
        await this.context.globalState.update(key, undefined);
        logger.debug(`Cleared globalState key: ${key}`);
      }
      logger.info(
        `Cleared ${globalStateKeys.length} globalState keys matching "addi.*"`,
      );
    } catch (error) {
      logger.warn("Failed to clear globalState keys", error);
      // Fallback: clear known keys individually
      await this.context.globalState.update(
        StorageService.CONFIG_KEY,
        undefined,
      );
      await this.context.globalState.update(
        StorageService.CONFIG_MODIFIED_AT_KEY,
        undefined,
      );
      await this.context.globalState.update(
        StorageService.STATS_STORAGE_KEY,
        undefined,
      );
      await this.context.globalState.update(
        StorageService.DEVICE_ID_KEY,
        undefined,
      );
      await this.context.globalState.update(
        StorageService.BACKUPS_KEY,
        undefined,
      );
    }

    // 3. Reset sync state
    this.syncEnabled = false;
    this.context.globalState.setKeysForSync([]);
    logger.info("Cleared all plugin data successfully with wildcard pattern");

    // Fire update event to refresh UI
    this._onDidUpdate.fire();
  }

  /**
   * Loads providers from storage.
   * Reconstitutes full Provider objects from Config (synced), Secrets (secure), and Stats (local).
   * @returns The list of providers with secrets and stats attached.
   */
  getProviders(): Provider[] {
    // Read persisted config (no stats, no secrets)
    const stored = this.context.globalState.get<ProviderConfig[]>(
      StorageService.CONFIG_KEY,
      [],
    );
    const extendedData = this.getExtendedData();

    // Reassemble full Provider objects
    return stored.map((config) => {
      // 1. Rebuild provider object
      const provider: Provider = {
        ...config,
        models: [], // Will be populated below
      };

      // Ensure no apiKey property leaks from config (if any remains due to old data)
      if ("apiKey" in provider) {
        delete (provider as any).apiKey;
      }

      // 2. Attach Model Stats
      const providerStats = extendedData.get(config.id);

      provider.models = config.models.map((modelConfig) => {
        const model: Model = { ...modelConfig };

        if (providerStats) {
          const stats = providerStats.get(model.id);
          if (stats) {
            if (stats.speedHistory) {
              model.speedHistory = stats.speedHistory;
            }
            if (stats.averageSpeed !== undefined) {
              model.averageSpeed = stats.averageSpeed;
            }
          }
        }
        return model;
      });

      return provider;
    });
  }

  /**
   * Saves providers to storage.
   * Splits data into:
   * 1. Config (Synced): Provider info, Model definitions
   * 2. Secrets (Secure): API Keys
   * 3. Stats (Local): Runtime statistics
   * @param providers The full provider objects to save.
   */
  async saveProviders(providers: Provider[]): Promise<void> {
    const configToSave: ProviderConfig[] = [];

    // Detect deleted providers to clean up secrets
    // Note: We use the raw globalState access here to get previous IDs cheaply
    const oldConfig = this.context.globalState.get<ProviderConfig[]>(
      StorageService.CONFIG_KEY,
      [],
    );
    const newIds = new Set(providers.map((p) => p.id));

    // Load all existing secrets for preservation logic
    const existingSecrets = new Map<string, string | undefined>();
    for (const p of oldConfig) {
      if (!newIds.has(p.id)) {
        // Cleanup secrets for deleted providers
        await this.apiKeyService.deleteApiKey(p.id);
      } else {
        // Keep track of secrets for existing providers (in case we need to preserve them)
        const secret = await this.apiKeyService.getApiKey(p.id);
        existingSecrets.set(p.id, secret);
      }
    }

    for (const p of providers) {
      // --- 1. Prepare Config (Strip Stats & Secrets) ---
      const { apiKey, models, ...restProvider } = p as any;

      // Ensure we don't leak apiKey into the synced config
      delete (restProvider as any).apiKey;

      // Handle secrets - store to SecretStorage (local only, not synced)
      // null/undefined = preserve existing key (don't touch SecretStorage)
      // '' = explicitly clear the key
      // non-empty string = set new key
      if (apiKey !== null && apiKey !== undefined && apiKey !== "") {
        await this.apiKeyService.setApiKey(p.id, apiKey);
      } else if (apiKey === "") {
        // Explicitly clear SecretStorage
        await this.apiKeyService.deleteApiKey(p.id);
      }
      // apiKey === null || apiKey === undefined → do nothing (preserve)

      const modelsConfig: ModelConfig[] = (models as Model[]).map((model) => {
        // Destructure to remove stats properties
        const { speedHistory, averageSpeed, ...staticConfig } = model;
        return staticConfig as ModelConfig;
      });

      configToSave.push({
        ...restProvider,
        models: modelsConfig,
      } as any);
    }

    // --- 2. Change Detection ---
    const oldConfigString = JSON.stringify(oldConfig);
    const newConfigString = JSON.stringify(configToSave);

    // Check if config actually changed
    const hasConfigChange = oldConfigString !== newConfigString;

    if (!hasConfigChange) {
      // If config didn't change, we still save stats (local),
      // but avoid bumping the modification time to prevent sync storms.
      await this.saveExtendedData(providers);
      logger.debug("Skipping synced config update: No changes detected");
      return;
    }

    // --- 3. Save Stats (Local) ---
    await this.saveExtendedData(providers);

    // --- 4. Save Config (Synced) ---
    // Updating the synced key automatically triggers Settings Sync to push to other devices
    await this.context.globalState.update(
      StorageService.CONFIG_KEY,
      configToSave,
    );

    // --- 5. Update modifiedAt timestamp ---
    await this.updateModifiedAt();

    this._onDidUpdate.fire();
  }

  // ==================== modifiedAt 时间戳管理 (设计文档标准) ====================

  /**
   * 获取配置的 modifiedAt 时间戳 (Memento，同步)
   */
  getConfigModifiedAt(): number {
    return this.context.globalState.get<number>(
      StorageService.CONFIG_MODIFIED_AT_KEY,
      0,
    );
  }

  /**
   * 设置配置的 modifiedAt 时间戳 (Memento，同步)
   */
  private async setConfigModifiedAt(timestamp: number): Promise<void> {
    await this.context.globalState.update(
      StorageService.CONFIG_MODIFIED_AT_KEY,
      timestamp,
    );
  }

  /**
   * 更新 modifiedAt 时间戳
   */
  private async updateModifiedAt(): Promise<void> {
    const now = Date.now();
    await this.setConfigModifiedAt(now);
  }

  // ==================== Device ID & Conflict Resolution ====================

  /**
   * Get or create a unique device ID for conflict resolution
   */
  private getOrCreateDeviceId(): string {
    const stored = this.context.globalState.get<string>(
      StorageService.DEVICE_ID_KEY,
    );
    if (stored) {
      return stored;
    }
    // Generate a new device ID (UUID v4)
    const newDeviceId = crypto.randomUUID();
    this.context.globalState.update(StorageService.DEVICE_ID_KEY, newDeviceId);
    logger.info("Generated new device ID for conflict resolution", {
      deviceId: newDeviceId,
    });
    return newDeviceId;
  }

  /**
   * Get the current device ID
   */
  getDeviceId(): string {
    return this.deviceId;
  }

  // ==================== Backup & Recovery ====================

  private getBackupEntry(): BackupEntry[] {
    return this.context.globalState.get<BackupEntry[]>(
      StorageService.BACKUPS_KEY,
      [],
    );
  }

  private saveBackupEntries(entries: BackupEntry[]): void {
    this.context.globalState.update(StorageService.BACKUPS_KEY, entries);
  }

  /**
   * Create a manual backup of the current config
   */
  async createBackup(description?: string): Promise<string> {
    const providers = this.getProviders();
    const backupId = IdGenerator.generate();

    const entry: BackupEntry = {
      id: backupId,
      timestamp: Date.now(),
      providerCount: providers.length,
      description: description || "Manual backup",
      providers: providers,
    };

    const entries = this.getBackupEntry();

    // Prepend new backup (newest first), trim to MAX_BACKUPS
    const updated = [entry, ...entries].slice(0, StorageService.MAX_BACKUPS);
    this.saveBackupEntries(updated);

    logger.info("Backup created", {
      backupId,
      providerCount: providers.length,
      totalBackups: updated.length,
    });

    return backupId;
  }

  /**
   * List all available backups (newest first)
   */
  listBackups(): BackupEntry[] {
    return this.getBackupEntry();
  }

  /**
   * Restore from a backup by its ID.
   * Returns the provider list (does NOT auto-save — caller decides when/how to persist).
   */
  restoreBackup(backupId: string): Provider[] {
    const entries = this.getBackupEntry();
    const entry = entries.find((e) => e.id === backupId);

    if (!entry) {
      logger.warn("restoreBackup: backup not found", { backupId });
      return [];
    }

    logger.info("Restoring from backup", {
      backupId,
      providerCount: entry.providerCount,
      timestamp: entry.timestamp,
    });

    // Return the backed-up providers — caller (ConfigCommandHandler) will prompt
    // the user and then call saveProviders() to persist the restored data.
    return entry.providers;
  }

  /**
   * Delete a specific backup
   */
  deleteBackup(backupId: string): void {
    const entries = this.getBackupEntry();
    const filtered = entries.filter((e) => e.id !== backupId);
    if (filtered.length === entries.length) {
      logger.debug("deleteBackup: backup not found", { backupId });
      return;
    }
    this.saveBackupEntries(filtered);
    logger.info("Backup deleted", { backupId, remaining: filtered.length });
  }

  /**
   * Delete all backups
   */
  clearAllBackups(): void {
    this.context.globalState.update(StorageService.BACKUPS_KEY, []);
    logger.info("All backups cleared");
  }
}
