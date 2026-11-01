import { useAccessStore } from "@/store/access";
import fs from "fs";
import path from "path";

describe("Milestone 2: Azure Settings & Access Store Verification", () => {
  beforeEach(() => {
    // Reset access store state before each test
    useAccessStore.setState({
      azureUrl: "",
      azureApiKey: "",
      azureApiVersion: "2023-08-01-preview",
    });
  });

  describe("1. Access Store isValidAzure() behavior", () => {
    it("returns false by default when azureUrl and azureApiKey are empty", () => {
      const store = useAccessStore.getState();
      expect(store.azureUrl).toBe("");
      expect(store.azureApiKey).toBe("");
      expect(store.azureApiVersion).toBe("2023-08-01-preview");
      expect(store.isValidAzure()).toBe(false);
    });

    it("returns true when azureUrl, azureApiKey, and azureApiVersion are all non-empty", () => {
      useAccessStore.setState({
        azureUrl: "https://my-openai-resource.openai.azure.com",
        azureApiKey: "test-azure-api-key-1234567890",
        azureApiVersion: "2024-02-15-preview",
      });

      const store = useAccessStore.getState();
      expect(store.isValidAzure()).toBe(true);
    });

    it("returns false if azureUrl is empty string, null, or undefined", () => {
      useAccessStore.setState({
        azureUrl: "",
        azureApiKey: "valid-key",
        azureApiVersion: "2024-02-15-preview",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);

      useAccessStore.setState({
        azureUrl: undefined as any,
        azureApiKey: "valid-key",
        azureApiVersion: "2024-02-15-preview",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);

      useAccessStore.setState({
        azureUrl: null as any,
        azureApiKey: "valid-key",
        azureApiVersion: "2024-02-15-preview",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);
    });

    it("returns false if azureApiKey is empty string, null, or undefined", () => {
      useAccessStore.setState({
        azureUrl: "https://valid.openai.azure.com",
        azureApiKey: "",
        azureApiVersion: "2024-02-15-preview",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);

      useAccessStore.setState({
        azureUrl: "https://valid.openai.azure.com",
        azureApiKey: undefined as any,
        azureApiVersion: "2024-02-15-preview",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);

      useAccessStore.setState({
        azureUrl: "https://valid.openai.azure.com",
        azureApiKey: null as any,
        azureApiVersion: "2024-02-15-preview",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);
    });

    it("returns false if azureApiVersion is empty string, null, or undefined", () => {
      useAccessStore.setState({
        azureUrl: "https://valid.openai.azure.com",
        azureApiKey: "valid-key",
        azureApiVersion: "",
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);

      useAccessStore.setState({
        azureUrl: "https://valid.openai.azure.com",
        azureApiKey: "valid-key",
        azureApiVersion: undefined as any,
      });
      expect(useAccessStore.getState().isValidAzure()).toBe(false);
    });

    it("resolves Azure credentials via getApiKeyByProvider and getBaseUrlByProvider", () => {
      useAccessStore.setState({
        azureUrl: "https://resource-eastus.openai.azure.com",
        azureApiKey: "azure-secret-key-999",
        azureApiVersion: "2023-12-01-preview",
      });

      const store = useAccessStore.getState();
      expect(store.getApiKeyByProvider("azure")).toBe("azure-secret-key-999");
      expect(store.getApiKeyByProvider("AZURE")).toBe("azure-secret-key-999");
      expect(store.getApiKeyByProvider("azure-openai")).toBe(
        "azure-secret-key-999",
      );

      expect(store.getBaseUrlByProvider("azure")).toBe(
        "https://resource-eastus.openai.azure.com",
      );
      expect(store.getBaseUrlByProvider("AZURE")).toBe(
        "https://resource-eastus.openai.azure.com",
      );
    });
  });

  describe("2. Azure Backend Environment Integration (Clean Frontend UI)", () => {
    const settingsPath = path.resolve(
      process.cwd(),
      "src/components/settings.tsx",
    );
    const settingsContent = fs.readFileSync(settingsPath, "utf-8");
    const routePath = path.resolve(process.cwd(), "src/app/api/chat/route.ts");
    const routeContent = fs.readFileSync(routePath, "utf-8");

    it("does not render Azure OpenAI input controls in settings UI to keep frontend clean", () => {
      expect(settingsContent).not.toContain(
        "Locale.Settings.Access.Azure.Endpoint.Title",
      );
      expect(settingsContent).not.toContain(
        "Locale.Settings.Access.Azure.ApiKey.Title",
      );
    });

    it("resolves Azure credentials and endpoints from backend environment variables in route.ts", () => {
      expect(routeContent).toContain("process.env.AZURE_API_KEY");
      expect(routeContent).toContain("process.env.AZURE_OPENAI_API_KEY");
      expect(routeContent).toContain("process.env.AZURE_URL");
      expect(routeContent).toContain("process.env.AZURE_RESOURCE_NAME");
      expect(routeContent).toContain("process.env.AZURE_API_VERSION");
    });
  });
});
