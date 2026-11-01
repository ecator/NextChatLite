import { NextResponse } from "next/server";

import { getServerSideConfig } from "@/config/server";

declare global {
  type DangerConfig = {
    defaultModel: string;
    title: string;
    subTitle: string;
    helpUrl?: string;
  };
}

async function handle() {
  const serverConfig = getServerSideConfig();
  return NextResponse.json({
    defaultModel: serverConfig.defaultModel,
    title: serverConfig.title,
    subTitle: serverConfig.subTitle,
    helpUrl: serverConfig.helpUrl,
  });
}

export const GET = handle;
export const POST = handle;

export const runtime = "edge";
