import React, { useState, useEffect } from "react";
import type { ProviderConfig, ProviderType } from "../types";
import { postMessage } from "../hooks/useVscode";
import { useLocale } from "../i18n";

interface ProviderFormProps {
  data: ProviderConfig;
  mode: "edit" | "read";
}

export const ProviderForm: React.FC<ProviderFormProps> = ({ data, mode }) => {
  const { t, tRaw } = useLocale();
  const [formData, setFormData] = useState<ProviderConfig>(data);

  // Sync when parent pushes new data
  useEffect(() => {
    setFormData(data);
  }, [data]);

  const isAnthropic = formData.providerType === "anthropic-messages";
  const isGoogle = formData.providerType === "google-generateContent";

  // Provider-specific labels
  const thinkingLabel =
    isAnthropic || isGoogle
      ? t("provider.thinkingLabel.anthropicGoogle")
      : t("provider.thinkingLabel.default");
  const thinkingHintMap = tRaw("provider.thinkingHintMap") as Record<string, string>;
  const thinkingHint = formData.providerType
    ? thinkingHintMap[formData.providerType] || t("provider.thinkingHint")
    : t("provider.thinkingHint");

  const handleChange = (field: keyof ProviderConfig, value: unknown) => {
    if (mode === "read") return;
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleOptionChange = (
    field: keyof NonNullable<ProviderConfig["options"]>,
    value: unknown,
  ) => {
    if (mode === "read") return;
    setFormData((prev) => ({
      ...prev,
      options: { ...prev.options, [field]: value },
    }));
  };

  const handleSave = () => {
    postMessage("saveProvider", formData);
  };

  const handleVerify = () => {
    // There was no verifyProvider in old code based on that snippet, but leaving for future
    postMessage("verifyProvider", formData);
  };

  const handleDelete = () => {
    // Old code might not have delete via webview, but let's keep it safe
    postMessage("deleteProvider", formData);
  };

  const apiTypeOptions = tRaw("provider.apiTypeOptions") as Record<string, string>;

  return (
    <div id="provider-form">
      <div className="header">
        <h2>{t("provider.title")}</h2>
      </div>

      <div className="form-group">
        <label>{t("provider.name")}</label>
        <input
          type="text"
          value={formData.name || ""}
          onChange={(e) => handleChange("name", e.target.value)}
          disabled={mode === "read"}
        />
      </div>

      <div className="form-group">
        <label>{t("provider.apiType")}</label>
        <select
          value={formData.providerType || "openai-completions"}
          onChange={(e) => handleChange("providerType", e.target.value as ProviderType)}
          disabled={mode === "read"}
        >
          <option value="openai-completions">{apiTypeOptions["openai-completions"]}</option>
          <option value="openai-responses">{apiTypeOptions["openai-responses"]}</option>
          <option value="anthropic-messages">{apiTypeOptions["anthropic-messages"]}</option>
          <option value="google-generateContent">{apiTypeOptions["google-generateContent"]}</option>
        </select>
      </div>

      <div className="form-group">
        <label>{t("provider.apiEndpoint")}</label>
        <input
          type="text"
          value={formData.apiEndpoint || ""}
          onChange={(e) => handleChange("apiEndpoint", e.target.value)}
          disabled={mode === "read"}
        />
      </div>

      <div className="form-group">
        <label>{t("provider.apiKey")}</label>
        <input
          type="password"
          value={formData.apiKeyTouched ? formData.apiKey || "" : ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, apiKey: e.target.value, apiKeyTouched: true }))
          }
          placeholder={data.maskedApiKey || t("provider.apiKeyPlaceholder")}
          disabled={mode === "read"}
        />
        <div className="field-hint">{t("provider.apiKeySavedSecurely")}</div>
      </div>

      <div className="form-group">
        <label>{t("provider.description")}</label>
        <input
          type="text"
          value={formData.description || ""}
          onChange={(e) => handleChange("description", e.target.value)}
          disabled={mode === "read"}
        />
      </div>

      <div className="form-group">
        <label>{t("provider.website")}</label>
        <input
          type="text"
          value={formData.website || ""}
          onChange={(e) => handleChange("website", e.target.value)}
          disabled={mode === "read"}
        />
      </div>

      <div className="form-group section">
        <div className="section-title">{t("provider.defaultModelSettings")}</div>
        <div className="section-desc">{t("provider.defaultModelSettingsDesc")}</div>

        <div className="form-group">
          <label>{t("provider.defaultTemperature")}</label>
          <input
            type="number"
            step="0.1"
            value={formData.options?.temperature ?? ""}
            onChange={(e) => handleOptionChange("temperature", parseFloat(e.target.value))}
            disabled={mode === "read"}
            placeholder={t("common.default")}
          />
        </div>

        <div className="form-group">
          <label>{thinkingLabel}</label>
          <select
            value={formData.options?.reasoningEffort || ""}
            onChange={(e) => handleOptionChange("reasoningEffort", e.target.value || undefined)}
            disabled={mode === "read"}
          >
            <option value="">{t("feedback.defaultNotApplicable")}</option>
            <option value="low">{t("feedback.low")}</option>
            <option value="medium">{t("feedback.medium")}</option>
            <option value="high">{t("feedback.high")}</option>
          </select>
          <div className="field-hint">{thinkingHint}</div>
        </div>

        {isAnthropic && (
          <div className="form-group">
            <label>{t("provider.budgetTokensLabel")}</label>
            <input
              type="number"
              value={formData.options?.budgetTokens ?? ""}
              onChange={(e) =>
                handleOptionChange("budgetTokens", parseInt(e.target.value) || undefined)
              }
              disabled={mode === "read"}
              placeholder={t("provider.budgetTokensPlaceholder")}
            />
            <div className="field-hint">{t("provider.budgetTokensHint")}</div>
          </div>
        )}
      </div>

      <div className="form-group section">
        <div className="section-title">{t("provider.experimental")}</div>
        <div className="section-desc">{t("provider.experimentalDesc")}</div>
        <div className="checkbox-group experimental-features">
          <div className="experimental-option">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={!!formData.options?.reasoningContentAdapt}
                onChange={(e) =>
                  handleOptionChange("reasoningContentAdapt", e.target.checked || undefined)
                }
                disabled={mode === "read"}
              />{" "}
              {t("provider.reasoningContentAdapt")}
            </label>
            <div className="field-hint">{t("provider.reasoningContentAdaptHint")}</div>
          </div>
          <div className="experimental-option">
            <label className="checkbox-item">
              <input
                type="checkbox"
                checked={!!formData.options?.extractReasoningContent}
                onChange={(e) =>
                  handleOptionChange("extractReasoningContent", e.target.checked || undefined)
                }
                disabled={mode === "read"}
              />{" "}
              {t("provider.extractReasoningContent")}
            </label>
            <div className="field-hint">{t("provider.extractReasoningContentHint")}</div>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label>{t("provider.globalExtraBody")}</label>
        <textarea
          value={formData.extraBody || ""}
          onChange={(e) => handleChange("extraBody", e.target.value)}
          disabled={mode === "read"}
          placeholder={t("provider.extraBodyPlaceholder")}
          rows={5}
        />
      </div>

      {mode !== "read" && (
        <div className="button-row">
          <button type="button" onClick={handleVerify} className="secondary-btn">
            {t("common.verifyConnection")}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="secondary-btn"
            style={{ color: "var(--vscode-errorForeground)" }}
          >
            {t("common.delete")}
          </button>
          <button type="button" onClick={handleSave}>
            {t("common.save")}
          </button>
        </div>
      )}
    </div>
  );
};
