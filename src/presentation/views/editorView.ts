import * as vscode from "vscode";
import type { ProviderModelManager } from "../../core/providers/ProviderModelManager";
import { ProviderTreeItem } from "./providerView";
import { ModelTreeItem } from "./treeItems";
import { logger, maskSecret, LogScope } from "../../common/logger";
import type { Provider, Model, ModelOptions } from "../../common/types";
import { TokenFormatter } from "../../common/utils";
import { ConfigManager } from "../../infrastructure/vscode/configService";
import { ModelTester } from "../../core/llm/modelTester";

/**
 * Extended model data type with optional speed tracking fields
 * (per coding-standards §1.2).
 */
interface ModelDataWithSpeed {
  [key: string]: unknown;
  averageSpeed?: number;
  speedHistory?: number[];
}

export class EditorViewManager {
  public static readonly viewType = "addiEditor";
  private _panel: vscode.WebviewPanel | undefined;
  private _currentItem: ProviderTreeItem | ModelTreeItem | undefined;
  private _currentItems: ModelTreeItem[] = []; // For batch editing
  private _currentProvider: Provider | undefined;
  private _lastVerifiedData: string | undefined;
  private _detectedSpeed: number | undefined;
  private _viewState: {
    mode: "edit" | "create";
    type: "provider" | "model";
    parentId?: string;
    prefillData?: Record<string, unknown>;
    isBatch?: boolean; // Flag for batch edit mode
    batchCount?: number; // Number of items in batch
  } = { mode: "edit", type: "provider" };
  private _lastUpdateMessage: unknown;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _manager: ProviderModelManager,
    private readonly _refreshTree: () => void,
  ) {}

  public async openEditor(
    item: ProviderTreeItem | ModelTreeItem | ModelTreeItem[] | undefined,
    mode: "edit" | "create",
    parentId?: string,
    prefillData?: Record<string, unknown>,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (this._panel) {
      this._panel.reveal(column);
    } else {
      this._panel = vscode.window.createWebviewPanel(
        EditorViewManager.viewType,
        vscode.l10n.t("Addi Editor"),
        column || vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this._extensionUri],
        },
      );

      this._panel.onDidDispose(() => {
        this._panel = undefined;
      });

      this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);

      this._panel.webview.onDidReceiveMessage(async (data) => {
        logger.debug("Webview message received", data, LogScope.VIEW);
        switch (data.type) {
          case "saveProvider":
            await this._saveProvider(data.payload);
            break;
          case "saveModel":
            await this._saveModel(data.payload);
            break;
          case "verifyModel":
            await this._verifyModel(data.payload);
            break;
          case "ready":
            if (this._lastUpdateMessage) {
              this._panel?.webview.postMessage(this._lastUpdateMessage);
            }
            break;
          case "log":
            logger.debug("Webview log", data.payload, LogScope.VIEW);
            break;
          case "cancel":
            this._panel?.dispose();
            break;
          case "showError":
            await vscode.window.showErrorMessage(
              data.payload?.message || vscode.l10n.t("An error occurred"),
            );
            break;
        }
      });
    }

    await this._updatePanelContent(item, mode, parentId, prefillData);
  }

  private async _updatePanelContent(
    item: ProviderTreeItem | ModelTreeItem | ModelTreeItem[] | undefined,
    mode: "edit" | "create",
    parentId?: string,
    prefillData?: Record<string, unknown>,
  ) {
    // Handle array of items for batch editing
    this._currentItems = [];
    if (Array.isArray(item)) {
      this._currentItems = item;
      // If more than 1 item, use batch mode (name/id not editable)
      // If 1 item, treat as single edit (name/id editable)
      if (item.length > 1) {
        item = undefined; // Will use batch data
      } else if (item.length === 1) {
        item = item[0]; // Single item, use existing logic
      } else {
        item = undefined;
      }
    }

    this._currentItem = item;
    this._lastVerifiedData = undefined;
    this._detectedSpeed = undefined;

    // Determine if we're in batch mode (more than 1 item)
    const isBatchMode = this._currentItems.length > 1;
    const batchCount = this._currentItems.length;

    if (item instanceof ProviderTreeItem) {
      this._currentProvider = item.provider;
    } else if (item instanceof ModelTreeItem) {
      const pId = this._getParentProviderId(item);
      this._currentProvider = pId
        ? this._manager.getProviders().find((p) => p.id === pId)
        : undefined;
    } else if (mode === "create" && parentId) {
      this._currentProvider = this._manager.getProviders().find((p) => p.id === parentId);
    } else if (isBatchMode && this._currentItems.length > 0) {
      // For batch mode, get provider from first item
      const firstItem = this._currentItems[0];
      if (firstItem) {
        const pId = this._getParentProviderId(firstItem);
        this._currentProvider = pId
          ? this._manager.getProviders().find((p) => p.id === pId)
          : undefined;
      }
    } else {
      this._currentProvider = undefined;
    }

    const type =
      item instanceof ProviderTreeItem || (mode === "create" && !parentId) ? "provider" : "model";
    this._viewState = {
      mode,
      type,
      ...(prefillData !== undefined && { prefillData }),
      isBatch: isBatchMode,
      batchCount,
    };
    if (parentId) {
      this._viewState.parentId = parentId;
    }

    let title = vscode.l10n.t("Addi Editor");
    if (mode === "create") {
      title =
        type === "provider" ? vscode.l10n.t("Create Provider") : vscode.l10n.t("Create Model");
    } else {
      if (isBatchMode) {
        title = vscode.l10n.t("Edit {0} Models", batchCount);
      } else if (item instanceof ProviderTreeItem) {
        title = vscode.l10n.t("Edit {0}", item.provider.name);
      } else if (item instanceof ModelTreeItem) {
        title = vscode.l10n.t("Edit {0}", item.model.name);
      }
    }

    let dataToSend: Record<string, unknown> = {};
    if (mode === "create") {
      if (prefillData) {
        dataToSend = prefillData;
      } else if (type === "model") {
        // Inherit provider-level experimental options so they show
        // as checked by default in the new model form.
        const inheritedOptions: Partial<ModelOptions> = {};
        if (this._currentProvider?.options) {
          const provOpts = this._currentProvider.options;
          if (provOpts.reasoningContentAdapt) {
            inheritedOptions.reasoningContentAdapt = true;
          }
          if (provOpts.extractReasoningContent) {
            inheritedOptions.extractReasoningContent = true;
          }
          if (provOpts.temperature !== undefined) {
            inheritedOptions.temperature = provOpts.temperature;
          }
          if (provOpts.reasoningEffort) {
            inheritedOptions.reasoningEffort = provOpts.reasoningEffort;
          }
        }
        dataToSend = {
          family: ConfigManager.getDefaultModelFamily(),
          version: ConfigManager.getDefaultModelVersion(),
          maxInputTokens: ConfigManager.getDefaultMaxInputTokens(),
          maxOutputTokens: ConfigManager.getDefaultMaxOutputTokens(),
          capabilities: {
            toolCalling: true,
            reasoning: true,
            vision: false,
          },
          options:
            Object.keys(inheritedOptions).length > 0
              ? (inheritedOptions as ModelOptions)
              : undefined,
        };
      }
    } else if (isBatchMode) {
      // For batch mode, send placeholder data
      dataToSend = {
        name: `Selected ${batchCount} models`,
        id: `Selected ${batchCount} models`,
        isBatchMode: true,
        batchCount: batchCount,
      };
    } else {
      if (item instanceof ProviderTreeItem) {
        // Fetch current API key from SecretStorage for masking
        const apiKey = await this._manager.getApiKey(item.provider.id);

        // Clone provider and inject masked API key for UI display
        dataToSend = {
          ...item.provider,
          maskedApiKey: maskSecret(apiKey),
        };
      } else {
        // Get model data
        const modelData = item?.model;
        // If editing a model, also include parent provider options for placeholder suggestions
        const parentId =
          item instanceof ModelTreeItem ? this._getParentProviderId(item) : undefined;
        const parentProvider = parentId
          ? this._manager.getProviders().find((p) => p.id === parentId)
          : undefined;
        dataToSend = {
          ...modelData,
          parentProviderOptions: parentProvider?.options,
          parentProviderType: parentProvider?.providerType,
          parentExtraBody: parentProvider?.extraBody,
          parentExtraHeader: parentProvider?.extraHeader,
        };
      }
    }

    if (this._panel) {
      this._panel.title = title;
      this._lastUpdateMessage = {
        type: "update",
        locale: vscode.env.language,
        mode: mode,
        item: {
          type: type,
          isBatchMode: isBatchMode,
          batchCount: batchCount,
          data: dataToSend,
          parentId:
            parentId ||
            (item instanceof ModelTreeItem ? this._getParentProviderId(item) : undefined),
        },
      };
      this._panel.webview.postMessage(this._lastUpdateMessage);
    }
  }

  private _getParentProviderId(item: ModelTreeItem): string | undefined {
    const result = this._manager.findModel(item.model.id);
    return result?.provider.id;
  }

  private async _saveProvider(data: Record<string, unknown>) {
    // Defensive: batch editing providers is not supported
    if (this._viewState.isBatch) {
      vscode.window.showErrorMessage(vscode.l10n.t("Batch editing providers is not supported."));
      return;
    }

    if (this._viewState.mode === "create") {
      const providerData: Omit<Provider, "id" | "models"> = {
        name: data.name,
        providerType: data.providerType,
        apiEndpoint: data.apiEndpoint,
        apiKey: data.apiKey,
        description: data.description,
        website: data.website,
        ...(data.extraBody !== undefined ? { extraBody: data.extraBody || undefined } : {}),
        ...(data.extraHeader !== undefined ? { extraHeader: data.extraHeader || undefined } : {}),
        ...(data.options ? { options: data.options } : {}),
      };
      if (!providerData.apiKey) {
        delete providerData.apiKey;
      }
      if (!providerData.apiEndpoint) {
        delete providerData.apiEndpoint;
      }
      if (!providerData.description) {
        delete providerData.description;
      }
      if (!providerData.website) {
        delete providerData.website;
      }

      try {
        await this._manager.addProvider(providerData);
        vscode.window.showInformationMessage(vscode.l10n.t('Provider "{0}" added.', data.name));
        this._refreshTree();
        this._panel?.dispose();
      } catch (e) {
        vscode.window.showErrorMessage(
          vscode.l10n.t("Failed to add provider: {0}", e instanceof Error ? e.message : String(e)),
        );
      }
      return;
    }

    if (!this._currentItem || !(this._currentItem instanceof ProviderTreeItem)) {
      return;
    }
    const provider = this._currentItem.provider;

    // Only update API Key if the user actually typed/changed the field.
    // When the field is untouched, pApiKeyTouched is false and we skip the field entirely,
    // preserving the existing SecretStorage value. An explicit clear is only triggered
    // when the user types into the field and leaves it empty.
    const apiKeyTouched = data.apiKeyTouched === true;

    const updates: Partial<Provider> = {
      name: data.name,
      description: data.description,
      website: data.website,
      apiEndpoint: data.apiEndpoint,
      providerType: data.providerType,
      ...(data.extraBody !== undefined ? { extraBody: data.extraBody || undefined } : {}),
      ...(data.extraHeader !== undefined ? { extraHeader: data.extraHeader || undefined } : {}),
      ...(data.options ? { options: data.options } : {}),
    };

    if (apiKeyTouched) {
      const trimmedApiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : undefined;
      // trimmedApiKey === '' → user cleared the field → delete the existing key
      // trimmedApiKey non-empty → user entered new key → set it
      updates.apiKey = trimmedApiKey ?? "";
    }
    // !apiKeyTouched → do NOT add apiKey to updates at all → caller preserves existing

    const success = await this._manager.updateProvider(provider.id, updates);
    if (success) {
      vscode.window.showInformationMessage(vscode.l10n.t('Provider "{0}" updated.', data.name));
      this._refreshTree();
      this._panel?.dispose();
    } else {
      vscode.window.showErrorMessage(vscode.l10n.t("Failed to update provider."));
    }
  }

  private async _verifyModel(data: Record<string, unknown>) {
    if (!this._currentProvider) {
      vscode.window.showErrorMessage(vscode.l10n.t("No provider context found."));
      return;
    }

    const maxInputTokens = TokenFormatter.parse(data.maxInputTokens);
    const maxOutputTokens = TokenFormatter.parse(data.maxOutputTokens);

    const modelDraft: Record<string, unknown> = {
      id: data.id,
      name: data.name,
      family: data.family,
      version: data.version,
      maxInputTokens: maxInputTokens,
      maxOutputTokens: maxOutputTokens,
      capabilities: data.capabilities || {
        vision: data.vision,
        reasoning: data.reasoning,
        toolCalling: data.toolCalling,
      },
    };
    const caps = modelDraft.capabilities;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t("Detecting parameters for {0}...", data.name || data.id),
        cancellable: true,
      },
      async (progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => {
          controller.abort();
        });
        try {
          // Retrieve API key from SecretStorage before testing
          const apiKey = await this._manager.getApiKey(this._currentProvider!.id);

          if (!apiKey) {
            throw new Error(vscode.l10n.t("API Key not found. Please configure it first."));
          }

          const providerWithKey = { ...this._currentProvider!, apiKey };

          const result = await ModelTester.testModelApi(
            providerWithKey,
            modelDraft,
            {
              detectInput: true,
              detectOutput: true,
              checkVision: true,
              checkTools: true,
              checkSpeed: false,
            },
            controller.signal,
            (msg) => {
              progress.report({ message: msg });
            },
          );

          if (result.success) {
            this._lastVerifiedData = JSON.stringify(data);
            this._detectedSpeed = result.speed;
            let msg = vscode.l10n.t("Detection successful for {0}!", data.name || data.id);

            if (result.speed) {
              msg += vscode.l10n.t("Speed: {0} t/s", result.speed.toFixed(1));
            }

            const updates: Record<string, unknown> = {};
            let hasUpdates = false;

            if (result.detectedMaxInputTokens) {
              updates.maxInputTokens = result.detectedMaxInputTokens;
              msg += vscode.l10n.t("Input: {0}", result.detectedMaxInputTokens);
              hasUpdates = true;
            }
            if (result.detectedMaxOutputTokens) {
              updates.maxOutputTokens = result.detectedMaxOutputTokens;
              msg += vscode.l10n.t("Output: {0}", result.detectedMaxOutputTokens);
              hasUpdates = true;
            }

            if (result.visionSupported !== undefined && result.visionSupported !== caps.vision) {
              updates.vision = result.visionSupported;
              msg += result.visionSupported
                ? vscode.l10n.t(" (Vision detected)")
                : vscode.l10n.t(" (Vision removed)");
              hasUpdates = true;
            }

            if (
              result.toolCallingSupported !== undefined &&
              result.toolCallingSupported !== caps.toolCalling
            ) {
              updates.toolCalling = result.toolCallingSupported;
              msg += result.toolCallingSupported
                ? vscode.l10n.t(" (Tools detected)")
                : vscode.l10n.t(" (Tools removed)");
              hasUpdates = true;
            }

            if (hasUpdates && this._panel) {
              this._panel.webview.postMessage({
                type: "updateFields",
                payload: updates,
              });
            }

            vscode.window.showInformationMessage(msg);
          } else {
            throw new Error(result.error || "Unknown error");
          }
        } catch (e) {
          this._lastVerifiedData = undefined;
          vscode.window.showErrorMessage(
            vscode.l10n.t("Verification failed: {0}", e instanceof Error ? e.message : String(e)),
          );
        }
      },
    );
  }

  private async _saveModel(data: Record<string, unknown>) {
    logger.debug(
      "_saveModel called",
      {
        data,
        viewState: this._viewState,
        currentItem: this._currentItem?.constructor.name,
      },
      LogScope.VIEW,
    );

    const maxInputTokens = TokenFormatter.parse(data.maxInputTokens);
    const maxOutputTokens = TokenFormatter.parse(data.maxOutputTokens);

    // In batch mode, allow empty values - don't update those fields
    const isBatchMode = this._viewState.isBatch && this._currentItems.length > 0;

    // For batch mode or single edit, validate that at least one token value is provided
    if (!isBatchMode && (!maxInputTokens || !maxOutputTokens)) {
      vscode.window.showErrorMessage(vscode.l10n.t("Invalid token values."));
      return;
    }

    // Use _lastVerifiedData to check if we can skip verification or warn user
    // For now, we just log it or ignore it as we trust the user's explicit save action
    if (this._lastVerifiedData && this._lastVerifiedData !== JSON.stringify(data)) {
      // Data changed since last verification
    }

    // Extract capabilities from nested structure (frontend sends capabilities object)
    const caps = data.capabilities || {};
    // Build model data - in batch mode with empty tokens, don't include those fields to preserve existing values
    const modelData: Partial<Model> = {
      id: data.id,
      rid: data.rid || "", // Remote ID for the model
      name: data.name,
      family: data.family,
      version: data.version,
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      extraBody: data.extraBody !== undefined ? data.extraBody : undefined,
      extraHeader: data.extraHeader !== undefined ? data.extraHeader : undefined,
      options: data.options,
      capabilities: {
        toolCalling: caps.toolCalling === undefined ? true : Boolean(caps.toolCalling),
        reasoning: caps.reasoning === undefined ? true : Boolean(caps.reasoning),
        vision: Boolean(caps.vision),
      },
    };

    if (this._detectedSpeed) {
      (modelData as ModelDataWithSpeed).averageSpeed = this._detectedSpeed;
      (modelData as ModelDataWithSpeed).speedHistory = [this._detectedSpeed];
    }

    if (this._viewState.mode === "create") {
      // For new models, don't set speedHistory (no history yet)
      if (this._detectedSpeed) {
        delete (modelData as ModelDataWithSpeed).speedHistory;
      }
      if (!this._viewState.parentId) {
        vscode.window.showErrorMessage(
          vscode.l10n.t("No parent provider specified for new model."),
        );
        return;
      }
      try {
        await this._manager.addModel(this._viewState.parentId, modelData as ModelDraft);
        vscode.window.showInformationMessage(vscode.l10n.t('Model "{0}" added.', data.name));
        this._refreshTree();
        this._panel?.dispose();
      } catch (e) {
        vscode.window.showErrorMessage(
          vscode.l10n.t("Failed to add model: {0}", e instanceof Error ? e.message : String(e)),
        );
      }
      return;
    }

    // Handle batch mode
    if (this._viewState.isBatch && this._currentItems.length > 0) {
      await this._saveBatchModels(modelData);
      return;
    }

    // Single model edit mode
    if (!this._currentItem || !(this._currentItem instanceof ModelTreeItem)) {
      return;
    }
    const model = this._currentItem.model;
    const parentId = this._getParentProviderId(this._currentItem);

    if (!parentId) {
      vscode.window.showErrorMessage(vscode.l10n.t("Could not find parent provider for model."));
      return;
    }

    // Update model speed separately to preserve speedHistory
    if (this._detectedSpeed) {
      await this._manager.updateModelSpeed(parentId, model.id, this._detectedSpeed);
      // Remove speedHistory and averageSpeed from modelData to avoid overriding
      delete (modelData as ModelDataWithSpeed).speedHistory;
      delete (modelData as ModelDataWithSpeed).averageSpeed;
    }

    const success = await this._manager.updateModel(parentId, model.id, modelData);
    if (success) {
      vscode.window.showInformationMessage(vscode.l10n.t('Model "{0}" updated.', data.name));
      this._refreshTree();
      this._panel?.dispose();
    } else {
      vscode.window.showErrorMessage(vscode.l10n.t("Failed to update model."));
    }
  }

  private async _saveBatchModels(modelData: Partial<Model>) {
    if (!this._currentProvider) {
      vscode.window.showErrorMessage(vscode.l10n.t("No provider context found for batch update."));
      return;
    }

    const parentId = this._currentProvider.id;

    // Don't include name/rid in batch update - those are handled per-model
    const { name, rid, version, ...batchUpdateData } = modelData;

    try {
      const ids = this._currentItems.map((i) => i.model.id);
      const updatedCount = await this._manager.updateModels(parentId, ids, batchUpdateData as Record<string, unknown>);
      vscode.window.showInformationMessage(
        vscode.l10n.t("{0} model(s) updated successfully.", updatedCount),
      );
      this._refreshTree();
      this._panel?.dispose();
    } catch (e) {
      vscode.window.showErrorMessage(
        vscode.l10n.t("Failed to update models: {0}", e instanceof Error ? e.message : String(e)),
      );
    }
  }

  private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
    const nonce = getNonce();

    // 构建 Vite 输出的代码路径
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "webview", "assets", "index.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "resources", "webview", "assets", "index.css"),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <!-- CSP configuration to ensure vs code security constraints -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Details</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
