export function clientUpdate() {
  return Promise.resolve();
}

// https://gist.github.com/iwill/a83038623ba4fef6abb9efca87ae9ccb
export function semverCompare(a: string, b: string) {
  if (a.startsWith(b + "-")) return -1;
  if (b.startsWith(a + "-")) return 1;
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "case",
    caseFirst: "upper",
  });
}

export function getOperationId(operation: {
  operationId?: string;
  method: string;
  path: string;
}) {
  // pattern '^[a-zA-Z0-9_-]+$'
  return (
    operation?.operationId ||
    `${operation.method.toUpperCase()}${operation.path.replaceAll("/", "_")}`
  );
}
