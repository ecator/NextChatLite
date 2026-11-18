import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { PreviewActions } from "@/components/exporter";
import { ClientApi } from "@/client/api";
import Locale from "@/locales";

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
