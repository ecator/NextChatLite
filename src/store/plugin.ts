import OpenAPIClientAxios from "openapi-client-axios";
import { StoreKey } from "../constant";
import { nanoid } from "nanoid";
import { createPersistStore } from "../utils/store";
import yaml from "js-yaml";
import { getOperationId } from "../utils";
import { useAccessStore } from "./access";

export type Plugin = {
  id: string;
  createdAt: number;
  title: string;
  version: string;
  content: string;
  builtin: boolean;
  authType?: string;
  authLocation?: string;
  authHeader?: string;
  authToken?: string;
};

export type FunctionToolItem = {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters: Object;
  };
};

type FunctionToolServiceItem = {
  api: OpenAPIClientAxios;
  length: number;
  tools: FunctionToolItem[];
  funcs: Record<string, Function>;
};

export const FunctionToolService = {
  tools: {} as Record<string, FunctionToolServiceItem>,
  add(plugin: Plugin, replace = false) {
    if (!replace && this.tools[plugin.id]) return this.tools[plugin.id];
    const headerName = (
      plugin?.authType == "custom" ? plugin?.authHeader : "Authorization"
    ) as string;
    const tokenValue =
      plugin?.authType == "basic"
        ? `Basic ${plugin?.authToken}`
        : plugin?.authType == "bearer"
          ? `Bearer ${plugin?.authToken}`
          : plugin?.authToken;
    const authLocation = plugin?.authLocation || "header";
    const definition = yaml.load(plugin.content) as any;
    const serverURL = definition?.servers?.[0]?.url;
    const baseURL = "/api/proxy";
    const headers: Record<string, string | undefined> = {
      "X-Base-URL": serverURL,
    };
    if (authLocation == "header") {
      headers[headerName] = tokenValue;
    }
    // try using openaiApiKey for Dalle3 Plugin.
    if (!tokenValue && plugin.id === "dalle3") {
      const openaiApiKey = useAccessStore.getState().openaiApiKey;
      if (openaiApiKey) {
        headers[headerName] = `Bearer ${openaiApiKey}`;
      }
    }
    const api = new OpenAPIClientAxios({
      definition: yaml.load(plugin.content) as any,
      axiosConfigDefaults: {
        adapter: ["xhr"] as any,
        baseURL,
        headers,
      },
    });
    try {
      api.initSync();
    } catch (e) {}
    const operations = api.getOperations();
    return (this.tools[plugin.id] = {
      api,
      length: operations.length,
      tools: operations.map((o) => {
        // @ts-ignore
        const parameters = o?.requestBody?.content["application/json"]
          ?.schema || {
          type: "object",
          properties: {},
        };
        if (!parameters["required"]) {
          parameters["required"] = [];
        }
        if (o.parameters instanceof Array) {
          o.parameters.forEach((p) => {
            // @ts-ignore
            if (p?.in == "query" || p?.in == "path") {
              // const name = `${p.in}__${p.name}`
              // @ts-ignore
              const name = p?.name;
              parameters["properties"][name] = {
                // @ts-ignore
                type: p.schema.type,
                // @ts-ignore
                description: p.description,
              };
              // @ts-ignore
              if (p.required) {
                parameters["required"].push(name);
              }
            }
          });
        }
        return {
          type: "function",
          function: {
            name: getOperationId(o),
            description: o.description || o.summary,
            parameters: parameters,
          },
        } as FunctionToolItem;
      }),
      funcs: operations.reduce((s, o) => {
        // @ts-ignore
        s[getOperationId(o)] = function (args) {
          const parameters: Record<string, any> = {};
          if (o.parameters instanceof Array) {
            o.parameters.forEach((p) => {
              // @ts-ignore
              parameters[p?.name] = args[p?.name];
              // @ts-ignore
              delete args[p?.name];
            });
          }
          if (authLocation == "query") {
            parameters[headerName] = tokenValue;
          } else if (authLocation == "body") {
            args[headerName] = tokenValue;
          }
          // @ts-ignore if o.operationId is null, then using o.path and o.method
          return api.client.paths[o.path][o.method](
            parameters,
            args,
            api.axiosConfigDefaults,
          );
        };
        return s;
      }, {}),
    });
  },
  get(id: string) {
    return this.tools[id];
  },
};

export const createEmptyPlugin = () =>
  ({
    id: nanoid(),
    title: "",
    version: "1.0.0",
    content: "",
    builtin: false,
    createdAt: Date.now(),
  }) as Plugin;

export const DEFAULT_PLUGIN_STATE = {
  plugins: {} as Record<string, Plugin>,
  builtinPlugins: {} as Record<string, Plugin>,
};

export type PluginState = typeof DEFAULT_PLUGIN_STATE;

