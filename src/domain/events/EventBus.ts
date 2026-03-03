import { Disposable } from 'vscode';

/**
 * Simple Event Bus for Domain Events
 *
 * Provides in-memory event publication/subscription.
 * Use for decoupling modules within the extension.
 */
export class EventBus {
  private handlers: Map<string, Set<Function>> = new Map();

  /**
   * Subscribe to an event
   */
  on(event: string, handler: Function): Disposable {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    return {
      dispose: () => {
        this.handlers.get(event)?.delete(handler);
      },
    };
  }

  /**
   * Emit an event with optional data
   */
  emit(event: string, data?: unknown): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for "${event}":`, error);
      }
    });
  }

  /**
   * Check if there are handlers for an event
   */
  hasListeners(event: string): boolean {
    return (this.handlers.get(event)?.size ?? 0) > 0;
  }

  /**
   * Remove all handlers
   */
  clear(): void {
    this.handlers.clear();
  }
}

// Singleton instance for global use
export const eventBus = new EventBus();
