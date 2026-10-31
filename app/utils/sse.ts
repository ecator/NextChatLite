export const EventStreamContentType = "text/event-stream";

export interface EventSourceMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export interface FetchEventSourceInit extends RequestInit {
  headers?: Record<string, string>;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onopen?: (response: Response) => Promise<void>;
  onmessage?: (msg: EventSourceMessage) => void;
  onclose?: () => void;
  onerror?: (err: any) => number | null | undefined | void;
  openWhenHidden?: boolean;
}

export async function fetchEventSource(
  input: RequestInfo | URL,
  init?: FetchEventSourceInit,
) {
  const {
    onopen,
    onmessage,
    onclose,
    onerror,
    openWhenHidden,
    fetch: customFetch,
    ...fetchInit
  } = init || {};
  const fetchFn = customFetch || window.fetch.bind(window);

  try {
    const response = await fetchFn(input, {
      ...fetchInit,
      headers: {
        Accept: "text/event-stream",
        ...fetchInit.headers,
      },
    });

    if (onopen) {
      await onopen(response);
    }

    if (!response.ok) {
      return;
    }

    if (!response.body) {
      if (onclose) onclose();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (onclose) onclose();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent: EventSourceMessage = { data: "" };
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          if (currentEvent.data && onmessage) {
            onmessage(currentEvent);
          }
          currentEvent = { data: "" };
          continue;
        }

        if (trimmed.startsWith("data:")) {
          const dataContent = trimmed.substring(5).trim();
          currentEvent.data = currentEvent.data
            ? currentEvent.data + "\n" + dataContent
            : dataContent;
        } else if (trimmed.startsWith("event:")) {
          currentEvent.event = trimmed.substring(6).trim();
        } else if (trimmed.startsWith("id:")) {
          currentEvent.id = trimmed.substring(3).trim();
        }
      }
    }
  } catch (err) {
    if (onerror) {
      onerror(err);
    } else {
      throw err;
    }
  }
}
