import "@testing-library/jest-dom";
import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SideBar } from "@/components/sidebar";
import { useAccessStore } from "@/store/access";

// Mock next/image
jest.mock("next/image", () => {
  const MockImage = ({
    priority: _priority,
    unoptimized: _unoptimized,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    priority?: boolean;
    unoptimized?: boolean;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt || ""} />
  );
  MockImage.displayName = "MockImage";
  return {
    __esModule: true,
    default: MockImage,
  };
});

// Mock SVG icons
jest.mock("../src/icons/help.svg", () => {
  const HelpIcon = () => <svg data-testid="help-icon" />;
  HelpIcon.displayName = "HelpIcon";
  return HelpIcon;
});
jest.mock("../src/icons/settings.svg", () => {
  const SettingsIcon = () => <svg />;
  SettingsIcon.displayName = "SettingsIcon";
  return SettingsIcon;
});
jest.mock("../src/icons/github.svg", () => {
  const GithubIcon = () => <svg />;
  GithubIcon.displayName = "GithubIcon";
  return GithubIcon;
});
jest.mock("../src/icons/add.svg", () => {
  const AddIcon = () => <svg />;
  AddIcon.displayName = "AddIcon";
  return AddIcon;
});
jest.mock("../src/icons/delete.svg", () => {
  const DeleteIcon = () => <svg />;
  DeleteIcon.displayName = "DeleteIcon";
  return DeleteIcon;
});
jest.mock("../src/icons/mask.svg", () => {
  const MaskIcon = () => <svg />;
  MaskIcon.displayName = "MaskIcon";
  return MaskIcon;
});
jest.mock("../src/icons/drag.svg", () => {
  const DragIcon = () => <svg />;
  DragIcon.displayName = "DragIcon";
  return DragIcon;
});
jest.mock("../src/icons/discovery.svg", () => {
  const DiscoveryIcon = () => <svg />;
  DiscoveryIcon.displayName = "DiscoveryIcon";
  return DiscoveryIcon;
});

// Mock chat-list dynamic import
jest.mock("next/dynamic", () => () => {
  const MockChatList = () => <div data-testid="chat-list" />;
  MockChatList.displayName = "MockChatList";
  return MockChatList;
});

describe("SideBar Help Button", () => {
  afterEach(() => {
    document.head
      .querySelectorAll("meta[name='config']")
      .forEach((m) => m.remove());
    act(() => {
      useAccessStore.setState({ helpUrl: "" });
    });
  });

  test("does not render help button when helpUrl is unset", () => {
    render(
      <MemoryRouter>
        <SideBar />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText("Help")).toBeNull();
  });

  test("renders help button linking to configured URL when helpUrl is set in access store", () => {
    act(() => {
      useAccessStore.setState({ helpUrl: "https://docs.nextchatlite.io/help" });
    });

    render(
      <MemoryRouter>
        <SideBar />
      </MemoryRouter>,
    );

    const helpButton = screen.getByLabelText("Help");
    expect(helpButton).toBeDefined();

    const helpLink = helpButton.closest("a");
    expect(helpLink).toHaveAttribute(
      "href",
      "https://docs.nextchatlite.io/help",
    );
    expect(helpLink).toHaveAttribute("target", "_blank");
    expect(helpLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("renders help button when configured via meta config tag", () => {
    const meta = document.createElement("meta");
    meta.name = "config";
    meta.content = JSON.stringify({
      helpUrl: "https://custom.support.org",
    });
    document.head.appendChild(meta);

    render(
      <MemoryRouter>
        <SideBar />
      </MemoryRouter>,
    );

    const helpButton = screen.getByLabelText("Help");
    expect(helpButton).toBeDefined();

    const helpLink = helpButton.closest("a");
    expect(helpLink).toHaveAttribute("href", "https://custom.support.org");
    expect(helpLink).toHaveAttribute("target", "_blank");
  });
});
