import * as vscode from "vscode";

// ============================================================================
// Scope Constants — used consistently across the codebase
// ============================================================================
export const LogScope = {
  EXTENSION: "Ext",
  COMMAND: "Cmd",
  PROVIDER_MGR: "ProviderMgr",
  CHAT_PROVIDER: "Chat",
  LLM_SERVICE: "LLM",
  AI_REGISTRY: "AI",
  MSG_CONVERTER: "MsgConv",
  VIEW: "View",
  STORAGE: "Storage",
  CRYPTO: "Crypto",
  MODEL_TESTER: "Test",
  REMOTE_FETCHER: "Remote",
  TOOL: "Tool",
} as const;

// ============================================================================
// Secrets Masking
// ============================================================================
export function maskSecret(value: string | undefined | null): string | undefined {
  if (!value) {
    return value ?? undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return "***";
  }
  if (trimmed.length < 16) {
    const suffix = trimmed.slice(-4);
    return `***${suffix}`;
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}***${suffix}`;
}

// ============================================================================
// Trace ID — correlates logs across a single request flow
// ============================================================================
let _nextId = 1;
export function generateTraceId(): string {
  const id = _nextId++;
  return `#${id.toString(16).padStart(3, "0")}`;
}

// ============================================================================
// Logger
// ============================================================================
export class AddiLogger {
  private channel: vscode.LogOutputChannel | undefined;

  /**
   * Initialize the logger with the extension context.
   */
  initialize(context: vscode.ExtensionContext): void {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel("Addi", { log: true });
      context.subscriptions.push(this.channel);
    }
  }

  show(): void {
    this.channel?.show(true);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Log an error message.
   * @param message Main message
   * @param error Error object or metadata (optional)
   * @param scope Component scope constant from LogScope (optional)
   */
  error(message: string, error?: unknown, scope?: string): void {
    const formatted = this.formatMessage(message, scope);
    if (error instanceof Error) {
      this.getChannel().error(formatted, error);
    } else if (error !== undefined) {
      this.getChannel().error(formatted, error);
    } else {
      this.getChannel().error(formatted);
    }
  }

  warn(message: string, metadata?: unknown, scope?: string): void {
    this.log("warn", message, metadata, scope);
  }

  info(message: string, metadata?: unknown, scope?: string): void {
    this.log("info", message, metadata, scope);
  }

  debug(message: string, metadata?: unknown, scope?: string): void {
    this.log("debug", message, metadata, scope);
  }

  trace(message: string, metadata?: unknown, scope?: string): void {
    this.log("trace", message, metadata, scope);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private log(
    level: "warn" | "info" | "debug" | "trace",
    message: string,
    metadata?: unknown,
    scope?: string,
  ): void {
    const channel = this.getChannel();
    const formattedMessage = this.formatMessage(message, scope);

    if (metadata !== undefined) {
      channel[level](formattedMessage, metadata);
    } else {
      channel[level](formattedMessage);
    }
  }

  private formatMessage(message: string, scope?: string): string {
    return scope ? `[${scope}] ${message}` : message;
  }

  private getChannel(): vscode.LogOutputChannel {
    if (!this.channel) {
      // Graceful degradation: when running outside extension host (e.g. tests),
      // create a lightweight fallback so callers don't crash.
      this.channel = vscode.window.createOutputChannel("Addi", { log: true });
    }
    return this.channel;
  }

  // --------------------------------------------------------------------------
  // Sanitizers
  // --------------------------------------------------------------------------

  /**
   * Sanitize provider info for logging (masks API key).
   */
  sanitizeProvider(provider?: {
    id?: string;
    name?: string;
    apiEndpoint?: string | null;
    apiKey?: string | null;
    providerType?: string | null;
  }): Record<string, unknown> | undefined {
    if (!provider) {
      return undefined;
    }
    return {
      id: provider.id,
      name: provider.name,
      providerType: provider.providerType,
      apiEndpoint: provider.apiEndpoint,
      apiKey: maskSecret(provider.apiKey ?? undefined),
    };
  }

  /**
   * Sanitize model info for logging.
   */
  sanitizeModel(model?: {
    rid?: string;
    id?: string;
    name?: string;
    family?: string;
    version?: string;
  }): Record<string, unknown> | undefined {
    if (!model) {
      return undefined;
    }
    return {
      rid: model.rid,
      id: model.id,
      name: model.name,
      family: model.family,
      version: model.version,
    };
  }
}

export const logger = new AddiLogger();
