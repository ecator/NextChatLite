import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { useModelStore } from "../store/models";
import { collectModelsWithDefaultModel, getModelProvider } from "./model";

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
          isDefault: false,
        });
      }
    }

    const all = [...extraModels, ...baseModels];

    const rawDefault = accessStore.defaultModel?.trim() || "";
    if (rawDefault) {
      const [targetModel, targetProvider] = getModelProvider(rawDefault);
      const match = all.find((m) => {
        const nameMatch =
          m.name.toLowerCase() === targetModel.toLowerCase() ||
          `${m.provider?.id}/${m.name}`.toLowerCase() ===
            rawDefault.toLowerCase();
        const providerMatch =
          !targetProvider ||
          m.provider?.id?.toLowerCase() === targetProvider.toLowerCase() ||
          m.provider?.providerName?.toLowerCase() ===
            targetProvider.toLowerCase();
        return nameMatch && providerMatch;
      });
      if (match) {
        all.forEach((m) => (m.isDefault = false));
        match.isDefault = true;
      }
    }

    if (!all.some((m) => m.isDefault && m.available)) {
      const firstAvailable = all.find((m) => m.available);
      if (firstAvailable) {
        firstAvailable.isDefault = true;
      }
    }

    return all;
  }, [
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
    modelStore,
  ]);

  return models;
}
