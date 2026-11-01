export function isIOS() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

export function isFirefox() {
  return (
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)
  );
}

/**
 * Detects Macintosh
 */
export function isMacOS(): boolean {
  if (
    typeof window !== "undefined" &&
    typeof window.navigator !== "undefined"
  ) {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const macintosh = /iphone|ipad|ipod|macintosh/.test(userAgent);
    return !!macintosh;
  }
  return false;
}
