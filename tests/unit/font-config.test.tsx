import "@testing-library/jest-dom";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { act, render } from "@testing-library/react";
import RootLayout from "@/app/layout";
import { Home } from "@/components/home";

jest.mock("../../src/icons/bot.svg", () => {
  const BotIcon = () => <svg data-testid="bot-icon" />;
  BotIcon.displayName = "BotIcon";
  return BotIcon;
});

jest.mock("../../src/icons/three-dots.svg", () => {
  const LoadingIcon = () => <svg data-testid="loading-icon" />;
  LoadingIcon.displayName = "LoadingIcon";
  return LoadingIcon;
});

jest.mock("next/dynamic", () => () => {
  const DynamicStub = () => <div data-testid="dynamic-stub" />;
  DynamicStub.displayName = "DynamicStub";
  return DynamicStub;
});

jest.mock("../../src/components/sidebar", () => ({
  SideBar: () => <div data-testid="sidebar" />,
}));

jest.mock("../../src/components/auth", () => ({
  AuthPage: () => <div data-testid="auth-page" />,
}));

describe("Font loading configuration", () => {
  afterEach(() => {
    document.head
      .querySelectorAll("link[rel='stylesheet']")
      .forEach((el) => el.remove());
  });

  test("Home does not inject legacy /google-fonts or external Google Fonts stylesheets on mount", async () => {
    await act(async () => {
      render(<Home />);
    });

    const stylesheets = Array.from(
      document.head.querySelectorAll("link[rel='stylesheet']"),
    );
    const fontLinks = stylesheets.filter((link) => {
      const href = link.getAttribute("href") || "";
      return (
        href.includes("/google-fonts") || href.includes("fonts.googleapis.com")
      );
    });

    expect(fontLinks).toHaveLength(0);
  });

  test("RootLayout applies next/font Noto_Sans CSS variable class to <html>", () => {
    const element = RootLayout({
      children: <main>content</main>,
    }) as React.ReactElement<{ className?: string; lang?: string }>;

    expect(element.type).toBe("html");
    expect(element.props.lang).toBe("en");
    expect(element.props.className).toContain("variable");
  });

  test("globals.scss includes --font-noto-sans in html font-family stack", () => {
    const globalsPath = path.resolve(process.cwd(), "src/styles/globals.scss");
    const globalsScss = fs.readFileSync(globalsPath, "utf-8");

    expect(globalsScss).toContain("var(--font-noto-sans)");
  });
});
