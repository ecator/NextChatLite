import { useModelStore, ModelMetadata } from "../store/models";

export class ParameterValidator {
  static validateTemperature(val: any): number {
    const num = Number(val);
    if (isNaN(num)) return 0.7; // default
    if (num < 0.0) return 0.0;
    if (num > 2.0) return 2.0;
    return num;
  }

  static isValidTemperature(temp: any): boolean {
    return (
      typeof temp === "number" && temp >= 0.0 && temp <= 2.0 && !isNaN(temp)
    );
  }

  static validateTopP(val: any): number {
    if (val === null || val === undefined) return 1.0;
    const num = Number(val);
    if (isNaN(num)) return 1.0; // default
    if (num < 0.0) return 0.0;
    if (num > 1.0) return 1.0;
    return num;
  }

  static validateMaxTokens(val: any, modelOutputLimit = 4096): number {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) return Math.min(2048, modelOutputLimit);
    return Math.min(num, modelOutputLimit);
  }

  static findModel(
    modelId: string,
    catalog?: Record<string, any> | ModelMetadata[] | any,
  ): any {
    if (catalog) {
      if (Array.isArray(catalog)) {
        return catalog.find(
          (m) =>
            m.id === modelId ||
            m.id?.toLowerCase() === modelId.toLowerCase() ||
            m.name === modelId ||
            m.name?.toLowerCase() === modelId.toLowerCase(),
        );
      } else if (typeof catalog === "object") {
        if (catalog[modelId]) return catalog[modelId];
        const values = Object.values(catalog);
        return values.find(
          (m: any) =>
            m.id === modelId ||
            m.id?.toLowerCase() === modelId.toLowerCase() ||
            m.name === modelId ||
            m.name?.toLowerCase() === modelId.toLowerCase(),
        );
      }
    }

    try {
      return useModelStore.getState().getModel(modelId);
    } catch {
      return undefined;
    }
  }

  static isImageUploadAllowed(
    modelId: string,
    catalog?: Record<string, any> | ModelMetadata[] | any,
  ): boolean {
    const match = ParameterValidator.findModel(modelId, catalog);
    if (!match) return false;
    if (
      Array.isArray(match.modalities?.input) &&
      match.modalities.input.some((m: string) =>
        ["image", "video", "audio", "pdf", "file"].includes(
          String(m).toLowerCase(),
        ),
      )
    ) {
      return true;
    }
    return Boolean(match.hasVision || match.attachment);
  }

  static isReasoningConfigEnabled(
    modelId: string,
    catalog?: Record<string, any> | ModelMetadata[] | any,
  ): boolean {
    const match = ParameterValidator.findModel(modelId, catalog);
    return match ? Boolean(match.hasReasoning) : false;
  }

  static clampMaxTokens(
    modelId: string,
    requestedTokens: number,
    catalog?: Record<string, any> | ModelMetadata[] | any,
  ): number {
    const match = ParameterValidator.findModel(modelId, catalog);
    const limit = match?.outputLimit ?? 4096;
    return Math.min(requestedTokens, limit);
  }

  static clampContextLimit(
    modelId: string,
    requestedContext: number,
    catalog?: Record<string, any> | ModelMetadata[] | any,
  ): number {
    const match = ParameterValidator.findModel(modelId, catalog);
    const limit = match?.contextLimit ?? 4096;
    return Math.min(requestedContext, limit);
  }

  static getModelLimits(
    modelId: string,
    catalog?: Record<string, any> | ModelMetadata[] | any,
  ) {
    const match = ParameterValidator.findModel(modelId, catalog);
    return {
      contextLimit: match?.contextLimit ?? 4096,
      outputLimit: match?.outputLimit ?? 4096,
      hasVision: match?.hasVision ?? false,
      hasReasoning: match?.hasReasoning ?? false,
      reasoningType: match?.reasoningType,
      supportsTemperature: match?.supportsTemperature ?? true,
      cost: match?.cost,
    };
  }

  static searchModels(query: string, list: string[]): string[] {
    const q = (query || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) => typeof m === "string" && m.toLowerCase().includes(q),
    );
  }
}

// Standalone functions for direct import
export const validateTemperature = ParameterValidator.isValidTemperature;
export const validateTemperatureValue = ParameterValidator.validateTemperature;
export const validateTopP = ParameterValidator.validateTopP;
export const validateMaxTokens = ParameterValidator.validateMaxTokens;
export const clampMaxTokens = ParameterValidator.clampMaxTokens;
export const clampContextLimit = ParameterValidator.clampContextLimit;
export const isImageUploadAllowed = ParameterValidator.isImageUploadAllowed;
export const isReasoningConfigEnabled =
  ParameterValidator.isReasoningConfigEnabled;
export const searchModels = ParameterValidator.searchModels;
