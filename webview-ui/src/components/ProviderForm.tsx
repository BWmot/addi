import React, { useState, useEffect } from 'react';
import type { ProviderConfig, ProviderType } from '../types';
import { postMessage } from '../hooks/useVscode';

interface ProviderFormProps {
  data: ProviderConfig;
  mode: 'edit' | 'read';
}

export const ProviderForm: React.FC<ProviderFormProps> = ({ data, mode }) => {
  const [formData, setFormData] = useState<ProviderConfig>(data);

  // Sync when parent pushes new data
  useEffect(() => {
    setFormData(data);
  }, [data]);

  const isAnthropic = formData.providerType === 'anthropic-messages';
  const isGoogle = formData.providerType === 'google-generateContent';

  // Provider-specific labels
  const thinkingLabel = isAnthropic || isGoogle ? 'Default Thinking Level' : 'Default Reasoning Effort';
  const thinkingHintMap: Record<string, string> = {
    'openai-responses': 'OpenAI (Responses API): maps to reasoningEffort parameter.',
    'openai-completions': 'OpenAI-compatible (DeepSeek, MiMo, etc.): passed as reasoning effort.',
    'anthropic-messages': 'Anthropic: Low→1024, Medium→4096, High→8192 budget tokens.',
    'google-generateContent': 'Google: maps to thinkingConfig.thinkingLevel.',
  };
  const thinkingHint = formData.providerType
    ? thinkingHintMap[formData.providerType] || 'Controls the default thinking/reasoning effort for all models.'
    : 'Controls the default thinking/reasoning effort for all models.';

  const handleChange = (field: keyof ProviderConfig, value: any) => {
    if (mode === 'read') return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleOptionChange = (field: keyof NonNullable<ProviderConfig['options']>, value: any) => {
    if (mode === 'read') return;
    setFormData(prev => ({
      ...prev,
      options: { ...prev.options, [field]: value }
    }));
  };

  const handleSave = () => {
    postMessage('saveProvider', formData);
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
        <h2>Provider Details</h2>
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
          type="password" 
          value={formData.apiKeyTouched ? (formData.apiKey || '') : ''}
          onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value, apiKeyTouched: true }))}
          placeholder={data.maskedApiKey || 'Enter API key'}
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

      <div className="form-group section">
        <div className="section-title">Default Model Settings (applied to all models)</div>

        <div className="form-group">
          <label>Default Temperature</label>
          <input
            type="number"
            step="0.1"
            value={formData.options?.temperature ?? ''}
            onChange={e => handleOptionChange('temperature', parseFloat(e.target.value))}
            disabled={mode === 'read'}
            placeholder="Default"
          />
        </div>

        <div className="form-group">
          <label>{thinkingLabel}</label>
          <select
            value={formData.options?.reasoningEffort || ''}
            onChange={e => handleOptionChange('reasoningEffort', e.target.value || undefined)}
            disabled={mode === 'read'}
          >
            <option value="">Default / Not Applicable</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <div className="field-hint">{thinkingHint}</div>
        </div>

        {isAnthropic && (
          <div className="form-group">
            <label>Default Thinking Budget (Tokens) Override</label>
            <input
              type="number"
              value={formData.options?.budgetTokens ?? ''}
              onChange={e => handleOptionChange('budgetTokens', parseInt(e.target.value) || undefined)}
              disabled={mode === 'read'}
              placeholder="e.g. 4096 — overrides the level-based mapping"
            />
            <div className="field-hint">
              Anthropic: set a specific budgetTokens value (e.g. 1024, 4096, 8192).
              Leave empty to use the level-based mapping from <strong>Default Thinking Level</strong> above.
            </div>
          </div>
        )}
      </div>

      <div className="form-group section">
        <div className="section-title">🧪 Experimental Features (applied to all models)</div>
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
          <button type="button" onClick={handleDelete} className="secondary-btn" style={{color: 'var(--vscode-errorForeground)'}}>Delete</button>
          <button type="button" onClick={handleSave}>Save</button>
        </div>
      )}
    </div>
  );
};
