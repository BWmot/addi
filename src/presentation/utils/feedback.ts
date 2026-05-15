import * as vscode from "vscode";

/**
 * 用户反馈工具
 */
export class UserFeedback {
  private static async showMessage(
    type: "info" | "warning" | "error",
    message: string,
    actions: string[] = [],
    modal = false,
  ): Promise<string | undefined> {
    const options: vscode.MessageOptions = { modal };
    switch (type) {
      case "warning":
        return await vscode.window.showWarningMessage(message, options, ...actions);
      case "error":
        return await vscode.window.showErrorMessage(message, options, ...actions);
      default:
        return await vscode.window.showInformationMessage(message, options, ...actions);
    }
  }

  static showInfo(message: string, modal = false): void {
    void UserFeedback.showMessage("info", message, [], modal);
  }

  static showError(message: string, modal = false): void {
    void UserFeedback.showMessage("error", message, [], modal);
  }

  static showWarning(message: string, modal = false): void {
    void UserFeedback.showMessage("warning", message, [], modal);
  }

  static async showWarningWithActions(
    message: string,
    actions: string[],
    modal = false,
  ): Promise<string | undefined> {
    return await UserFeedback.showMessage("warning", message, actions, modal);
  }

  static async showErrorWithActions(
    message: string,
    actions: string[],
    modal = false,
  ): Promise<string | undefined> {
    return await UserFeedback.showMessage("error", message, actions, modal);
  }

  static async showInputBox(options: vscode.InputBoxOptions): Promise<string | undefined> {
    const finalOptions: vscode.InputBoxOptions = {
      ignoreFocusOut: true,
      ...options,
    };
    return await vscode.window.showInputBox(finalOptions);
  }

  static async showProgress<T>(
    title: string,
    task: (
      progress: vscode.Progress<{ message?: string; increment?: number }>,
      token: vscode.CancellationToken,
    ) => Promise<T>,
  ): Promise<T> {
    return await vscode.window.withProgress<T>(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      task,
    );
  }

  static async showConfirmDialog(
    message: string,
    severity: "info" | "warning" | "error" = "warning",
    modal = false,
  ): Promise<boolean> {
    const choice = await UserFeedback.showMessage(
      severity,
      message,
      [vscode.l10n.t("Confirm"), vscode.l10n.t("Cancel")],
      modal,
    );
    return choice === vscode.l10n.t("Confirm");
  }
}
