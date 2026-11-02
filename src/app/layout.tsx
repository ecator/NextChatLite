import "@/styles/globals.scss";
import "@/styles/markdown.scss";
import "@/styles/highlight.scss";
import { getClientConfig } from "@/config/client";
import type { Metadata, Viewport } from "next";
import { getServerSideConfig } from "@/config/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const serverConfig = getServerSideConfig();
  return {
    title: serverConfig.title,
    description: "Your personal ChatGPT Chat Bot.",
    appleWebApp: {
      title: serverConfig.title,
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        {
          url: "/favicon.svg",
          type: "image/svg+xml",
        },
      ],
      shortcut: ["/favicon.svg"],
      apple: [
        {
          url: "/favicon.svg",
          type: "image/svg+xml",
        },
      ],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="config" content={JSON.stringify(getClientConfig())} />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <link
          rel="manifest"
          href="/site.webmanifest"
          crossOrigin="use-credentials"
        ></link>
        <script src="/serviceWorkerRegister.js" defer></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var script = document.createElement("script");
                script.src = "/inject.js?t=" + Date.now();
                script.defer = true;
                document.head.appendChild(script);
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
