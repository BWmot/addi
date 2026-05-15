import * as vscode from "vscode";
import { AddiChatProvider } from "../core/providers/AddiChatProvider";
import { ProviderModelManager } from "../core/providers/ProviderModelManager";
import { LLMService } from "../core/llm/llmService";
import { AddiTreeDataProvider, type ProviderTreeItem } from "./views/providerView";
import { type ModelTreeItem, normalizeTreeItems } from "./views/treeItems";
import { CommandHandler } from "./commands";
import { EditorViewManager } from "./views/editorView";
import { logger, LogScope } from "../common/logger";
import { UserFeedback } from "./utils/feedback";
import { StorageService } from "../infrastructure/storage/storageService";

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
  const extension = vscode.extensions.getExtension("deepwn.addi");
  const version = extension?.packageJSON?.version ?? "unknown";
  logger.info(`Extension activated (v${version})`, undefined, LogScope.EXTENSION);

  // Initialize Services (Infrastructure)
  const storageService = new StorageService(context);

  const applySettingsSyncPreference = async () => {
    const config = vscode.workspace.getConfiguration("addi");

    // Enable/disable settings sync for provider configuration
    const settingsSyncEnabled = config.get<boolean>("syncConfiguration", false);
    storageService.setSettingsSync(Boolean(settingsSyncEnabled));
  };

  applySettingsSyncPreference();

  // Initialize Core Managers with Dependencies
  const manager = new ProviderModelManager(storageService);
  // context.subscriptions.push(new vscode.Disposable(() => manager.dispose())); // Manager no longer needs dispose if it strictly manages logic

  const treeDataProvider = new AddiTreeDataProvider(manager);
  context.subscriptions.push(manager.onDidUpdate(() => treeDataProvider.refresh()));
  vscode.window.registerTreeDataProvider("addiProviders", treeDataProvider);

  // Automatically refresh the tree view when the available chat models change in VS Code
  context.subscriptions.push(
    vscode.lm.onDidChangeChatModels(() => {
      treeDataProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("addi")) {
        applySettingsSyncPreference();
        treeDataProvider.refresh();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("addi.showLogs", () => {
      logger.show();
    }),
  );

  // Debug command to list registered tools
  context.subscriptions.push(
    vscode.commands.registerCommand("addi.debug.listTools", () => {
      const tools = vscode.lm.tools;
      const names = tools.map((t) => t.name).join(", ");
      vscode.window.showInformationMessage(`Registered LM Tools: ${names}`);
      logger.info(
        "Registered LM Tools",
        {
          tools: tools.map((t) => ({ name: t.name, tags: t.tags })),
        },
        LogScope.EXTENSION,
      );
    }),
  );

  const llmService = new LLMService();
  const addiChatProvider = new AddiChatProvider(manager, llmService);
  vscode.lm.registerLanguageModelChatProvider("addi-provider", addiChatProvider);

  const treeView = vscode.window.createTreeView("addiProviders", {
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
    }),
  );

  const commandHandler = new CommandHandler(manager, treeDataProvider, context, llmService);

  // Pass storage service to command handler
  commandHandler.setStorageService(storageService);

  // Initialize EditorViewManager
  const editorViewManager = new EditorViewManager(context.extensionUri, manager, () =>
    treeDataProvider.refresh(),
  );
  commandHandler.setEditorViewManager(editorViewManager);

  // Helper: register a command with error handling and auto-dispose
  function registerCmd(id: string, handler: (...args: any[]) => any): void {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (...args: any[]) => {
        try {
          await handler(...args);
        } catch (error) {
          UserFeedback.showError(`Command ${id} failed: ${error}`);
          logger.error(`Command ${id} failed`, error, LogScope.COMMAND);
        }
      }),
    );
  }

  // Helper: resolve multi-select items from explicit arg or treeView.selection
  function resolveModelItems(item: ModelTreeItem | ModelTreeItem[]): ModelTreeItem[] {
    let items = normalizeTreeItems(item);
    if (items.length <= 1) {
      const sel = treeView.selection as ModelTreeItem[];
      if (sel && sel.length > 1) {
        items = sel;
      }
    }
    return items;
  }

  registerCmd("addi.manage", async () => {
    await vscode.commands.executeCommand("addiProviders.focus");
  });

  registerCmd("addi.addProvider", () => commandHandler.addProvider());
  registerCmd("addi.editProvider", (item: ProviderTreeItem) => commandHandler.editProvider(item));
  registerCmd("addi.copyProvider", (item: ProviderTreeItem) => commandHandler.copyProvider(item));
  registerCmd("addi.deleteProvider", (item: ProviderTreeItem) =>
    commandHandler.deleteProvider(item),
  );
  registerCmd("addi.pullProviderModels", (item: ProviderTreeItem) =>
    commandHandler.pullProviderModels(item),
  );
  registerCmd("addi.addModel", (item: ProviderTreeItem) => commandHandler.addModel(item));
  registerCmd("addi.setApiKey", (item: ProviderTreeItem) => commandHandler.setApiKey(item));

  // Unified commands - handle both single and multi-select internally
  registerCmd("addi.editModels", (item: ModelTreeItem | ModelTreeItem[]) =>
    commandHandler.editModels(resolveModelItems(item)),
  );
  registerCmd("addi.copyModel", (item: ModelTreeItem) => commandHandler.copyModel(item));
  registerCmd("addi.deleteModels", (item: ModelTreeItem | ModelTreeItem[]) =>
    commandHandler.deleteModels(resolveModelItems(item)),
  );

  // Register visibility commands for models
  registerCmd("addi.showModelsInPicker", (item: ModelTreeItem | ModelTreeItem[]) =>
    commandHandler.showModelsInPicker(resolveModelItems(item)),
  );
  registerCmd("addi.hideModelsFromPicker", (item: ModelTreeItem | ModelTreeItem[]) =>
    commandHandler.hideModelsFromPicker(resolveModelItems(item)),
  );

  // Register visibility commands for providers
  registerCmd("addi.showProviderModelsInPicker", (item: ProviderTreeItem) =>
    commandHandler.showProviderModelsInPicker(item),
  );
  registerCmd("addi.hideProviderModelsFromPicker", (item: ProviderTreeItem) =>
    commandHandler.hideProviderModelsFromPicker(item),
  );

  registerCmd("addi.exportConfig", () => commandHandler.exportConfig());
  registerCmd("addi.importConfig", () => commandHandler.importConfig());
  registerCmd("addi.openSettings", () => {
    vscode.commands.executeCommand("workbench.action.openSettings", "@ext:deepwn.addi");
  });
  registerCmd("addi.setModelToCopilot", (item: ModelTreeItem) =>
    commandHandler.setModelToCopilot(item),
  );
  registerCmd("addi.ineligibleModelInfo", () => {
    // No action, just provides hover via command title
  });
  registerCmd("addi.initExtension", () => commandHandler.initExtension());
  registerCmd("addi.restoreFromBackup", () => commandHandler.restoreFromBackup());
  registerCmd("addi.manageBackups", () => commandHandler.manageBackups());
}

export function deactivate() {}
