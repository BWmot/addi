import type { Provider } from "../../common/types";
import type { Disposable } from "vscode";

/**
 * Backup entry containing a snapshot of the current providers.
 */
export interface BackupEntry {
  id: string;
  timestamp: number;
  providerCount: number;
  description: string;
  /** Provider data stored in the backup (reconstructed on restore) */
  providers: Provider[];
}

/**
 * Storage Service Interface - Domain Layer
 *
 * Defines the contract for data persistence operations.
 * Implementation lives in infrastructure layer.
 */
export interface IStorageService {
  /**
   * Get all providers from storage
   */
  getProviders(): Provider[];

  /**
   * Save providers to storage
   */
  saveProviders(providers: Provider[]): Promise<void>;

  /**
   * Subscribe to storage updates
   */
  onDidUpdate(listener: () => void): Disposable;

  /**
   * Check if settings sync is enabled
   */
  isSettingsSyncEnabled(): boolean;

  /**
   * Enable or disable settings sync
   */
  setSettingsSync(enabled: boolean): void;

  /**
   * Initialize storage with optional normalization
   */
  initialize(transform?: (providers: unknown[]) => { mutated: boolean }): void;

  /**
   * Get last configuration modified timestamp
   */
  getConfigModifiedAt(): number;

  // ========== API Key Management ==========

  /**
   * Get API key for a provider (from SecretStorage)
   */
  getApiKey(providerId: string): Promise<string | undefined>;

  /**
   * Set API key for a provider (to SecretStorage)
   */
  setApiKey(providerId: string, apiKey: string): Promise<void>;

  /**
   * Delete API key for a provider (from SecretStorage)
   */
  deleteApiKey(providerId: string): Promise<void>;

  // ========== Device Management ==========

  /**
   * Get device ID for sync identification
   */
  getDeviceId(): string;

  // ========== Data Management ==========

  /**
   * Clear all plugin data (SecretStorage + globalState)
   */
  clearAllData(): Promise<void>;

  // ========== Backup & Recovery ==========

  /**
   * Create a manual backup of the current config (e.g., before risky operations)
   * @param description Optional description for this backup
   * @returns The generated backup ID
   */
  createBackup(description?: string): Promise<string>;

  /**
   * List all available backups (newest first)
   */
  listBackups(): BackupEntry[];

  /**
   * Restore from a backup by its ID.
   * Returns the provider list from the backup (does NOT auto-save —
   * caller is responsible for prompting user and persisting).
   * @param backupId The backup ID to restore from
   * @returns The restored provider list, or empty array if not found
   */
  restoreBackup(backupId: string): Provider[];

  /**
   * Delete a specific backup
   * @param backupId The backup ID to delete
   */
  deleteBackup(backupId: string): void;

  /**
   * Delete all backups
   */
  clearAllBackups(): void;
}
