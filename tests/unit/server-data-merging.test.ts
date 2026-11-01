import { describe, it, expect, beforeEach } from "@jest/globals";
import { useMaskStore } from "@/store/mask";
import { usePluginStore } from "@/store/plugin";
import { usePromptStore } from "@/store/prompt";

describe("Server data in-memory merging and read-only protection", () => {
  beforeEach(() => {
    // Reset stores
    useMaskStore.setState({
      masks: {},
      builtinMasks: {},
    });
    usePluginStore.setState({
      plugins: {},
      builtinPlugins: {},
    });
    usePromptStore.setState({
      counter: 0,
      prompts: {},
      builtinPrompts: [],
    });
  });

  describe("Masks Store", () => {
    it("should merge server masks in-memory with user masks and display all even with same name", () => {
      // Setup server mask in memory
      useMaskStore.setState({
        builtinMasks: {
          server_mask_1: {
            id: "server_mask_1",
            name: "Translator",
            avatar: "1f600",
            builtin: true,
            createdAt: 1000,
            context: [],
            modelConfig: {} as any,
            lang: "en",
          },
        },
      });

      // User creates a mask with the SAME name
      const userMask = useMaskStore.getState().create({
        name: "Translator",
      });

      const allMasks = useMaskStore.getState().getAll();
      expect(allMasks.length).toBe(2);
      expect(allMasks.map((m) => m.name)).toEqual(["Translator", "Translator"]);

      // Verify server mask is read-only
      useMaskStore.getState().updateMask("server_mask_1", (mask) => {
        mask.name = "Hacked";
      });
      expect(useMaskStore.getState().get("server_mask_1")?.name).toBe(
        "Translator",
      );

      useMaskStore.getState().delete("server_mask_1");
      expect(useMaskStore.getState().get("server_mask_1")).toBeDefined();
    });
  });

  describe("Plugins Store", () => {
    it("should merge server plugins in-memory with user plugins and display all even with same title", () => {
      // Setup server plugin in memory
      usePluginStore.setState({
        builtinPlugins: {
          server_plugin_1: {
            id: "server_plugin_1",
            title: "Web Search",
            version: "1.0.0",
            content: "openapi: 3.0.0",
            builtin: true,
            createdAt: 0,
          },
        },
      });

      // User creates a plugin with the SAME title
      const userPlugin = usePluginStore.getState().create({
        title: "Web Search",
      });

      const allPlugins = usePluginStore.getState().getAll();
      expect(allPlugins.length).toBe(2);
      expect(allPlugins.map((p) => p.title)).toEqual([
        "Web Search",
        "Web Search",
      ]);

      // Verify server plugin is read-only
      usePluginStore.getState().updatePlugin("server_plugin_1", (p) => {
        p.title = "Modified Search";
      });
      expect(usePluginStore.getState().get("server_plugin_1")?.title).toBe(
        "Web Search",
      );

      usePluginStore.getState().delete("server_plugin_1");
      expect(usePluginStore.getState().get("server_plugin_1")).toBeDefined();
    });
  });

  describe("Prompts Store", () => {
    it("should merge server prompts in-memory with user prompts and display all even with same title", () => {
      // Setup server prompt in memory
      usePromptStore.setState({
        builtinPrompts: [
          {
            id: "server_prompt_1",
            title: "Translate to Chinese",
            content: "Please translate to Chinese.",
            createdAt: 0,
            isUser: false,
          },
        ],
      });

      // User creates a prompt with the SAME title
      usePromptStore.getState().add({
        id: "",
        title: "Translate to Chinese",
        content: "Custom Chinese translator prompt",
        createdAt: Date.now(),
      });

      const allPrompts = usePromptStore.getState().getAll();
      expect(allPrompts.length).toBe(2);
      expect(allPrompts.map((p) => p.title)).toEqual([
        "Translate to Chinese",
        "Translate to Chinese",
      ]);

      // Verify server prompt is read-only
      usePromptStore.getState().updatePrompt("server_prompt_1", (p) => {
        p.title = "Hacked Prompt";
      });
      expect(usePromptStore.getState().get("server_prompt_1")?.title).toBe(
        "Translate to Chinese",
      );

      usePromptStore.getState().remove("server_prompt_1");
      expect(usePromptStore.getState().get("server_prompt_1")).toBeDefined();
    });
  });
});
