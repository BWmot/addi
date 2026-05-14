import { useEffect, useState } from 'react';

// Declare VSCode API type
interface VSCodeApi {
  postMessage(msg: Record<string, unknown>): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  function acquireVsCodeApi(): VSCodeApi;
}

// Singleton VS Code UI instance setup 
const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : {
  postMessage: (msg: any) => console.log('Mock postMessage:', msg),
  getState: () => ({}),
  setState: (state: any) => console.log('Mock setState:', state),
};

export function postMessage(type: string, payload?: any) {
  vscode.postMessage({ type, payload });
}

export function useVscodeMessage<T = any>(messageType: string) {
  const [payload, setPayload] = useState<T | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === messageType) {
        setPayload(message.payload || message); // Save the payload or entire message
      }
    };
    
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [messageType]);

  return payload;
}
