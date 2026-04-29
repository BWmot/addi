/**
 * Narrow interface for Provider & Model data operations.
 *
 * Defines the contract that Application-layer UseCases depend on,
 * decoupling them from the concrete `ProviderModelManager` class (DIP).
 * Implementation lives in `core/providers/ProviderModelManager.ts`.
 */
import type {
  Provider,
  Model,
  ModelDraft,
  RemoteModelInfo,
} from "../../common/types";

export interface IProviderModelManager {
  // ─── Provider CRUD ──────────────────────────────────────────────────────

  /** Get all providers from storage (normalized in-memory). */
  getProviders(): Provider[];

  /** Persist a full provider list. Normalizes before saving. */
  saveProviders(providers: Provider[]): Promise<void>;

  /**
   * Add a new provider.
   * @returns The created provider (with generated id)
   * @throws if name or endpoint validation fails
   */
  addProvider(
    providerData: Omit<Provider, "id" | "models">,
  ): Promise<Provider>;

  /**
   * Update an existing provider's fields.
   * @returns true if found and updated, false if provider not found
   */
  updateProvider(
    id: string,
    providerData: Partial<Omit<Provider, "id" | "models">>,
  ): Promise<boolean>;

  /**
   * Delete a provider and all its child models.
   * Also removes the associated API key from secret storage.
   * @returns true if found and deleted, false if provider not found
   */
  deleteProvider(id: string): Promise<boolean>;

  // ─── Model CRUD ─────────────────────────────────────────────────────────

  /** Add a model to an existing provider. Returns created model or null. */
  addModel(providerId: string, modelData: ModelDraft): Promise<Model | null>;

  /**
   * Update a single model within a provider.
   * @returns true if found and updated, false if provider/model not found
   */
  updateModel(
    providerId: string,
    modelId: string,
    modelData: Partial<ModelDraft>,
  ): Promise<boolean>;

  /**
   * Batch-update multiple models in the same provider.
   * @returns count of models actually updated
   */
  updateModels(
    providerId: string,
    modelIds: string[],
    modelData: Partial<ModelDraft>,
  ): Promise<number>;

  /**
   * Delete a model by id (searches across all providers).
   * @returns true if found and deleted
   */
  deleteModel(modelId: string): Promise<boolean>;

  /**
   * Batch-delete multiple models by id.
   * @returns count of models actually deleted
   */
  deleteModels(modelIds: string[]): Promise<number>;

  /**
   * Find a model and its parent provider by model id or remote id (rid).
   * @returns `{ provider, model }` or null if not found
   */
  findModel(modelId: string): { provider: Provider; model: Model } | null;

  // ─── Visibility ─────────────────────────────────────────────────────────

  /** Update isUserSelectable for a single model. */
  updateModelVisibility(
    providerId: string,
    modelId: string,
    isUserSelectable: boolean,
  ): Promise<boolean>;

  /** Batch update isUserSelectable for multiple models in the same provider. */
  updateModelVisibilityBatch(
    providerId: string,
    modelIds: string[],
    isUserSelectable: boolean,
  ): Promise<number>;

  /** Toggle isUserSelectable for ALL models in a provider. */
  updateProviderAllModelsVisibility(
    providerId: string,
    isUserSelectable: boolean,
  ): Promise<number>;

  // ─── Speed Tracking ─────────────────────────────────────────────────────

  /** Record a speed measurement for a model (rolling window of 5). */
  updateModelSpeed(
    providerId: string,
    modelId: string,
    speed: number,
  ): Promise<void>;

  // ─── API Key Management ─────────────────────────────────────────────────

  /** Retrieve API key from secret storage. */
  getApiKey(providerId: string): Promise<string | undefined>;

  /** Store API key in secret storage. */
  setApiKey(providerId: string, apiKey: string): Promise<void>;

  /** Delete API key from secret storage. */
  deleteApiKey(providerId: string): Promise<void>;

  // ─── Network ────────────────────────────────────────────────────────────

  /**
   * Fetch available model list from a remote provider API.
   * @returns parsed model metadata (not persisted)
   */
  fetchProviderModelsFromApi(provider: Provider): Promise<RemoteModelInfo[]>;

  // ─── Sync / Events ─────────────────────────────────────────────────────

  /** Force-fire update event (triggers tree-view refresh). */
  refresh(): void;
}
