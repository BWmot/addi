import * as vscode from "vscode";
import { BaseCommandHandler } from "./base";
import type { ProviderTreeItem } from "../views/providerView";
import type { ModelTreeItem } from "../views/treeItems";
import { UserFeedback } from "../utils/feedback";
import { ConfigManager } from "../../infrastructure/vscode/configService";
import { logger } from "../../common/logger";

/**
 * Model-related command handler
 */
export class ModelCommandHandler extends BaseCommandHandler {
  /**
   * Add a new model to a provider
   */
  async addModel(item: ProviderTreeItem): Promise<void> {
    logger.info(
      "Command addModel invoked",
      logger.sanitizeProvider(item.provider),
    );
    if (this.editorViewManager) {
      this.editorViewManager.openEditor(undefined, "create", item.provider.id);
    } else {
      UserFeedback.showError("Editor view manager not initialized");
    }
  }

  /**
   * Edit existing models
   */
  async editModels(items: ModelTreeItem[]): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    const count = items.length;
    logger.info("Command editModels invoked", { count });

    if (this.editorViewManager) {
      this.editorViewManager.openEditor(items, "edit");
    } else {
      UserFeedback.showError("Editor view manager not initialized");
    }
  }

  /**
   * Delete models
   */
  async deleteModels(items: ModelTreeItem[]): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    const count = items.length;
    const names = items.map((i) => i.model.name).join(", ");
    logger.info("Command deleteModels invoked", { count, models: names });

    if (ConfigManager.getConfirmDelete()) {
      const deleteOption: vscode.MessageItem = { title: "Delete" };
      const deleteDontAskOption: vscode.MessageItem = {
        title: "Delete and don't ask again",
      };
      const cancelOption: vscode.MessageItem = {
        title: "Cancel",
        isCloseAffordance: true,
      };

      const message =
        count === 1 && items[0]
          ? `Are you sure you want to delete the model "${items[0].model.name}"?`
          : `Are you sure you want to delete ${count} model(s)?`;

      const selection = await vscode.window.showWarningMessage(
        message,
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
        logger.debug("deleteModels canceled");
        return;
      }
    }

    try {
      const modelIds = items.map((i) => i.model.id);
      await this.manager.deleteModels(modelIds);

      this.refreshTreeView();
      UserFeedback.showInfo(`${count} model(s) deleted`);
      logger.info("Models deleted", { count, modelNames: names });
    } catch (error) {
      UserFeedback.showError(
        `Failed to delete models: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.logError("deleteModels failed", error);
    }
  }

  /**
   * Copy a model - opens editor for creating a copy
   */
  async copyModel(item: ModelTreeItem): Promise<void> {
    logger.info("Command copyModel invoked", logger.sanitizeModel(item.model));

    if (this.editorViewManager) {
      const result = this.manager.findModel(item.model.id);
      if (!result) {
        UserFeedback.showError("Parent provider not found");
        return;
      }

      // Copy model data without id to ensure it's treated as new
      const { id: _id, ...modelWithoutId } = item.model;
      const prefillData: Record<string, unknown> = {
        ...modelWithoutId,
        name: `${item.model.name} Copy`,
      };

      this.editorViewManager.openEditor(
        undefined,
        "create",
        result.provider.id,
        prefillData,
      );
    } else {
      UserFeedback.showError("Editor view manager not initialized");
    }
  }

  /**
   * Show models in the picker
   */
  async showModelsInPicker(items: ModelTreeItem[]): Promise<void> {
    await this.updateModelsVisibility(items, "show");
  }

  /**
   * Hide models from the picker
   */
  async hideModelsFromPicker(items: ModelTreeItem[]): Promise<void> {
    await this.updateModelsVisibility(items, "hide");
  }

  /**
   * Show all models from a provider in the picker
   */
  async showProviderModelsInPicker(item: ProviderTreeItem): Promise<void> {
    logger.info(
      "Command showProviderModelsInPicker invoked",
      logger.sanitizeProvider(item.provider),
    );
    await this.updateProviderModelsVisibility(item.provider.id, "show");
  }

  /**
   * Hide all models from a provider from the picker
   */
  async hideProviderModelsFromPicker(item: ProviderTreeItem): Promise<void> {
    logger.info(
      "Command hideProviderModelsFromPicker invoked",
      logger.sanitizeProvider(item.provider),
    );
    await this.updateProviderModelsVisibility(item.provider.id, "hide");
  }

  /**
   * Set a model to the VS Code Chat UI
   */
  async setModelToCopilot(item: ModelTreeItem): Promise<void> {
    const vendor = item.vendor;
    const modelId =
      vendor === "addi-provider"
        ? `addi-model:${item.model.id}`
        : item.model.rid;
    const family = item.model.family;

    logger.debug(
      "Executing setModelToCopilot",
      { vendor, modelId, family },
      "Commands",
    );

    try {
      // Ensure the model is visible in the picker before selecting it
      if (vendor === "addi-provider") {
        const result = this.manager.findModel(item.model.id);
        if (result) {
          try {
            await this.manager.updateModelVisibility(
              result.provider.id,
              item.model.id,
              true,
            );
            this.refreshTreeView();
          } catch (error) {
            logger.warn("Failed to force-show model before selection", {
              error: error instanceof Error ? error.message : String(error),
              modelId: item.model.id,
            });
          }
        }
      }

      // Execute internal VS Code command to change the chat model
      await vscode.commands.executeCommand(
        "workbench.action.chat.changeModel",
        {
          vendor,
          family,
          id: modelId,
        },
      );

      // Open chat side bar if not already open
      try {
        await vscode.commands.executeCommand("workbench.action.chat.open");
      } catch {
        // Ignore if already open
      }

      // Focus the chat input after model selection
      await vscode.commands.executeCommand("workbench.action.chat.focusInput");

      logger.info("Chat model set to Copilot via command", {
        vendor,
        modelId,
        family,
      });
    } catch (error) {
      logger.warn("Failed to select chat model via internal command", {
        error: error instanceof Error ? error.message : String(error),
        vendor,
        modelId,
      });
      UserFeedback.showError(
        "Failed to switch model in Chat UI. Please select it manually.",
      );
    }
  }

  /**
   * Update visibility for selected models
   */
  private async updateModelsVisibility(
    items: ModelTreeItem[],
    action: "show" | "hide",
  ): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    const count = items.length;
    const actionLabel = action === "show" ? "show" : "hide";
    logger.info(`Command ${actionLabel}ModelsInPicker invoked`, { count });

    try {
      const isUserSelectable = action === "show";

      // Group models by provider
      const modelsByProvider = new Map<string, ModelTreeItem[]>();
      for (const item of items) {
        const result = this.manager.findModel(item.model.id);
        if (result) {
          const pid = result.provider.id;
          if (!modelsByProvider.has(pid)) {
            modelsByProvider.set(pid, []);
          }
          modelsByProvider.get(pid)!.push(item);
        }
      }

      let totalUpdated = 0;
      for (const [providerId, models] of modelsByProvider) {
        const modelIds = models.map((m) => m.model.id);
        const updated = await this.manager.updateModelVisibilityBatch(
          providerId,
          modelIds,
          isUserSelectable,
        );
        totalUpdated += updated;
      }

      this.refreshTreeView();
      UserFeedback.showInfo(
        `${totalUpdated} model(s) ${action === "show" ? "shown in" : "hidden from"} picker`,
      );
      logger.info(`Models ${actionLabel}`, { count: totalUpdated });
    } catch (error) {
      UserFeedback.showError(
        `Failed to ${action} models: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.logError(`${actionLabel}Models failed`, error);
    }
  }

  /**
   * Update visibility for all models of a provider
   */
  private async updateProviderModelsVisibility(
    providerId: string,
    action: "show" | "hide",
  ): Promise<void> {
    try {
      const visible = action === "show";
      const updated = await this.manager.updateProviderAllModelsVisibility(
        providerId,
        visible,
      );

      this.refreshTreeView();
      UserFeedback.showInfo(
        `${updated} model(s) ${action === "show" ? "shown in" : "hidden from"} picker`,
      );
      logger.info(`Provider models ${action}`, { providerId, count: updated });
    } catch (error) {
      UserFeedback.showError(
        `Failed to ${action} provider models: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.logError(`updateProviderModelsVisibility failed`, error);
    }
  }
}
