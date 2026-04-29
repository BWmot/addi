import * as vscode from "vscode";
import type { Provider } from "../../common/types";
import type { ProviderModelManager } from "../../core/providers/ProviderModelManager";
import { ModelTreeItem } from "./treeItems";
import { sortProviders, sortModels, type SortRule } from "../utils/sortStrategy";

export class ProviderTreeItem extends vscode.TreeItem {
  constructor(
    public provider: Provider,
    public hasApiKey = false,
  ) {
    super(provider.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = provider.id;

    // Determine contextValue based on whether API key exists in local SecretStorage
    if (hasApiKey) {
      // Has active API key in SecretStorage
      this.contextValue = "provider";
    } else {
      // No active key found
      this.contextValue = "provider-no-key";
    }

    if (provider.description) {
      this.description = provider.description;
    }

    let tooltip = `${provider.name} (${provider.models.length} models)`;

    if (provider.description) {
      tooltip += `\nDescription: ${provider.description}`;
    }
    if (provider.website) {
      tooltip += `\nWebsite: ${provider.website}`;
    }
    if (provider.apiEndpoint) {
      tooltip += `\nAPI Endpoint: ${provider.apiEndpoint}`;
    }
    if (provider.providerType) {
      tooltip += `\nType: ${provider.providerType}`;
    }

    // Show warning if no API key is set
    if (!hasApiKey) {
      tooltip += `\n⚠ API key not configured yet. Please set it up to use this provider.`;
    }

    this.tooltip = tooltip;

    // Note: Icons are intentionally not set here to preserve right-click/context menu functionality
    // If icons are needed in the future, they should be handled via a custom tree view renderer
  }
}

export class AddiTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private manager: ProviderModelManager) {}

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: vscode.TreeItem,
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    return this._getChildren(element);
  }

  private async _getChildren(
    element?: vscode.TreeItem,
  ): Promise<vscode.TreeItem[]> {
    const config = vscode.workspace.getConfiguration("addi");
    const sortRule = config.get<string>("sortRule", "none");
    const sortTarget = config.get<string>("sortTarget", "both");

    if (!element) {
      const providersList: vscode.TreeItem[] = [];

      // Fetch custom providers
      let providers = this.manager.getProviders();
      // Sort providers only if target includes providers
      if (
        sortRule !== "none" &&
        (sortTarget === "providers" || sortTarget === "both")
      ) {
        providers = sortProviders(providers, sortRule as SortRule);
      }

      // Batch fetch API key availability for all providers
      for (const p of providers) {
        const apiKey = await this.manager.getApiKey(p.id);
        const hasKey = !!apiKey?.trim();
        providersList.push(new ProviderTreeItem(p, hasKey));
      }
      return providersList;
    }

    if (element instanceof ProviderTreeItem) {
      // Sort models only if target includes models
      let models = [...element.provider.models];
      if (
        sortRule !== "none" &&
        (sortTarget === "models" || sortTarget === "both")
      ) {
        models = sortModels(models, sortRule as SortRule);
      }

      // Check if provider has API key in SecretStorage
      // Note: model-no-key status only affects the `setModelToCopilot` button (no button when no apiKey),
      // but should NOT affect the context menu - custom models should always be editable/deletable
      const apiKey = await this.manager.getApiKey(element.provider.id);
      const hasApiKey = !!apiKey?.trim();

      return models.map((m) => {
        return new ModelTreeItem(m, "addi-provider", hasApiKey);
      });
    }
    return [];
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
