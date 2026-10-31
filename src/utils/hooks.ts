import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { useModelStore } from "../store/models";
import { collectModelsWithDefaultModel } from "./model";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const modelStore = useModelStore();

  const models = useMemo(() => {
    const baseModels = collectModelsWithDefaultModel(
      configStore.models,
      configStore.customModels,
      accessStore.defaultModel,
    );

    const catalogModels = modelStore.getAllModels();
    const existing = new Set(
      baseModels.map((m) => `${m.name}@${m.provider?.id}`),
    );

    const extraModels = [];
    for (const cm of catalogModels) {
      const key = `${cm.id}@${cm.provider}`;
      if (!existing.has(key)) {
        existing.add(key);
        extraModels.push({
          name: cm.id,
          displayName: cm.name || cm.id,
          available: true,
          sorted: 10,
          provider: {
            id: cm.provider,
            providerName: cm.providerName || cm.provider,
            providerType: cm.provider,
            sorted: 1,
          },
        });
      }
    }

    return [...extraModels, ...baseModels];
  }, [
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
    modelStore,
  ]);

  return models;
}
