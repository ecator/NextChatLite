import React, { useMemo, useState, useEffect } from "react";
import { useModelStore, ModelMetadata } from "@/store/models";
import { Modal } from "@/components/ui-lib";
import { IconButton } from "@/components/button";
import Locale from "@/locales";
import CloseIcon from "@/icons/close.svg";
import EyeIcon from "@/icons/eye.svg";
import BrainIcon from "@/icons/brain.svg";
import ToolIcon from "@/icons/plugin.svg";
import SearchIcon from "@/icons/zoom.svg";
import styles from "./model-selector.module.scss";

export interface ModelSelectorProps {
  currentModel?: string;
  currentProvider?: string;
  onSelect: (
    modelId: string,
    provider: string,
    modelMeta?: ModelMetadata,
  ) => void;
  onClose: () => void;
  title?: string;
}

export function ModelSelector(props: {
  currentModel?: string;
  currentProvider?: string;
  onSelect: (
    modelId: string,
    provider: string,
    modelMeta?: ModelMetadata,
  ) => void;
  onClose: () => void;
  title?: string;
}) {
  const modelStore = useModelStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");

  useEffect(() => {
    useModelStore.getState().fetchModels();
  }, []);

  const allModels = useMemo(() => {
    return modelStore.getAllModels();
  }, [modelStore]);

  const providers = useMemo(() => {
    const set = new Set<string>();
    allModels.forEach((m) => {
      if (m.provider) set.add(m.provider);
    });
    return Array.from(set).sort();
  }, [allModels]);

  const filteredModels = useMemo(() => {
    let list = allModels;
    if (selectedProvider !== "all") {
      list = list.filter(
        (m) =>
          (m.provider || "").toLowerCase() === selectedProvider.toLowerCase(),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.provider && m.provider.toLowerCase().includes(q)) ||
          (m.description && m.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [allModels, selectedProvider, searchQuery]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelMetadata[]> = {};
    filteredModels.forEach((model) => {
      const p = model.provider || "custom";
      if (!groups[p]) groups[p] = [];
      groups[p].push(model);
    });
    return groups;
  }, [filteredModels]);

  const formatTokens = (tokens: number) => {
    if (!tokens) return "0";
    if (tokens >= 1000000)
      return `${(tokens / 1000000).toFixed(tokens % 1000000 === 0 ? 0 : 1)}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}k`;
    return `${tokens}`;
  };

  const handleSelect = (model: ModelMetadata) => {
    props.onSelect(model.id, model.provider, model);
    props.onClose();
  };

  return (
    <Modal
      title={props.title || Locale.Settings.Model}
      onClose={props.onClose}
      actions={[
        <IconButton
          key="close"
          text={Locale.UI?.Close || "Close"}
          icon={<CloseIcon />}
          onClick={props.onClose}
          bordered
        />,
      ]}
    >
      <div className={styles["model-selector-container"]}>
        <div className={styles["model-search-bar"]}>
          <div className={styles["search-input-wrapper"]}>
            <SearchIcon className={styles["search-icon"]} />
            <input
              type="text"
              className={styles["search-input"]}
              placeholder={
                (Locale as any)?.Search?.Title ||
                "Search models by name, provider..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles["provider-filter-tabs"]}>
            <button
              className={`${styles["provider-tab"]} ${
                selectedProvider === "all" ? styles["active"] : ""
              }`}
              onClick={() => setSelectedProvider("all")}
            >
              All ({allModels.length})
            </button>
            {providers.map((p) => (
              <button
                key={p}
                className={`${styles["provider-tab"]} ${
                  selectedProvider === p ? styles["active"] : ""
                }`}
                onClick={() => setSelectedProvider(p)}
              >
                {p} ({allModels.filter((m) => m.provider === p).length})
              </button>
            ))}
          </div>
        </div>

        <div className={styles["model-list-wrapper"]}>
          {Object.keys(groupedModels).length === 0 ? (
            <div className={styles["no-results"]}>
              {(Locale as any)?.Search?.NoResult || "No matching models found"}
            </div>
          ) : (
            Object.entries(groupedModels).map(([providerName, models]) => (
              <div key={providerName} className={styles["provider-group"]}>
                <div className={styles["provider-header"]}>
                  <span className={styles["provider-name"]}>
                    {providerName}
                  </span>
                  <span className={styles["provider-count"]}>
                    {models.length} models
                  </span>
                </div>
                <div className={styles["model-grid"]}>
                  {models.map((m) => {
                    const isSelected =
                      (props.currentModel === m.id ||
                        props.currentModel === m.name) &&
                      (!props.currentProvider ||
                        props.currentProvider.toLowerCase() ===
                          (m.provider || "").toLowerCase());

                    return (
                      <div
                        key={`${m.provider}/${m.id}`}
                        className={`${styles["model-card"]} ${
                          isSelected ? styles["selected"] : ""
                        }`}
                        onClick={() => handleSelect(m)}
                      >
                        <div className={styles["model-card-header"]}>
                          <span className={styles["model-title"]}>
                            {m.name}
                          </span>
                          <span className={styles["model-id-badge"]}>
                            {m.id}
                          </span>
                        </div>

                        {m.description && (
                          <div className={styles["model-description"]}>
                            {m.description}
                          </div>
                        )}

                        <div className={styles["model-badges"]}>
                          {m.hasVision && (
                            <span
                              className={`${styles["badge"]} ${styles["vision-badge"]}`}
                            >
                              <EyeIcon className={styles["badge-icon"]} />{" "}
                              Vision
                            </span>
                          )}
                          {m.hasReasoning && (
                            <span
                              className={`${styles["badge"]} ${styles["reasoning-badge"]}`}
                            >
                              <BrainIcon className={styles["badge-icon"]} />{" "}
                              Reasoning
                              {m.reasoningType ? ` (${m.reasoningType})` : ""}
                            </span>
                          )}
                          {m.hasTools && (
                            <span
                              className={`${styles["badge"]} ${styles["tools-badge"]}`}
                            >
                              <ToolIcon className={styles["badge-icon"]} />{" "}
                              Tools
                            </span>
                          )}
                        </div>

                        <div className={styles["model-limits"]}>
                          <span className={styles["limit-item"]}>
                            <span className={styles["limit-label"]}>
                              Context:
                            </span>
                            <strong>{formatTokens(m.contextLimit)}</strong>
                          </span>
                          <span className={styles["limit-item"]}>
                            <span className={styles["limit-label"]}>
                              Max Output:
                            </span>
                            <strong>{formatTokens(m.outputLimit)}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ModelSelector;
