export function formatThinkingDuration(ms: number, lang = "en"): string {
  if (ms < 0) ms = 0;
  const seconds = ms / 1000;
  const secStr = seconds.toFixed(1);

  if (ms >= 3600_000) {
    const hours = (ms / 3600_000).toFixed(1);
    switch (lang) {
      case "cn":
        return `思考耗时 ${hours} 小时`;
      case "jp":
        return `思考時間 ${hours} 時間`;
      case "fr":
        return `Pensé pendant ${hours}h`;
      case "en":
      default:
        return `Thought for ${hours}h`;
    }
  }

  switch (lang) {
    case "cn":
      return `思考耗时 ${secStr} 秒`;
    case "jp":
      return `思考時間 ${secStr} 秒`;
    case "fr":
      return `Pensé pendant ${secStr}s`;
    case "en":
    default:
      return `Thought for ${secStr}s`;
  }
}

export function extractPlainText(reasoningMarkdown: string): string {
  if (!reasoningMarkdown) return "";
  return reasoningMarkdown
    .replace(/```[\w]*\n([\s\S]*?)```/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/<\/?think>/gi, "")
    .trim();
}
