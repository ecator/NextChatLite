import packageJson from "../../package.json";
import { DEFAULT_INPUT_TEMPLATE, DEFAULT_SYSTEM_TEMPLATE } from "../constant";
import { getDefaultModel } from "./server";

export const getBuildConfig = () => {
  if (typeof process === "undefined") {
    throw Error(
      "[Server Config] you are importing a nodejs-only module outside of nodejs",
    );
  }

  const buildMode = process.env.BUILD_MODE ?? "standalone";
  const isApp = false;
  const version = "v" + (packageJson.version || "3.0.0");

  return {
    version,
    buildMode,
    isApp,
    defaultModel: getDefaultModel(),
    template:
      process.env.NEXTCHATLITE_DEFAULT_INPUT_TEMPLATE ??
      process.env.DEFAULT_INPUT_TEMPLATE ??
      DEFAULT_INPUT_TEMPLATE,
    defaultSystemTemplate:
      process.env.NEXTCHATLITE_DEFAULT_SYSTEM_TEMPLATE ??
      DEFAULT_SYSTEM_TEMPLATE,
    title: process.env.NEXTCHATLITE_TITLE || "NextChatLite",
    subTitle: process.env.NEXTCHATLITE_SUBTITLE || "Your own AI assistant.",
    helpUrl: process.env.NEXTCHATLITE_HELP_URL?.trim() || undefined,
  };
};

export type BuildConfig = ReturnType<typeof getBuildConfig>;
