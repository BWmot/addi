import { Provider } from '../../common/types';
import { Disposable } from 'vscode';

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
}
