import * as vscode from 'vscode';
import { ProviderModelManager } from '../../core/providers/ProviderModelManager';
import { AddiTreeDataProvider } from '../views/providerView';
import { LLMService } from '../../core/llm/llmService';
import { EditorViewManager } from '../views/editorView';
import { IStorageService } from '../../domain/interfaces';
import { ProviderCommandHandler } from './provider';
import { ModelCommandHandler } from './model';
import { ConfigCommandHandler } from './config';

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
    _llmService: LLMService
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

  async editProvider(item: { provider: { id: string; name: string } }): Promise<void> {
    return this.providerHandler.editProvider(item as any);
  }

  async deleteProvider(item: { provider: { id: string; name: string } }): Promise<void> {
    return this.providerHandler.deleteProvider(item as any);
  }

  async setApiKey(item: { provider: { id: string; name: string } }): Promise<void> {
    return this.providerHandler.setApiKey(item as any);
  }

  async pullProviderModels(item: { provider: { id: string; name: string } }): Promise<void> {
    return this.providerHandler.pullProviderModels(item as any);
  }

  async copyProvider(item: { provider: { id: string; name: string } }): Promise<void> {
    return this.providerHandler.copyProvider(item as any);
  }

  // ==================== Model Commands ====================

  async addModel(item: { provider: { id: string; name: string } }): Promise<void> {
    return this.modelHandler.addModel(item as any);
  }

  async editModels(items: any): Promise<void> {
    return this.modelHandler.editModels(items);
  }

  async deleteModels(items: any): Promise<void> {
    return this.modelHandler.deleteModels(items);
  }

  async copyModel(item: any): Promise<void> {
    return this.modelHandler.copyModel(item);
  }

  async showModelsInPicker(items: any): Promise<void> {
    return this.modelHandler.showModelsInPicker(items);
  }

  async hideModelsFromPicker(items: any): Promise<void> {
    return this.modelHandler.hideModelsFromPicker(items);
  }

  async showProviderModelsInPicker(item: {
    provider: { id: string; name: string };
  }): Promise<void> {
    return this.modelHandler.showProviderModelsInPicker(item as any);
  }

  async hideProviderModelsFromPicker(item: {
    provider: { id: string; name: string };
  }): Promise<void> {
    return this.modelHandler.hideProviderModelsFromPicker(item as any);
  }

  async setModelToCopilot(item: {
    model: { id: string; rid?: string; family: string };
    vendor: string;
  }): Promise<void> {
    return this.modelHandler.setModelToCopilot(item as any);
  }

  // ==================== Config Commands ====================

  async exportConfig(): Promise<void> {
    return this.configHandler.exportConfig();
  }

  async importConfig(): Promise<void> {
    return this.configHandler.importConfig();
  }

  async resetAllSettings(): Promise<void> {
    return this.configHandler.resetAllSettings();
  }

  async cleanAllStorage(): Promise<void> {
    return this.configHandler.cleanAllStorage();
  }

  async restoreFromBackup(): Promise<void> {
    return this.configHandler.restoreFromBackup();
  }

  async manageBackups(): Promise<void> {
    return this.configHandler.manageBackups();
  }

  // ==================== Deprecated Commands ====================

  /**
   * @deprecated API key sync has been removed
   */
  async setSyncPassKey(): Promise<void> {
    // No-op: API key sync feature has been removed
  }

  /**
   * @deprecated API key sync has been removed
   */
  async verifySyncPassKey(): Promise<void> {
    // No-op: API key sync feature has been removed
  }
}
