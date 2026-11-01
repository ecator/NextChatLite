import { describe, it, expect, beforeEach } from "@jest/globals";
import { useMaskStore } from "@/store/mask";
import { safeLocalStorage } from "@/utils/storage";
import { StoreKey } from "@/constant";

describe("Mask store browser persistence", () => {
  const storage = safeLocalStorage();

  beforeEach(() => {
    storage.clear();
    useMaskStore.setState({
      masks: {},
      builtinMasks: {},
    });
    // Ensure store is marked as hydrated
    useMaskStore.getState().setHasHydrated(true);
  });

  it("persists user-created custom masks to browser storage", async () => {
    const customMask = useMaskStore.getState().create({
      name: "Custom Agent Mask",
      avatar: "1f916",
    });

    expect(customMask.id).toBeDefined();
    expect(customMask.builtin).toBe(false);

    // Give microtasks time to complete persist setItem
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify stored item in browser storage
    const rawStored = storage.getItem(StoreKey.Mask);
    expect(rawStored).not.toBeNull();

    const parsed = JSON.parse(rawStored!);
    expect(parsed.state).toBeDefined();
    expect(parsed.state._hasHydrated).toBe(true);
    expect(parsed.state.masks[customMask.id]).toBeDefined();
    expect(parsed.state.masks[customMask.id].name).toBe("Custom Agent Mask");
    expect(parsed.state.masks[customMask.id].builtin).toBe(false);
  });

  it("does not persist server-fetched masks into storage", async () => {
    // Inject server masks into builtinMasks
    useMaskStore.setState({
      builtinMasks: {
        server_mask_999: {
          id: "server_mask_999",
          name: "Server Mask",
          avatar: "1f600",
          builtin: true,
          createdAt: 1000,
          context: [],
          modelConfig: {} as any,
          lang: "en",
        },
      },
    });

    // Create a custom mask
    const customMask = useMaskStore.getState().create({
      name: "My Persistent Custom Mask",
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const rawStored = storage.getItem(StoreKey.Mask);
    expect(rawStored).not.toBeNull();
    const parsed = JSON.parse(rawStored!);

    // Custom mask should be in persisted storage
    expect(parsed.state.masks[customMask.id]).toBeDefined();
    // Server mask should NEVER be in persisted storage
    expect(parsed.state.masks["server_mask_999"]).toBeUndefined();
    expect(parsed.state.builtinMasks).toBeUndefined();
  });

  it("persists updates and deletions of custom masks", async () => {
    const customMask = useMaskStore.getState().create({
      name: "Original Name",
    });

    useMaskStore.getState().updateMask(customMask.id, (m) => {
      m.name = "Updated Name";
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    let parsed = JSON.parse(storage.getItem(StoreKey.Mask)!);
    expect(parsed.state.masks[customMask.id].name).toBe("Updated Name");

    // Delete custom mask
    useMaskStore.getState().delete(customMask.id);

    await new Promise((resolve) => setTimeout(resolve, 50));

    parsed = JSON.parse(storage.getItem(StoreKey.Mask)!);
    expect(parsed.state.masks[customMask.id]).toBeUndefined();
  });

  it("merges persisted user masks with server masks on getAll()", () => {
    useMaskStore.setState({
      builtinMasks: {
        server_1: {
          id: "server_1",
          name: "Remote Server Mask",
          avatar: "1f600",
          builtin: true,
          createdAt: 1000,
          context: [],
          modelConfig: {} as any,
          lang: "en",
        },
      },
    });

    useMaskStore.getState().create({
      name: "Local User Mask",
    });

    const all = useMaskStore.getState().getAll();
    const names = all.map((m) => m.name);
    expect(names).toContain("Remote Server Mask");
    expect(names).toContain("Local User Mask");
  });
});
