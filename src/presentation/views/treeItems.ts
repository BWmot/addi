import * as vscode from "vscode";
import type { Model } from "../../common/types";
import { TokenFormatter } from "../../common/utils";

/**
 * Tree item representing a single AI model in the provider tree view.
 * Moved from core/providers/AddiChatProvider.ts to presentation layer (A2 fix).
 */
export class ModelTreeItem extends vscode.TreeItem {
  constructor(
    public model: Model,
    public vendor = "addi-provider",
    public hasApiKey = false, // whether the parent provider has API key
  ) {
    super(model.name, vscode.TreeItemCollapsibleState.None);
    this.id = model.id;

    const supportsTools = model.capabilities?.toolCalling;
    const isHidden = model.isUserSelectable === false;

    // Context value: show warning icon if no API key or model doesn't support tools
    // or if the model is hidden from the picker
    if (isHidden) {
      // Model is hidden from picker - show as hidden
      this.contextValue = "model-hidden";
    } else if (!hasApiKey) {
      // No API key - show warning
      this.contextValue = "model-no-key";
    } else if (!supportsTools) {
      // Has API key but model doesn't support tools - show as ineligible
      this.contextValue = "model-ineligible";
    } else {
      // Has API key and supports tools - normal model
      this.contextValue = "model";
    }

    const capabilityHints: string[] = [];
    if (model.capabilities?.vision) {
      capabilityHints.push("vision");
    }
    if (supportsTools) {
      capabilityHints.push(`tools`);
    }
    const inputTokensDetail = TokenFormatter.formatDetailed(
      model.maxInputTokens,
    );
    const outputTokensDetail = TokenFormatter.formatDetailed(
      model.maxOutputTokens,
    );
    let tooltip = `name: ${model.name}\nvendor: ${vendor}\nid: ${model.id}\nrid: ${model.rid}\nfamily: ${model.family}\nversion: ${model.version}\ninput: ${inputTokensDetail}\noutput: ${outputTokensDetail}`;
    if (model.averageSpeed) {
      tooltip += `\nspeed: ${model.averageSpeed.toFixed(1)} t/s`;
    } else {
      tooltip += `\nspeed: ?/s`;
    }
    if (capabilityHints.length > 0) {
      tooltip += `\ncapabilities: ${capabilityHints.join(", ")}`;
    }

    this.tooltip = tooltip;
    const inputSummary = TokenFormatter.format(model.maxInputTokens);
    const outputSummary = TokenFormatter.format(model.maxOutputTokens);
    let desc =
      inputSummary && outputSummary
        ? ` · ${inputSummary}↑/${outputSummary}↓`
        : "";
    if (model.averageSpeed) {
      desc += ` · ${model.averageSpeed.toFixed(0)}/s`;
    }
    this.description = desc;
  }
}

/**
 * Normalize tree items argument to an array.
 * Extracted from repeated patterns in extension.ts (C8 fix).
 */
export function normalizeTreeItems<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}
