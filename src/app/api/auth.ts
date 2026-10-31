import { NextRequest } from "next/server";
import { ModelProvider } from "@/constant";

export function auth(_req: NextRequest, _modelProvider: ModelProvider) {
  return {
    error: false,
  };
}
