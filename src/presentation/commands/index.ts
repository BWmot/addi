import type * as vscode from "vscode";
import type { ProviderModelManager } from "../../core/providers/ProviderModelManager";
import type { AddiTreeDataProvider } from "../views/providerView";
import type { LLMService } from "../../core/llm/llmService";
import type { EditorViewManager } from "../views/editorView";
import type { IStorageService } from "../../domain/interfaces";
import { ProviderCommandHandler } from "./provider";
import { ModelCommandHandler } from "./model";
import { ConfigCommandHandler } from "./config";
import { ProviderTreeItem } from "../views/providerView";
import { ModelTreeItem } from "../views/treeItems";

/**
 * Command Handler - Facade that delegates to specialized handlers
 */
export class CommandHandler {
  private providerHandler: ProviderCommandHandler;
  private modelHandler: ModelCommandHandler;
  private configHandler: ConfigCommandHandler;

  constructor(
    manager: ProviderModelManager,
    treeDataProvider: AddiTreeDataProvider,
    context: vscode.ExtensionContext,
    _llmService: LLMService,
  ) {
    // Initialize specialized handlers
    this.providerHandler = new ProviderCommandHandler(manager, treeDataProvider, context);
    this.modelHandler = new ModelCommandHandler(manager, treeDataProvider, context);
    this.configHandler = new ConfigCommandHandler(manager, treeDataProvider, context);
  }

  public setStorageService(service: IStorageService): void {
    this.providerHandler.setStorageService(service);
    this.modelHandler.setStorageService(service);
    this.configHandler.setStorageService(service);
  }

  public setEditorViewManager(manager: EditorViewManager): void {
    this.providerHandler.setEditorViewManager(manager);
    this.modelHandler.setEditorViewManager(manager);
    this.configHandler.setEditorViewManager(manager);
  }

  // ==================== Provider Commands ====================

  async addProvider(): Promise<void> {
    return this.providerHandler.addProvider();
  }

  async editProvider(item: ProviderTreeItem): Promise<void> {
    return this.providerHandler.editProvider(item);
  }

  async deleteProvider(item: ProviderTreeItem): Promise<void> {
    return this.providerHandler.deleteProvider(item);
  }

  async setApiKey(item: ProviderTreeItem): Promise<void> {
    return this.providerHandler.setApiKey(item);
  }

  async pullProviderModels(item: ProviderTreeItem): Promise<void> {
    return this.providerHandler.pullProviderModels(item);
  }

  async copyProvider(item: ProviderTreeItem): Promise<void> {
    return this.providerHandler.copyProvider(item);
  }

  // ==================== Model Commands ====================

  async addModel(item: ProviderTreeItem): Promise<void> {
    return this.modelHandler.addModel(item);
  }

  async editModels(items: ModelTreeItem[]): Promise<void> {
    return this.modelHandler.editModels(items);
  }

  async deleteModels(items: ModelTreeItem[]): Promise<void> {
    return this.modelHandler.deleteModels(items);
  }

  async copyModel(item: ModelTreeItem): Promise<void> {
    return this.modelHandler.copyModel(item);
  }

  async showModelsInPicker(items: ModelTreeItem[]): Promise<void> {
    return this.modelHandler.showModelsInPicker(items);
  }

  async hideModelsFromPicker(items: ModelTreeItem[]): Promise<void> {
    return this.modelHandler.hideModelsFromPicker(items);
  }

  async showProviderModelsInPicker(item: {
    provider: { id: string; name: string };
  }): Promise<void> {
    return this.modelHandler.showProviderModelsInPicker(item);
  }

  async hideProviderModelsFromPicker(item: {
    provider: { id: string; name: string };
  }): Promise<void> {
    return this.modelHandler.hideProviderModelsFromPicker(item);
  }

  async setModelToCopilot(item: {
    model: { id: string; rid?: string; family: string };
    vendor: string;
  }): Promise<void> {
    return this.modelHandler.setModelToCopilot(item);
  }

  // ==================== Config Commands ====================

  async exportConfig(): Promise<void> {
    return this.configHandler.exportConfig();
  }

  async importConfig(): Promise<void> {
    return this.configHandler.importConfig();
  }

  async initExtension(): Promise<void> {
    return this.configHandler.initExtension();
  }

  async restoreFromBackup(): Promise<void> {
    return this.configHandler.restoreFromBackup();
  }

  async manageBackups(): Promise<void> {
    return this.configHandler.manageBackups();
  }
}
