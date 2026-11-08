import { useEffect } from "react";
import { ServiceProvider } from "@/constant";
import { ModalConfigValidator, ModelConfig } from "../store";
import { useModelStore } from "../store/models";
import { ParameterValidator } from "../utils/model-limits";

import Locale from "../locales";
import { InputRange } from "./input-range";
import { ListItem, Select } from "./ui-lib";
import { useAllModels } from "../utils/hooks";
import { groupBy } from "lodash-es";
import styles from "./model-config.module.scss";
import { getModelProvider } from "../utils/model";

export function ModelConfigList(props: {
  modelConfig: ModelConfig;
  updateConfig: (updater: (config: ModelConfig) => void) => void;
}) {
  const allModels = useAllModels();
  const modelStore = useModelStore();

  const currentModelExists = allModels.some(
    (m) =>
      m.name.toLowerCase() === props.modelConfig.model.toLowerCase() ||
      `${m.provider?.id}/${m.name}`.toLowerCase() ===
        props.modelConfig.model.toLowerCase(),
  );
  const defaultModelItem = allModels.find((m) => m.isDefault) || allModels[0];
  const activeModel = currentModelExists
    ? props.modelConfig.model
    : defaultModelItem?.name || props.modelConfig.model;
  const activeProviderName = currentModelExists
    ? props.modelConfig?.providerName
    : (defaultModelItem?.provider?.providerName as ServiceProvider) ||
      props.modelConfig?.providerName;

  useEffect(() => {
    if (allModels.length === 0) return;
    if (!currentModelExists && defaultModelItem) {
      props.updateConfig((config) => {
        config.model = defaultModelItem.name as any;
        config.providerName = (defaultModelItem.provider?.providerName ||
          defaultModelItem.provider?.id) as ServiceProvider;
      });
    }
  }, [allModels, currentModelExists, defaultModelItem, props.updateConfig]);

  const currentModelMeta = modelStore.getModel(activeModel);

  const groupModels = groupBy(
    allModels.filter((v) => v.available),
    "provider.providerName",
  );
  const value = `${activeModel}@${activeProviderName}`;
  const compressModelValue = `${props.modelConfig.compressModel}@${props.modelConfig?.compressProviderName}`;

  const maxOutputLimit = currentModelMeta?.outputLimit || 512000;
  const maxContextLimit = currentModelMeta?.contextLimit || 128000;
  const supportsTemp = currentModelMeta?.supportsTemperature !== false;

  return (
    <>
      <ListItem title={Locale.Settings.Model}>
        <Select
          aria-label={Locale.Settings.Model}
          value={value}
          align="left"
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            const targetMeta = modelStore.getModel(model);
            props.updateConfig((config) => {
              config.model = ModalConfigValidator.model(model);
              config.providerName = providerName as ServiceProvider;
              if (
                targetMeta?.outputLimit &&
                config.max_tokens > targetMeta.outputLimit
              ) {
                config.max_tokens = targetMeta.outputLimit;
              }
            });
          }}
        >
          {Object.keys(groupModels).map((providerName, index) => (
            <optgroup label={providerName} key={index}>
              {groupModels[providerName].map((v, i) => {
                const meta = modelStore.getModel(v.name);
                const badges = [];
                if (meta?.hasVision) badges.push("👁️");
                if (meta?.hasReasoning) badges.push("🧠");
                const badgeStr =
                  badges.length > 0 ? ` [${badges.join("")}]` : "";
                return (
                  <option
                    value={`${v.name}@${v.provider?.providerName}`}
                    key={i}
                  >
                    {v.displayName}
                    {badgeStr}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </Select>
      </ListItem>
      {supportsTemp && (
        <ListItem
          title={Locale.Settings.Temperature.Title}
          subTitle={Locale.Settings.Temperature.SubTitle}
        >
          <InputRange
            aria={Locale.Settings.Temperature.Title}
            value={props.modelConfig.temperature?.toFixed(1)}
            min="0"
            max="1" // lets limit it to 0-1
            step="0.1"
            onChange={(e) => {
              props.updateConfig(
                (config) =>
                  (config.temperature = ModalConfigValidator.temperature(
                    e.currentTarget.valueAsNumber,
                  )),
              );
            }}
          ></InputRange>
        </ListItem>
      )}
      <ListItem
        title={Locale.Settings.TopP.Title}
        subTitle={Locale.Settings.TopP.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.TopP.Title}
          value={(props.modelConfig.top_p ?? 1).toFixed(1)}
          min="0"
          max="1"
          step="0.1"
          onChange={(e) => {
            props.updateConfig(
              (config) =>
                (config.top_p = ModalConfigValidator.top_p(
                  e.currentTarget.valueAsNumber,
                )),
            );
          }}
        ></InputRange>
      </ListItem>
      <ListItem
        title={Locale.Settings.MaxTokens.Title}
        subTitle={`${Locale.Settings.MaxTokens.SubTitle} (Max: ${maxOutputLimit})`}
      >
        <input
          aria-label={Locale.Settings.MaxTokens.Title}
          type="number"
          min={1024}
          max={maxOutputLimit}
          value={props.modelConfig.max_tokens}
          onChange={(e) => {
            const val = e.currentTarget.valueAsNumber;
            const clamped = ParameterValidator.validateMaxTokens(
              val,
              maxOutputLimit,
            );
            props.updateConfig((config) => (config.max_tokens = clamped));
          }}
        ></input>
      </ListItem>

      {currentModelMeta?.hasReasoning && (
        <>
          <ListItem
            title={Locale.Settings.IncludeThinking.Title}
            subTitle={Locale.Settings.IncludeThinking.SubTitle}
          >
            <input
              aria-label={Locale.Settings.IncludeThinking.Title}
              type="checkbox"
              checked={props.modelConfig.includeThinking ?? true}
              onChange={(e) =>
                props.updateConfig(
                  (config) =>
                    (config.includeThinking = e.currentTarget.checked),
                )
              }
            ></input>
          </ListItem>
          {currentModelMeta.reasoningType === "budget" ? (
            <ListItem
              title={Locale.Settings.ThinkingBudget.Title}
              subTitle={Locale.Settings.ThinkingBudget.SubTitle}
            >
              <input
                aria-label={Locale.Settings.ThinkingBudget.Title}
                type="number"
                min={0}
                max={65536}
                value={props.modelConfig.thinkingBudget ?? 0}
                onChange={(e) => {
                  const val = e.currentTarget.valueAsNumber;
                  props.updateConfig((config) => {
                    config.thinkingBudget =
                      isNaN(val) || val <= 0 ? undefined : Math.min(val, 65536);
                  });
                }}
              />
            </ListItem>
          ) : (
            <ListItem
              title={Locale.Settings.ThinkingLevel.Title}
              subTitle={Locale.Settings.ThinkingLevel.SubTitle}
            >
              <Select
                aria-label={Locale.Settings.ThinkingLevel.Title}
                value={props.modelConfig.thinkingLevel ?? "default"}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  props.updateConfig((config) => {
                    config.thinkingLevel =
                      val === "default" ? undefined : (val as any);
                  });
                }}
              >
                <option value="default">
                  {Locale.Settings.ThinkingLevel.Auto}
                </option>
                <option value="minimal">
                  {Locale.Settings.ThinkingLevel.Minimal}
                </option>
                <option value="low">{Locale.Settings.ThinkingLevel.Low}</option>
                <option value="medium">
                  {Locale.Settings.ThinkingLevel.Medium}
                </option>
                <option value="high">
                  {Locale.Settings.ThinkingLevel.High}
                </option>
              </Select>
            </ListItem>
          )}
        </>
      )}

      {props.modelConfig?.providerName == ServiceProvider.Google ? null : (
        <>
          <ListItem
            title={Locale.Settings.PresencePenalty.Title}
            subTitle={Locale.Settings.PresencePenalty.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.PresencePenalty.Title}
              value={props.modelConfig.presence_penalty?.toFixed(1)}
              min="-2"
              max="2"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.presence_penalty =
                      ModalConfigValidator.presence_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>

          <ListItem
            title={Locale.Settings.FrequencyPenalty.Title}
            subTitle={Locale.Settings.FrequencyPenalty.SubTitle}
          >
            <InputRange
              aria={Locale.Settings.FrequencyPenalty.Title}
              value={props.modelConfig.frequency_penalty?.toFixed(1)}
              min="-2"
              max="2"
              step="0.1"
              onChange={(e) => {
                props.updateConfig(
                  (config) =>
                    (config.frequency_penalty =
                      ModalConfigValidator.frequency_penalty(
                        e.currentTarget.valueAsNumber,
                      )),
                );
              }}
            ></InputRange>
          </ListItem>
        </>
      )}

      <ListItem
        title={Locale.Settings.InjectSystemPrompts.Title}
        subTitle={Locale.Settings.InjectSystemPrompts.SubTitle}
      >
        <input
          aria-label={Locale.Settings.InjectSystemPrompts.Title}
          type="checkbox"
          checked={props.modelConfig.enableInjectSystemPrompts}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.enableInjectSystemPrompts = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>

      <ListItem
        title={Locale.Settings.InputTemplate.Title}
        subTitle={Locale.Settings.InputTemplate.SubTitle}
      >
        <input
          aria-label={Locale.Settings.InputTemplate.Title}
          type="text"
          value={props.modelConfig.template}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.template = e.currentTarget.value),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.HistoryCount.Title}
        subTitle={Locale.Settings.HistoryCount.SubTitle}
      >
        <InputRange
          aria={Locale.Settings.HistoryCount.Title}
          title={props.modelConfig.historyMessageCount.toString()}
          value={props.modelConfig.historyMessageCount}
          min="0"
          max="64"
          step="1"
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.historyMessageCount = e.target.valueAsNumber),
            )
          }
        ></InputRange>
      </ListItem>

      <ListItem
        title={Locale.Settings.CompressThreshold.Title}
        subTitle={`${Locale.Settings.CompressThreshold.SubTitle} (Max: ${Math.min(maxContextLimit, 1000000)})`}
      >
        <input
          aria-label={Locale.Settings.CompressThreshold.Title}
          type="number"
          min={500}
          max={Math.min(maxContextLimit, 1000000)}
          value={props.modelConfig.compressMessageLengthThreshold}
          onChange={(e) =>
            props.updateConfig(
              (config) =>
                (config.compressMessageLengthThreshold = Math.min(
                  e.currentTarget.valueAsNumber,
                  maxContextLimit,
                )),
            )
          }
        ></input>
      </ListItem>
      <ListItem title={Locale.Memory.Title} subTitle={Locale.Memory.Send}>
        <input
          aria-label={Locale.Memory.Title}
          type="checkbox"
          checked={props.modelConfig.sendMemory}
          onChange={(e) =>
            props.updateConfig(
              (config) => (config.sendMemory = e.currentTarget.checked),
            )
          }
        ></input>
      </ListItem>
      <ListItem
        title={Locale.Settings.CompressModel.Title}
        subTitle={Locale.Settings.CompressModel.SubTitle}
      >
        <Select
          className={styles["select-compress-model"]}
          aria-label={Locale.Settings.CompressModel.Title}
          value={compressModelValue}
          onChange={(e) => {
            const [model, providerName] = getModelProvider(
              e.currentTarget.value,
            );
            props.updateConfig((config) => {
              config.compressModel = ModalConfigValidator.model(model);
              config.compressProviderName = providerName as ServiceProvider;
            });
          }}
        >
          {allModels
            .filter((v) => v.available)
            .map((v, i) => (
              <option value={`${v.name}@${v.provider?.providerName}`} key={i}>
                {v.displayName}({v.provider?.providerName})
              </option>
            ))}
        </Select>
      </ListItem>
    </>
  );
}
