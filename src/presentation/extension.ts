import * as vscode from 'vscode';
import { AddiChatProvider, ModelTreeItem } from '../core/providers/AddiChatProvider';
import { ProviderModelManager } from '../core/providers/ProviderModelManager';
import { LLMService } from '../core/llm/llmService';
import { AddiTreeDataProvider, ProviderTreeItem } from './views/providerView';
import { CommandHandler } from './commands';
import { EditorViewManager } from './views/editorView';
import { logger } from '../common/logger';
import { StorageService } from '../infrastructure/storage/storageService';

/**
 * Composition Root & Entry Point.
 *
 * Responsibilities:
 * 1. Initialize Infrastructure Services (Storage, Logger).
 * 2. Instantiate Core Business Logic (ProviderModelManager).
 * 3. Wire Dependencies (Dependency Injection).
 * 4. Register VS Code UI Components (Commands, Views).
 */
export function activate(context: vscode.ExtensionContext) {
  logger.initialize(context);
  const extension = vscode.extensions.getExtension('deepwn.addi');
  const version = extension?.packageJSON?.version ?? 'unknown';
  logger.info(`Extension activated (v${version})`, undefined, 'Extension');

  // Initialize Services (Infrastructure)
  const storageService = new StorageService(context);

  const applySettingsSyncPreference = async () => {
    const config = vscode.workspace.getConfiguration('addi');

    // Enable/disable settings sync for provider configuration
    const settingsSyncEnabled = config.get<boolean>('syncConfiguration', false);
    storageService.setSettingsSync(Boolean(settingsSyncEnabled));
  };

  applySettingsSyncPreference();

  // Initialize Core Managers with Dependencies
  const manager = new ProviderModelManager(storageService);
  // context.subscriptions.push(new vscode.Disposable(() => manager.dispose())); // Manager no longer needs dispose if it strictly manages logic

  const treeDataProvider = new AddiTreeDataProvider(manager);
  context.subscriptions.push(manager.onDidUpdate(() => treeDataProvider.refresh()));
  vscode.window.registerTreeDataProvider('addiProviders', treeDataProvider);

  // Automatically refresh the tree view when the available chat models change in VS Code
  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => {
      treeDataProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('addi')) {
        applySettingsSyncPreference();
        treeDataProvider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('addi.showLogs', () => {
      logger.show();
    })
  );

  // Register Addi Tool Provider (Bridge for global tools)
  // const addiToolProvider = new AddiToolProvider(toolManager, context);
  // addiToolProvider.register(context);

  // Debug command to list registered tools
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.debug.listTools', () => {
      const tools = vscode.lm.tools;
      const names = tools.map((t) => t.name).join(', ');
      vscode.window.showInformationMessage(`Registered LM Tools: ${names}`);
      logger.info('Registered LM Tools', {
        tools: tools.map((t) => ({ name: t.name, tags: t.tags })),
      });
    })
  );

  const llmService = new LLMService();
  const addiChatProvider = new AddiChatProvider(manager, llmService);
  vscode.lm.registerLanguageModelChatProvider('addi-provider', addiChatProvider);

  const treeView = vscode.window.createTreeView('addiProviders', {
    treeDataProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });
  context.subscriptions.push(treeView);

  // Refresh the tree view when the window gains focus to reflect any changes
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (e) => {
      if (e.focused) {
        treeDataProvider.refresh();
      }
    })
  );

  const commandHandler = new CommandHandler(manager, treeDataProvider, context, llmService);

  // Pass storage service to command handler
  commandHandler.setStorageService(storageService);

  // Initialize EditorViewManager
  const editorViewManager = new EditorViewManager(context.extensionUri, manager, () =>
    treeDataProvider.refresh()
  );
  commandHandler.setEditorViewManager(editorViewManager);

  context.subscriptions.push(
    vscode.commands.registerCommand('addi.manage', async () => {
      await vscode.commands.executeCommand('addiProviders.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('addi.addProvider', () => commandHandler.addProvider())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.editProvider', (item: ProviderTreeItem) =>
      commandHandler.editProvider(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.copyProvider', (item: ProviderTreeItem) =>
      commandHandler.copyProvider(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.deleteProvider', (item: ProviderTreeItem) =>
      commandHandler.deleteProvider(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.pullProviderModels', (item: ProviderTreeItem) =>
      commandHandler.pullProviderModels(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.addModel', (item: ProviderTreeItem) =>
      commandHandler.addModel(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.setApiKey', (item: ProviderTreeItem) =>
      commandHandler.setApiKey(item)
    )
  );
  // Unified commands - handle both single and multi-select internally
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.editModels', (item: ModelTreeItem | ModelTreeItem[]) => {
      let items: ModelTreeItem[] = [];
      if (Array.isArray(item)) {
        items = item as ModelTreeItem[];
      } else if (item) {
        items = [item as ModelTreeItem];
      }
      if (items.length <= 1) {
        const sel = treeView.selection as ModelTreeItem[];
        if (sel && sel.length > 1) {
          items = sel;
        }
      }
      commandHandler.editModels(items);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.copyModel', (item: ModelTreeItem) =>
      commandHandler.copyModel(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'addi.deleteModels',
      (item: ModelTreeItem | ModelTreeItem[]) => {
        let items: ModelTreeItem[] = [];
        if (Array.isArray(item)) {
          items = item as ModelTreeItem[];
        } else if (item) {
          items = [item as ModelTreeItem];
        }
        if (items.length <= 1) {
          const sel = treeView.selection as ModelTreeItem[];
          if (sel && sel.length > 1) {
            items = sel;
          }
        }
        commandHandler.deleteModels(items);
      }
    )
  );

  // Register visibility commands for models
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'addi.showModelsInPicker',
      (item: ModelTreeItem | ModelTreeItem[]) => {
        let items: ModelTreeItem[] = [];
        if (Array.isArray(item)) {
          items = item as ModelTreeItem[];
        } else if (item) {
          items = [item as ModelTreeItem];
        }
        if (items.length <= 1) {
          const sel = treeView.selection as ModelTreeItem[];
          if (sel && sel.length > 1) {
            items = sel;
          }
        }
        commandHandler.showModelsInPicker(items);
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'addi.hideModelsFromPicker',
      (item: ModelTreeItem | ModelTreeItem[]) => {
        let items: ModelTreeItem[] = [];
        if (Array.isArray(item)) {
          items = item as ModelTreeItem[];
        } else if (item) {
          items = [item as ModelTreeItem];
        }
        if (items.length <= 1) {
          const sel = treeView.selection as ModelTreeItem[];
          if (sel && sel.length > 1) {
            items = sel;
          }
        }
        commandHandler.hideModelsFromPicker(items);
      }
    )
  );

  // Register visibility commands for providers
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.showProviderModelsInPicker', (item: ProviderTreeItem) =>
      commandHandler.showProviderModelsInPicker(item)
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.hideProviderModelsFromPicker', (item: ProviderTreeItem) =>
      commandHandler.hideProviderModelsFromPicker(item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('addi.exportConfig', () => commandHandler.exportConfig())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.importConfig', () => commandHandler.importConfig())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:deepwn.addi');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('addi.setModelToCopilot', (item: ModelTreeItem) =>
      commandHandler.setModelToCopilot(item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('addi.ineligibleModelInfo', () => {
      // No action, just provides hover via command title
    })
  );

  // Register init extension command
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.initExtension', () => commandHandler.initExtension())
  );

  // Register backup/restore commands
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.restoreFromBackup', () =>
      commandHandler.restoreFromBackup()
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('addi.manageBackups', () => commandHandler.manageBackups())
  );
}

export function deactivate() {}
