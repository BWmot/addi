import React, { useState, useEffect } from 'react';
import type { ProviderConfig, ProviderType } from '../types';
import { postMessage } from '../hooks/useVscode';

interface ProviderFormProps {
  data: ProviderConfig;
  mode: 'edit' | 'read';
  isBatchMode?: boolean;
  batchCount?: number;
}

export const ProviderForm: React.FC<ProviderFormProps> = ({ data, mode, isBatchMode, batchCount }) => {
  const [formData, setFormData] = useState<ProviderConfig>(data);

  // Sync when parent pushes new data
  useEffect(() => {
    setFormData(data);
  }, [data]);

  const handleChange = (field: keyof ProviderConfig, value: any) => {
    if (mode === 'read') return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    postMessage('saveProvider', {
      ...formData,
      isBatchMode
    });
  };

  const handleVerify = () => {
    // There was no verifyProvider in old code based on that snippet, but leaving for future
    postMessage('verifyProvider', formData);
  };

  const handleDelete = () => {
    // Old code might not have delete via webview, but let's keep it safe
    postMessage('deleteProvider', formData);
  };

  return (
    <div id="provider-form">
      <div className="header">
        <h2>{isBatchMode ? `Edit Multiple Providers (${batchCount})` : 'Provider Details'}</h2>
      </div>

      <div className="form-group">
        <label>Name</label>
        <input 
          type="text" 
          value={formData.name || ''} 
          onChange={e => handleChange('name', e.target.value)} 
          disabled={mode === 'read'}
        />
      </div>

      <div className="form-group">
        <label>API Type</label>
        <select 
          value={formData.providerType || 'openai-completions'} 
          onChange={e => handleChange('providerType', e.target.value as ProviderType)}
          disabled={mode === 'read'}
        >
          <option value="openai-completions">OpenAI (/completions)</option>
          <option value="openai-responses">OpenAI (/responses)</option>
          <option value="anthropic-messages">Anthropic (/messages)</option>
          <option value="google-generateContent">Google (/name:generateContent)</option>
          <option value="deepseek">DeepSeek / MiMo (Supports Reasoning)</option>
        </select>
      </div>

      <div className="form-group">
        <label>API Endpoint</label>
        <input 
          type="text" 
          value={formData.apiEndpoint || ''} 
          onChange={e => handleChange('apiEndpoint', e.target.value)}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>API Key (Saved Securely)</label>
        <input 
          type="text" 
          value={formData.apiKeyTouched ? (formData.apiKey || '') : (data.maskedApiKey || '')} 
          onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value, apiKeyTouched: true }))}
          placeholder="Enter API key"
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <input 
          type="text" 
          value={formData.description || ''} 
          onChange={e => handleChange('description', e.target.value)}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>Website</label>
        <input 
          type="text" 
          value={formData.website || ''} 
          onChange={e => handleChange('website', e.target.value)}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>Global Extra Body (JSON)</label>
        <textarea 
          value={formData.extraBody || ''} 
          onChange={e => handleChange('extraBody', e.target.value)}
          disabled={mode === 'read'}
          placeholder='{"key": "value"}'
          rows={5}
        />
      </div>

      {mode !== 'read' && (
        <div className="button-row">
          <button type="button" onClick={handleVerify} className="secondary-btn">Verify Connection</button>
          {!isBatchMode && <button type="button" onClick={handleDelete} className="secondary-btn" style={{color: 'var(--vscode-errorForeground)'}}>Delete</button>}
          <button type="button" onClick={handleSave}>Save</button>
        </div>
      )}
    </div>
  );
};
