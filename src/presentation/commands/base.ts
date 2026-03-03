import * as vscode from 'vscode';
import { ProviderModelManager } from '../../core/providers/ProviderModelManager';
import { AddiTreeDataProvider } from '../views/providerView';
import { IStorageService } from '../../domain/interfaces';
import { EditorViewManager } from '../views/editorView';
import { logger } from '../../common/logger';

/**
 * Base command handler with common dependencies
 */
export abstract class BaseCommandHandler {
  protected manager: ProviderModelManager;
  protected treeDataProvider: AddiTreeDataProvider;
  protected context: vscode.ExtensionContext;
  protected storageService?: IStorageService;
  protected editorViewManager?: EditorViewManager;

  constructor(
    manager: ProviderModelManager,
    treeDataProvider: AddiTreeDataProvider,
    context: vscode.ExtensionContext
  ) {
    this.manager = manager;
    this.treeDataProvider = treeDataProvider;
    this.context = context;
  }

  public setStorageService(service: IStorageService) {
    this.storageService = service;
  }

  public setEditorViewManager(manager: EditorViewManager) {
    this.editorViewManager = manager;
  }

  protected refreshTreeView(): void {
    this.treeDataProvider.refresh();
  }

  protected logError(source: string, error: unknown, context?: Record<string, unknown>): void {
    logger.error(source, {
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });
  }
}
