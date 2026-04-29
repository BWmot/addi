import type { Provider, Model } from "../../common/types";
import type { IProviderModelManager } from "../../domain/interfaces";
import { logger } from "../../common/logger";

export interface ModelWithProvider {
  provider: Provider;
  model: Model;
}

/**
 * Model-related use cases
 * Business logic extracted from ModelCommandHandler
 *
 * Depends on `IProviderModelManager` (DIP) — not the concrete class.
 */
export class ModelUseCases {
  constructor(private manager: IProviderModelManager) {}

  /**
   * Delete multiple models
   */
  async deleteModels(modelIds: string[]): Promise<number> {
    const count = await this.manager.deleteModels(modelIds);
    logger.info("Models deleted", { count, modelIds });
    return count;
  }

  /**
   * Update model visibility
   */
  async updateModelsVisibility(
    modelIds: string[],
    action: "show" | "hide" | "showAll" | "hideAll",
  ): Promise<void> {
    const providers = this.manager.getProviders();
    let mutated = false;

    for (const provider of providers) {
      if (!provider.models) {
        continue;
      }

      for (const model of provider.models) {
        if (action === "show" && modelIds.includes(model.id)) {
          model.isUserSelectable = true;
          mutated = true;
        } else if (action === "hide" && modelIds.includes(model.id)) {
          model.isUserSelectable = false;
          mutated = true;
        } else if (action === "showAll") {
          model.isUserSelectable = true;
          mutated = true;
        } else if (action === "hideAll") {
          model.isUserSelectable = false;
          mutated = true;
        }
      }
    }

    if (mutated) {
      await this.manager.saveProviders(providers);
      logger.info("Models visibility updated", {
        action,
        modelCount: modelIds.length,
      });
    }
  }

  /**
   * Find a model by ID and return its parent provider
   */
  findModelWithProvider(modelId: string): ModelWithProvider | null {
    const providers = this.manager.getProviders();

    for (const provider of providers) {
      const model = provider.models?.find((m) => m.id === modelId);
      if (model) {
        return { provider, model };
      }
    }

    return null;
  }
}
