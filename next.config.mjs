const mode = process.env.BUILD_MODE ?? "standalone";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: mode,
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    config.resolve.fallback = {
      child_process: false,
    };

    return config;
  },
  headers: async () => {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "*" },
          { key: "Access-Control-Allow-Headers", value: "*" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
    ];
  },
  rewrites: async () => {
    return {
      beforeFiles: [
        {
          source:
            "/api/proxy/azure/:resource_name/deployments/:deploy_name/:path*",
          destination:
            "https://:resource_name.openai.azure.com/openai/deployments/:deploy_name/:path*",
        },
        {
          source: "/api/proxy/google/:path*",
          destination: "https://generativelanguage.googleapis.com/:path*",
        },
        {
          source: "/api/proxy/openai/:path*",
          destination: "https://api.openai.com/:path*",
        },
        {
          source: "/api/proxy/anthropic/:path*",
          destination: "https://api.anthropic.com/:path*",
        },
        {
          source: "/google-fonts/:path*",
          destination: "https://fonts.googleapis.com/:path*",
        },
        {
          source: "/sharegpt",
          destination: "https://sharegpt.com/api/conversations",
        },
        {
          source: "/api/proxy/alibaba/:path*",
          destination: "https://dashscope.aliyuncs.com/api/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
