import "@testing-library/jest-dom";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  canCopyImageToClipboard,
  ImagePreviewer,
  PreviewActions,
} from "@/components/exporter";
import { ClientApi } from "@/client/api";
import Locale from "@/locales";
import { toBlob } from "html-to-image";

const mockShowToast = jest.fn();

jest.mock("next/dynamic", () => () => {
  const MockDynamic = () => <div />;
  MockDynamic.displayName = "MockDynamic";
  return MockDynamic;
});

jest.mock("next/image", () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt || ""} />
  );
  MockImage.displayName = "MockImage";
  return {
    __esModule: true,
    default: MockImage,
  };
});

jest.mock("../../src/icons/copy.svg", () => {
  const CopyIcon = () => <svg data-testid="copy-icon" />;
  CopyIcon.displayName = "CopyIcon";
  return CopyIcon;
});

jest.mock("../../src/icons/download.svg", () => {
  const DownloadIcon = () => <svg data-testid="download-icon" />;
  DownloadIcon.displayName = "DownloadIcon";
  return DownloadIcon;
});

jest.mock("../../src/icons/three-dots.svg", () => {
  const LoadingIcon = () => <svg data-testid="loading-icon" />;
  LoadingIcon.displayName = "LoadingIcon";
  return LoadingIcon;
});

jest.mock("html-to-image", () => ({
  toBlob: jest.fn(),
  toPng: jest.fn(),
}));

jest.mock("../../src/components/ui-lib", () => {
  const actual = jest.requireActual("../../src/components/ui-lib");
  return {
    ...actual,
    showToast: (...args: unknown[]) => mockShowToast(...args),
  };
});

jest.mock("../../src/components/emoji", () => ({
  Avatar: () => <span data-testid="avatar" />,
}));

jest.mock("../../src/components/mask", () => ({
  MaskAvatar: () => <span data-testid="mask-avatar" />,
}));

jest.mock("../../src/utils", () => {
  const actual = jest.requireActual("../../src/utils");
  return {
    ...actual,
    useMobileScreen: () => false,
  };
});

describe("Exporter PreviewActions", () => {
  test("renders copy and download buttons without ShareGPT share button when showCopy is true", () => {
    render(
      <PreviewActions copy={jest.fn()} download={jest.fn()} showCopy={true} />,
    );

    expect(screen.getByText(Locale.Export.Copy)).toBeInTheDocument();
    expect(screen.getByText(Locale.Export.Download)).toBeInTheDocument();
    expect(screen.queryByText(/ShareGPT/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("renders only download button when showCopy is false", () => {
    render(
      <PreviewActions copy={jest.fn()} download={jest.fn()} showCopy={false} />,
    );

    expect(screen.queryByText(Locale.Export.Copy)).toBeNull();
    expect(screen.getByText(Locale.Export.Download)).toBeInTheDocument();
    expect(screen.queryByText(/ShareGPT/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  test("ClientApi does not expose share method", () => {
    const api = new ClientApi();
    expect("share" in api).toBe(false);
  });
});

describe("ImagePreviewer clipboard availability", () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = (globalThis as { ClipboardItem?: unknown })
    .ClipboardItem;

  beforeEach(() => {
    mockShowToast.mockClear();
    (toBlob as jest.Mock).mockReset();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: originalClipboardItem,
      configurable: true,
      writable: true,
    });
  });

  test("hides Copy All button when navigator.clipboard is undefined", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    expect(canCopyImageToClipboard()).toBe(false);

    render(<ImagePreviewer messages={[]} topic="Test Topic" />);

    expect(screen.queryByText(Locale.Export.Copy)).toBeNull();
    expect(screen.getByText(Locale.Export.Download)).toBeInTheDocument();
  });

  test("hides Copy All button when ClipboardItem is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { write: jest.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(canCopyImageToClipboard()).toBe(false);

    render(<ImagePreviewer messages={[]} topic="Test Topic" />);

    expect(screen.queryByText(Locale.Export.Copy)).toBeNull();
    expect(screen.getByText(Locale.Export.Download)).toBeInTheDocument();
  });

  test("shows Copy All button and copies PNG blob when navigator.clipboard.write is available", async () => {
    const mockWrite = jest.fn().mockResolvedValue(undefined);
    const mockBlob = new Blob(["png"], { type: "image/png" });
    (toBlob as jest.Mock).mockResolvedValue(mockBlob);

    Object.defineProperty(navigator, "clipboard", {
      value: { write: mockWrite },
      configurable: true,
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: jest.fn((items) => items),
      configurable: true,
      writable: true,
    });

    expect(canCopyImageToClipboard()).toBe(true);

    render(<ImagePreviewer messages={[]} topic="Test Topic" />);

    const copyButton = screen.getByText(Locale.Export.Copy);
    expect(copyButton).toBeInTheDocument();
    expect(screen.getByText(Locale.Export.Download)).toBeInTheDocument();

    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockWrite).toHaveBeenCalledTimes(1);
    });
    expect(mockShowToast).toHaveBeenCalledWith(Locale.Copy.Success);
  });

  test("shows failed toast when navigator.clipboard.write rejects", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const mockWrite = jest
      .fn()
      .mockRejectedValue(new Error("Clipboard permission denied"));
    const mockBlob = new Blob(["png"], { type: "image/png" });
    (toBlob as jest.Mock).mockResolvedValue(mockBlob);

    Object.defineProperty(navigator, "clipboard", {
      value: { write: mockWrite },
      configurable: true,
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      value: jest.fn((items) => items),
      configurable: true,
      writable: true,
    });

    render(<ImagePreviewer messages={[]} topic="Test Topic" />);

    fireEvent.click(screen.getByText(Locale.Export.Copy));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(Locale.Copy.Failed);
    });

    consoleErrorSpy.mockRestore();
  });
});
