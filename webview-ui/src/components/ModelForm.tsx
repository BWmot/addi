import React, { useState, useEffect } from 'react';
import type { ModelConfig } from '../types';
import { postMessage } from '../hooks/useVscode';

interface ModelFormProps {
  data: ModelConfig;
  mode: 'edit' | 'read';
  parentId?: string;
  isBatchMode?: boolean;
  batchCount?: number;
  parentProviderType?: string;
}

export const ModelForm: React.FC<ModelFormProps> = ({ data, mode, parentId, isBatchMode, batchCount, parentProviderType }) => {
  const [formData, setFormData] = useState<ModelConfig>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  // Determine provider type for conditional rendering
  const isOpenAI = parentProviderType === 'openai-completions' || parentProviderType === 'openai-responses';
  const isAnthropicOrGoogle = parentProviderType === 'anthropic-messages' || parentProviderType === 'google-generateContent';
  // Default to showing all fields when parentProviderType is unknown (edge case)
  const showReasoningEffort = !parentProviderType || isOpenAI;
  const showBudgetTokens = !parentProviderType || isAnthropicOrGoogle;

  const handleChange = (field: keyof ModelConfig, value: any) => {
    if (mode === 'read') return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCapabilityChange = (field: keyof ModelConfig['capabilities'], value: any) => {
    if (mode === 'read') return;
    setFormData(prev => ({
      ...prev,
      capabilities: { ...prev.capabilities, [field]: value }
    }));
  };

  const handleOptionChange = (field: keyof NonNullable<ModelConfig['options']>, value: any) => {
    if (mode === 'read') return;
    setFormData(prev => ({
      ...prev,
      options: { ...prev.options, [field]: value }
    }));
  };

  const handleSave = () => {
    postMessage('saveModel', {
      ...formData,
      parentId,
      isBatchMode
    });
  };

  const handleVerify = () => {
    postMessage('verifyModel', {
      ...formData,
      parentId
    }); // Needs parentId to know which provider to use
  };

  const handleDelete = () => {
    postMessage('deleteModel', {
      ...formData,
      parentId
    });
  };

  return (
    <div id="model-form">
      <div className="header">
        <h2>{isBatchMode ? `Edit Multiple Models (${batchCount})` : 'Model Details'}</h2>
      </div>

      <div className={`form-group${isBatchMode ? ' batch-disabled' : ''}`}>
        <label>Display Name</label>
        <input 
          type="text" 
          value={formData.name || ''} 
          onChange={e => handleChange('name', e.target.value)} 
          disabled={mode === 'read' || isBatchMode}
        />
      </div>

      <div className={`form-group${isBatchMode ? ' batch-disabled' : ''}`}>
        <label>Remote/API Model ID (e.g. gpt-4)</label>
        <input 
          type="text" 
          value={formData.rid || ''} 
          onChange={e => handleChange('rid', e.target.value)}
          disabled={mode === 'read' || isBatchMode} 
        />
      </div>

      <div className="form-group">
        <label>Max Input Tokens</label>
        <input 
          type="number" 
          value={formData.maxInputTokens || 0} 
          onChange={e => handleChange('maxInputTokens', parseInt(e.target.value))}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>Max Output Tokens</label>
        <input 
          type="number" 
          value={formData.maxOutputTokens || 0} 
          onChange={e => handleChange('maxOutputTokens', parseInt(e.target.value))}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>Capabilities</label>
        <div className="checkbox-group">
          <label className="checkbox-item">
            <input 
              type="checkbox" 
              checked={!!formData.capabilities?.toolCalling} 
              onChange={e => handleCapabilityChange('toolCalling', e.target.checked)}
              disabled={mode === 'read'}
            /> Tool
          </label>
          <label className="checkbox-item">
            <input 
              type="checkbox" 
              checked={!!formData.capabilities?.reasoning} 
              onChange={e => handleCapabilityChange('reasoning', e.target.checked)}
              disabled={mode === 'read'}
            /> Think
          </label>
          <label className="checkbox-item">
            <input 
              type="checkbox" 
              checked={!!formData.capabilities?.vision} 
              onChange={e => handleCapabilityChange('vision', e.target.checked)}
              disabled={mode === 'read'}
            /> Vision
          </label>
        </div>
      </div>

      <div className="form-group section">
        <div className="section-title">Settings & Overrides</div>
        <div className="form-group">
          <label>Temperature</label>
          <input 
            type="number"
            step="0.1" 
            value={formData.options?.temperature ?? ''} 
            onChange={e => handleOptionChange('temperature', parseFloat(e.target.value))}
            disabled={mode === 'read'} 
            placeholder="Default"
          />
        </div>

        {showReasoningEffort && (
          <div className="form-group">
            <label>OpenAI Reasoning Effort</label>
            <select
              value={formData.options?.reasoningEffort || ''}
              onChange={e => handleOptionChange('reasoningEffort', e.target.value || undefined)}
              disabled={mode === 'read'}
            >
              <option value="">Default/Not Applicable</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        )}

        {showBudgetTokens && (
          <div className="form-group">
            <label>Thinking Budget (Tokens)</label>
            <input 
              type="number" 
              value={formData.options?.budgetTokens ?? ''} 
              onChange={e => handleOptionChange('budgetTokens', parseInt(e.target.value) || undefined)}
              disabled={mode === 'read'} 
              placeholder="e.g. 1024"
            />
          </div>
        )}

        <div className="form-group">
          <label>Model Extra Body (JSON Override)</label>
          <textarea 
            value={formData.extraBody || ''} 
            onChange={e => handleChange('extraBody', e.target.value)}
            disabled={mode === 'read'}
            placeholder='{"key": "value"}'
            rows={4}
          />
        </div>
      </div>

      <div className="form-group section">
        <div className="section-title">🧪 Experimental Features</div>
        <div className="checkbox-group experimental-features">
          <div className="experimental-option">
            <label className="checkbox-item">
              <input 
                type="checkbox" 
                checked={!!formData.options?.reasoningContentInject}
                onChange={e => handleOptionChange('reasoningContentInject', e.target.checked || undefined)}
                disabled={mode === 'read'}
              /> Inject reasoning_content field (multi-turn backfill)
            </label>
            <div className="field-hint">
              For models using the reasoning_content API field (MiMo, etc.).
              Enables proper handling of multi-turn thinking context.
            </div>
          </div>
          <div className="experimental-option">
            <label className="checkbox-item">
              <input 
                type="checkbox" 
                checked={!!formData.options?.extractReasoningContent}
                onChange={e => handleOptionChange('extractReasoningContent', e.target.checked || undefined)}
                disabled={mode === 'read'}
              /> Extract reasoning from &lt;think&gt; tags
            </label>
            <div className="field-hint">
              Some models return thinking content inside &lt;think&gt; XML tags.
              Enables automatic extraction and display of thinking content.
            </div>
          </div>
        </div>
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
