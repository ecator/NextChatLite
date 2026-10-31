import { tool, jsonSchema, Tool } from "ai";
import yaml from "js-yaml";

export interface PluginToolSpec {
  id?: string;
  title?: string;
  version?: string;
  content: string;
  authType?: string;
  authLocation?: string;
  authHeader?: string;
  authToken?: string;
}

export function sanitizeToolArguments(rawArgs: any): Record<string, any> {
  if (!rawArgs || typeof rawArgs !== "object") return {};
  return rawArgs;
}

export function handleToolExecutionError(
  toolName: string,
  err: any,
): { isError: boolean; result: string } {
  const errorMsg = err?.message || String(err) || "Unknown tool error";
  return {
    isError: true,
    result: `Tool '${toolName}' execution failed: ${errorMsg}`,
  };
}

export function clampToolResultSize(result: any, maxChars = 100_000): any {
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length > maxChars) {
    return str.slice(0, maxChars) + "\n...[TRUNCATED_DUE_TO_SIZE]";
  }
  return result;
}

export const clampToolOutput = clampToolResultSize;
export const sanitizeToolArgs = sanitizeToolArguments;

export function convertOpenApiSpecToAiTools(
  specInput: any,
  pluginAuth?: {
    authType?: string;
    authLocation?: string;
    authHeader?: string;
    authToken?: string;
  },
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};
  if (!specInput) return tools;

  let spec: any;
  if (typeof specInput === "string") {
    try {
      spec = yaml.load(specInput);
    } catch {
      try {
        spec = JSON.parse(specInput);
      } catch {
        return tools;
      }
    }
  } else {
    spec = specInput;
  }

  if (!spec || typeof spec !== "object") return tools;

  const serverUrl = spec.servers?.[0]?.url || "";
  const paths = spec.paths || {};

  for (const [pathKey, methods] of Object.entries<any>(paths)) {
    if (!methods || typeof methods !== "object") continue;

    for (const [method, op] of Object.entries<any>(methods)) {
      if (!op || typeof op !== "object") continue;

      const operationId =
        op.operationId ||
        `${method}_${pathKey.replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(0, 64);
      const properties: Record<string, any> = {};
      const required: string[] = [];

      // Query and path parameters
      if (Array.isArray(op.parameters)) {
        for (const param of op.parameters) {
          if (!param || !param.name) continue;
          properties[param.name] = {
            type: param.schema?.type || "string",
            description: param.description || "",
            ...(param.schema?.enum ? { enum: param.schema.enum } : {}),
            ...(param.schema?.default !== undefined
              ? { default: param.schema.default }
              : {}),
          };
          if (param.required) {
            required.push(param.name);
          }
        }
      }

      // Request body schema
      if (op.requestBody?.content?.["application/json"]?.schema) {
        const bodySchema = op.requestBody.content["application/json"].schema;
        if (bodySchema.properties) {
          for (const [propName, propDef] of Object.entries<any>(
            bodySchema.properties,
          )) {
            properties[propName] = propDef;
          }
        }
        if (Array.isArray(bodySchema.required)) {
          for (const req of bodySchema.required) {
            if (!required.includes(req)) required.push(req);
          }
        }
      }

      const description =
        op.summary || op.description || `${method.toUpperCase()} ${pathKey}`;

      tools[operationId] = tool({
        description,
        parameters: jsonSchema({
          type: "object",
          properties,
          required,
        }),
        execute: async (rawArgs: any) => {
          const sanitizedArgs = sanitizeToolArguments(rawArgs);
          try {
            let finalPath = pathKey;
            const queryParams = new URLSearchParams();
            const bodyObj: Record<string, any> = {};

            if (Array.isArray(op.parameters)) {
              for (const p of op.parameters) {
                const val = sanitizedArgs[p.name];
                if (val !== undefined && val !== null) {
                  if (p.in === "path") {
                    finalPath = finalPath.replace(
                      `{${p.name}}`,
                      encodeURIComponent(String(val)),
                    );
                  } else if (p.in === "query") {
                    queryParams.set(p.name, String(val));
                  }
                }
              }
            }

            if (method.toLowerCase() !== "get") {
              for (const [k, v] of Object.entries(sanitizedArgs)) {
                if (
                  !op.parameters?.some(
                    (p: any) => p.name === k && p.in === "path",
                  )
                ) {
                  bodyObj[k] = v;
                }
              }
            }

            const queryString = queryParams.toString();
            const targetUrl = `${serverUrl.replace(/\/+$/, "")}${finalPath.startsWith("/") ? "" : "/"}${finalPath}${queryString ? `?${queryString}` : ""}`;

            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };

            if (pluginAuth?.authToken) {
              const headerName =
                pluginAuth.authType === "custom" && pluginAuth.authHeader
                  ? pluginAuth.authHeader
                  : "Authorization";
              const tokenVal =
                pluginAuth.authType === "basic"
                  ? `Basic ${pluginAuth.authToken}`
                  : pluginAuth.authType === "bearer"
                    ? `Bearer ${pluginAuth.authToken}`
                    : pluginAuth.authToken;
              headers[headerName] = tokenVal;
            }

            const fetchOptions: RequestInit = {
              method: method.toUpperCase(),
              headers,
              ...(method.toLowerCase() !== "get" &&
              Object.keys(bodyObj).length > 0
                ? { body: JSON.stringify(bodyObj) }
                : {}),
            };

            const res = await fetch(targetUrl, fetchOptions);
            if (!res.ok) {
              return handleToolExecutionError(
                operationId,
                new Error(`HTTP ${res.status}: ${await res.text()}`),
              );
            }

            const contentType = res.headers.get("content-type") || "";
            let resultData: any;
            if (contentType.includes("application/json")) {
              resultData = await res.json();
            } else {
              resultData = await res.text();
            }

            return clampToolResultSize(resultData, 100_000);
          } catch (err: any) {
            return handleToolExecutionError(operationId, err);
          }
        },
      });
    }
  }

  return tools;
}

export function convertOpenApiToAiTools(
  pluginIds?: string[],
  customPlugins?: PluginToolSpec[],
): Record<string, Tool> {
  if (
    (!pluginIds || pluginIds.length === 0) &&
    (!customPlugins || customPlugins.length === 0)
  ) {
    return {};
  }

  const tools: Record<string, Tool> = {};

  if (customPlugins && customPlugins.length > 0) {
    for (const plugin of customPlugins) {
      if (plugin && plugin.content) {
        const converted = convertOpenApiSpecToAiTools(plugin.content, {
          authType: plugin.authType,
          authLocation: plugin.authLocation,
          authHeader: plugin.authHeader,
          authToken: plugin.authToken,
        });
        Object.assign(tools, converted);
      }
    }
  }

  return tools;
}
