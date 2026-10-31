import type { NextConfig } from "next";

const mode = (process.env.BUILD_MODE as NextConfig["output"]) ?? "standalone";

const nextConfig: NextConfig = {
  agentRules: false,
  output: mode,
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
