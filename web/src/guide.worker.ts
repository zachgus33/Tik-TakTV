import { createGuideParser } from "./guide-parser";
let parser: ReturnType<typeof createGuideParser> | undefined;
self.onmessage = (
  event: MessageEvent<{ start?: boolean; chunk?: string; finish?: boolean }>,
) => {
  try {
    if (event.data.start) parser = createGuideParser();
    if (event.data.chunk !== undefined) parser?.write(event.data.chunk);
    if (event.data.finish) {
      self.postMessage({ programmes: parser?.finish() ?? {} });
      parser = undefined;
    } else self.postMessage({ ready: true });
  } catch {
    parser = undefined;
    self.postMessage({
      error:
        "The full guide is unavailable; channel guides will load automatically instead.",
    });
  }
};