export const usePluginStore = createPersistStore(
  { ...DEFAULT_PLUGIN_STATE },

  (set, get) => ({
    create(plugin?: Partial<Plugin>) {
      const plugins = get().plugins;
      const id = plugin?.id || nanoid();
      plugins[id] = {
        ...createEmptyPlugin(),
        ...plugin,
        id,
        builtin: false,
      };

      set(() => ({ plugins }));
      get().markUpdate();

      return plugins[id];
    },
    updatePlugin(id: string, updater: (plugin: Plugin) => void) {
      // Server-fetched plugins cannot be modified
      if (get().builtinPlugins[id]) return;
      const plugins = get().plugins;
      const plugin = plugins[id];
      if (!plugin || plugin.builtin) return;

      const updatePlugin = { ...plugin };
      updater(updatePlugin);
      plugins[id] = updatePlugin;
      FunctionToolService.add(updatePlugin, true);
      set(() => ({ plugins }));
      get().markUpdate();
    },
    delete(id: string) {
      // Server-fetched plugins cannot be deleted
      if (get().builtinPlugins[id]) return;
      const plugins = get().plugins;
      if (!plugins[id] || plugins[id].builtin) return;

      delete plugins[id];
      set(() => ({ plugins }));
      get().markUpdate();
    },

    getAsTools(ids: string[]) {
      const selected = (ids || [])
        .map((id) => (get() as any).get(id))
        .filter((i): i is Plugin => Boolean(i))
        .map((p) => FunctionToolService.add(p));
      return [
        // @ts-ignore
        selected.reduce((s, i) => s.concat(i.tools), []),
        selected.reduce((s, i) => Object.assign(s, i.funcs), {}),
      ];
    },
    get(id?: string) {
      if (!id) return undefined;
      return get().plugins[id] ?? get().builtinPlugins[id];
    },
    getAll() {
      const userPlugins = Object.values(get().plugins)
        .filter((p) => !p.builtin)
        .sort((a, b) => b.createdAt - a.createdAt);
      const serverPlugins = Object.values(get().builtinPlugins).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      // Return both local and server plugins merged together (even if they have the same name)
      return userPlugins.concat(serverPlugins);
    },
    async fetchServerPlugins() {
      if (typeof window === "undefined") {
        return;
      }

      try {
        const res = await fetch("./plugins.json")
          .catch(() => fetch("/plugins.json"))
          .then((r) => r.json());

        const builtinPlugins: Record<string, Plugin> = {};
        await Promise.all(
          res.map(async (item: any) => {
            let content = "";
            const rawSchema = item.schema || "";
            const schemaUrl = rawSchema.replace(/^https?:\/\/ghp\.ci\//, "");
            try {
              let schemaRes: Response | null = null;
              if (schemaUrl) {
                schemaRes = await fetch(schemaUrl).catch(() => null);
              }
              if ((!schemaRes || !schemaRes.ok) && item.id) {
                schemaRes = await fetch(`/plugins/${item.id}.json`).catch(
                  () => null,
                );
              }
              if (schemaRes && schemaRes.ok) {
                content = await schemaRes.text();
              } else if (schemaUrl) {
                throw new Error(`Failed to fetch schema from ${schemaUrl}`);
              }
            } catch (e) {
              console.error("[Plugin] fetch schema failed", item.schema, e);
            }

            const id = item.id || nanoid();
            const plugin: Plugin = {
              id,
              title: item.name || item.title || id,
              version: "1.0.0",
              content,
              builtin: true,
              createdAt: 0,
            };

            if (content) {
              try {
                const tool = FunctionToolService.add(plugin, true);
                plugin.title = tool.api.definition?.info?.title || plugin.title;
                plugin.version =
                  tool.api.definition?.info?.version || plugin.version;
              } catch (e) {}
            }

            builtinPlugins[id] = plugin;
          }),
        );

        set(() => ({ builtinPlugins }));
      } catch (e) {
        console.error("[Plugin] fetchServerPlugins failed", e);
      }
    },
  }),
  {
    name: StoreKey.Plugin,
    version: 2,

    // Only persist local user plugins, never server plugins
    partialize: (state: any) => ({
      plugins: Object.fromEntries(
        Object.entries(state.plugins).filter(
          ([_, p]: [string, any]) => !p.builtin,
        ),
      ),
    }),

    onRehydrateStorage(state: any) {
      if (typeof window === "undefined") {
        return;
      }

      // Purge any legacy builtin plugins from storage
      if (state?.plugins) {
        let changed = false;
        Object.keys(state.plugins).forEach((key) => {
          if (state.plugins[key]?.builtin) {
            delete state.plugins[key];
            changed = true;
          }
        });
        if (changed) {
          state.markUpdate();
        }
      }

      state?.fetchServerPlugins();
    },

    migrate(state: any, version: number) {
      const newState = JSON.parse(
        JSON.stringify(state),
      ) as typeof DEFAULT_PLUGIN_STATE;

      // Purge any legacy builtin plugins
      if (newState.plugins) {
        Object.keys(newState.plugins).forEach((key) => {
          if (newState.plugins[key]?.builtin) {
            delete newState.plugins[key];
          }
        });
      }

      return newState as any;
    },
  },
);
