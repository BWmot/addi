// Domain Events related to Provider/Model changes

/**
 * Event names for domain events
 */
export const DomainEvents = {
  // Provider events
  PROVIDER_ADDED: "provider.added",
  PROVIDER_UPDATED: "provider.updated",
  PROVIDER_DELETED: "provider.deleted",
  PROVIDER_API_KEY_CHANGED: "provider.apiKey.changed",

  // Model events
  MODEL_ADDED: "model.added",
  MODEL_UPDATED: "model.updated",
  MODEL_DELETED: "model.deleted",
  MODEL_VISIBILITY_CHANGED: "model.visibility.changed",

  // Config events
  CONFIG_EXPORTED: "config.exported",
  CONFIG_IMPORTED: "config.imported",
  CONFIG_RESET: "config.reset",
} as const;

/**
 * Event payload types
 */
export interface ProviderAddedEvent {
  providerId: string;
  providerName: string;
}

export interface ProviderDeletedEvent {
  providerId: string;
  providerName: string;
}

export interface ModelAddedEvent {
  providerId: string;
  modelId: string;
  modelName: string;
}

export interface ModelDeletedEvent {
  providerId: string;
  modelId: string;
}

export interface ModelVisibilityChangedEvent {
  providerId: string;
  modelId: string;
  isVisible: boolean;
}
