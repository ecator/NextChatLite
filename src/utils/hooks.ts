import { useMemo } from "react";
import { useAccessStore } from "../store";
import { useModelStore } from "../store/models";
import { getModelProvider } from "./model";

export function useAllModels() {
  const accessStore = useAccessStore();
  const modelStore = useModelStore();

  const models = useMemo(() => {
    // Frontend model selection only presents models present in /providers.json
    const catalogModels = modelStore.getAllModels();

    const all = catalogModels.map((cm, idx) => ({
      name: cm.id,
      displayName: cm.name || cm.id,
      available: true,
      sorted: idx,
      provider: {
        id: cm.provider,
        providerName: cm.providerName || cm.provider,
        providerType: cm.provider,
        sorted: 1,
      },
      isDefault: false,
    }));

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
  }, [accessStore.defaultModel, modelStore.models]);

  return models;
}
