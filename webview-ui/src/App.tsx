import React, { useEffect } from 'react';
import { useVscodeMessage, postMessage } from './hooks/useVscode';
import { ProviderForm } from './components/ProviderForm';
import { ModelForm } from './components/ModelForm';
import './index.css';

export const App: React.FC = () => {
  const updatePayload = useVscodeMessage('update');

  useEffect(() => {
    postMessage('ready');
  }, []);

  if (!updatePayload) {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', opacity: 0.5 }}>
        <p>Please select an item in the tree view to edit.</p>
      </div>
    );
  }

  const { item, mode } = updatePayload as any;

  if (!item || !item.data) {
    return null;
  }

  return (
    <div className="container" style={{ display: 'flex', gap: '20px' }}>
      <div className="left-col" style={{ flex: 1, minWidth: '300px' }}>
        {item.type === 'provider' && !item.isBatchMode && (
          <ProviderForm data={item.data} mode={mode} />
        )}
        {item.type === 'model' && (
          <ModelForm data={item.data} mode={mode} parentId={item.parentId} isBatchMode={item.isBatchMode} batchCount={item.batchCount} parentProviderType={item.data.parentProviderType} />
        )}
      </div>
    </div>
  );
};

export default App;
