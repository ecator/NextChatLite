import test, { describe, it } from "node:test";
import assert from "node:assert";
import { readProjectFile, fileExists } from "../fixtures/test_helpers";

describe("Feature F4: Commercial / SaaS Cleanup & Paywall Removal", () => {
  it("F4-1: verifies absence of SaaS subscription and payment endpoints in constant.ts", () => {
    if (fileExists("src/constant.ts")) {
      const constantContent = readProjectFile("src/constant.ts");
      assert.doesNotMatch(
        constantContent,
        /SAAS_CHAT_URL|NEXT_PUBLIC_SAAS_URL|saas-pricing/i,
        "Commercial SaaS URLs must be removed from constant.ts"
      );
    }
  });

  it("F4-2: verifies absence of TopBanner SaaS advertisement component", () => {
    assert.strictEqual(
      fileExists("src/components/top-banner.tsx"),
      false,
      "TopBanner SaaS component must be deleted"
    );
  });

  it("F4-3: verifies absence of commercial licensing or paywall checks in access store", () => {
    if (fileExists("src/store/access.ts")) {
      const accessContent = readProjectFile("src/store/access.ts");
      assert.doesNotMatch(
        accessContent,
        /isCommercial|licenseKey|checkLicense|saasStart/i,
        "Commercial license checks and SaaS hooks must be pruned from access.ts"
      );
    }
  });

  it("F4-4: verifies absence of sponsorship prompts and referral popups", () => {
    if (fileExists("src/components/sidebar.tsx")) {
      const sidebarContent = readProjectFile("src/components/sidebar.tsx");
      assert.doesNotMatch(
        sidebarContent,
        /goSaas|sponsorLink|buyPlan/i,
        "Sponsorship and SaaS buttons must be removed from sidebar"
      );
    }
  });

  it("F4-5: verifies clean open-source settings view without paywall gates", () => {
    if (fileExists("src/components/settings.tsx")) {
      const settingsContent = readProjectFile("src/components/settings.tsx");
      assert.doesNotMatch(
        settingsContent,
        /proSubscription|upgradeToPro|saasUsage/i,
        "Settings view must be free from Pro upgrade gates"
      );
    }
  });
});
