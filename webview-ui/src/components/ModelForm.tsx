import React, { useState, useEffect } from 'react';
import type { ModelConfig } from '../types';
import { postMessage } from '../hooks/useVscode';
import { useLocale } from '../i18n';

interface ModelFormProps {
  data: ModelConfig;
  mode: 'edit' | 'read';
  parentId?: string;
  isBatchMode?: boolean;
  batchCount?: number;
  parentProviderType?: string;
}

export const ModelForm: React.FC<ModelFormProps> = ({ data, mode, parentId, isBatchMode, batchCount, parentProviderType }) => {
  const { t, tRaw } = useLocale();
  const [formData, setFormData] = useState<ModelConfig>(data);

  useEffect(() => {
    setFormData(data);
  }, [data]);

  // Determine provider type for conditional rendering
  const isAnthropic = parentProviderType === 'anthropic-messages';
  const isGoogle = parentProviderType === 'google-generateContent';

  // --- Provider-specific thinking labels & hints ---
  const thinkingLabel = isAnthropic || isGoogle
    ? t('model.thinkingLabel.anthropicGoogle')
    : t('model.thinkingLabel.default');
  const thinkingHintMap = tRaw('model.thinkingHintMap') as Record<string, string>;
  const thinkingHint = parentProviderType
    ? thinkingHintMap[parentProviderType] || t('model.thinkingHint')
    : t('model.thinkingHint');

  const handleChange = (field: keyof ModelConfig, value: unknown) => {
    if (mode === 'read') return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCapabilityChange = (field: keyof ModelConfig['capabilities'], value: unknown) => {
    if (mode === 'read') return;
    setFormData(prev => ({
      ...prev,
      capabilities: { ...prev.capabilities, [field]: value }
    }));
  };

  const handleOptionChange = (field: keyof NonNullable<ModelConfig['options']>, value: unknown) => {
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
        <h2>{isBatchMode ? t('model.titleBatch', { count: batchCount ?? 0 }) : t('model.title')}</h2>
      </div>

      <div className={`form-group${isBatchMode ? ' batch-disabled' : ''}`}>
        <label>{t('model.displayName')}</label>
        <input 
          type="text" 
          value={formData.name || ''} 
          onChange={e => handleChange('name', e.target.value)} 
          disabled={mode === 'read' || isBatchMode}
        />
        {isBatchMode && <div className="field-hint">{t('model.batchDisabled')}</div>}
      </div>

      <div className={`form-group${isBatchMode ? ' batch-disabled' : ''}`}>
        <label>{t('model.remoteModelId')}</label>
        <input 
          type="text" 
          value={formData.rid || ''} 
          onChange={e => handleChange('rid', e.target.value)}
          disabled={mode === 'read' || isBatchMode}
          placeholder={t('model.remoteModelIdPlaceholder')}
        />
        {isBatchMode && <div className="field-hint">{t('model.batchDisabled')}</div>}
      </div>

      <div className="form-group">
        <label>{t('model.maxInputTokens')}</label>
        <input 
          type="number" 
          value={formData.maxInputTokens || 0} 
          onChange={e => handleChange('maxInputTokens', parseInt(e.target.value))}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>{t('model.maxOutputTokens')}</label>
        <input 
          type="number" 
          value={formData.maxOutputTokens || 0} 
          onChange={e => handleChange('maxOutputTokens', parseInt(e.target.value))}
          disabled={mode === 'read'} 
        />
      </div>

      <div className="form-group">
        <label>{t('model.capabilities')}</label>
        <div className="checkbox-group">
          <label className="checkbox-item">
            <input 
              type="checkbox" 
              checked={!!formData.capabilities?.toolCalling} 
              onChange={e => handleCapabilityChange('toolCalling', e.target.checked)}
              disabled={mode === 'read'}
            /> {t('model.toolCalling')}
          </label>
          <label className="checkbox-item">
            <input 
              type="checkbox" 
              checked={!!formData.capabilities?.reasoning} 
              onChange={e => handleCapabilityChange('reasoning', e.target.checked)}
              disabled={mode === 'read'}
            /> {t('model.thinking')}
          </label>
          <label className="checkbox-item">
            <input 
              type="checkbox" 
              checked={!!formData.capabilities?.vision} 
              onChange={e => handleCapabilityChange('vision', e.target.checked)}
              disabled={mode === 'read'}
            /> {t('model.vision')}
          </label>
        </div>
      </div>

      <div className="form-group section">
        <div className="section-title">{t('model.settingsOverrides')}</div>
        <div className="section-desc">{t('model.settingsOverridesDesc')}</div>
        <div className="form-group">
          <label>{t('model.temperature')}</label>
          <input 
            type="number"
            step="0.1" 
            value={formData.options?.temperature ?? ''} 
            onChange={e => handleOptionChange('temperature', parseFloat(e.target.value))}
            disabled={mode === 'read'} 
            placeholder={t('common.default')}
          />
        </div>

        {/* Unified thinking/reasoning dropdown - label adapts to provider */}
        <div className="form-group">
          <label>{thinkingLabel}</label>
          <select
            value={formData.options?.reasoningEffort || ''}
            onChange={e => handleOptionChange('reasoningEffort', e.target.value || undefined)}
            disabled={mode === 'read'}
          >
            <option value="">{t('feedback.defaultNotApplicable')}</option>
            <option value="low">{t('feedback.low')}</option>
            <option value="medium">{t('feedback.medium')}</option>
            <option value="high">{t('feedback.high')}</option>
          </select>
          <div className="field-hint">{thinkingHint}</div>
        </div>

        {/* Anthropic-specific: budget tokens override */}
        {isAnthropic && (
          <div className="form-group">
            <label>{t('model.budgetTokensLabel')}</label>
            <input 
              type="number" 
              value={formData.options?.budgetTokens ?? ''} 
              onChange={e => handleOptionChange('budgetTokens', parseInt(e.target.value) || undefined)}
              disabled={mode === 'read'} 
              placeholder={t('model.budgetTokensPlaceholder')}
            />
            <div className="field-hint">{t('model.budgetTokensHint')}</div>
          </div>
        )}

        <div className="form-group">
          <label>{t('model.extraBody')}</label>
          <textarea 
            value={formData.extraBody || ''} 
            onChange={e => handleChange('extraBody', e.target.value)}
            disabled={mode === 'read'}
            placeholder={t('model.extraBodyPlaceholder')}
            rows={4}
          />
        </div>
      </div>

      <div className="form-group section">
        <div className="section-title">{t('model.experimental')}</div>
        <div className="section-desc">{t('model.experimentalDesc')}</div>
        <div className="checkbox-group experimental-features">
          <div className="experimental-option">
            <label className="checkbox-item">
              <input 
                type="checkbox" 
                checked={!!formData.options?.reasoningContentInject}
                onChange={e => handleOptionChange('reasoningContentInject', e.target.checked || undefined)}
                disabled={mode === 'read'}
              /> {t('model.reasoningContentInject')}
            </label>
            <div className="field-hint">{t('model.reasoningContentInjectHint')}</div>
          </div>
          <div className="experimental-option">
            <label className="checkbox-item">
              <input 
                type="checkbox" 
                checked={!!formData.options?.extractReasoningContent}
                onChange={e => handleOptionChange('extractReasoningContent', e.target.checked || undefined)}
                disabled={mode === 'read'}
              /> {t('model.extractReasoningContent')}
            </label>
            <div className="field-hint">{t('model.extractReasoningContentHint')}</div>
          </div>
        </div>
      </div>

      {mode !== 'read' && (
        <div className="button-row">
          <button type="button" onClick={handleVerify} className="secondary-btn">{t('common.verifyConnection')}</button>
          {!isBatchMode && <button type="button" onClick={handleDelete} className="secondary-btn" style={{color: 'var(--vscode-errorForeground)'}}>{t('common.delete')}</button>}
          <button type="button" onClick={handleSave}>{t('common.save')}</button>
        </div>
      )}
    </div>
  );
};
