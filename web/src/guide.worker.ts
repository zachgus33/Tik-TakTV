import { createGuideParser } from "./guide-parser";
let parser: ReturnType<typeof createGuideParser> | undefined;
let chunkCount = 0;
self.onmessage = (
  event: MessageEvent<{ start?: boolean; chunk?: string; finish?: boolean; targetIds?: string[]; targetNames?: string[] }>,
) => {
  try {
    if (event.data.start) {
      parser = createGuideParser(Date.now(), { ids: event.data.targetIds, names: event.data.targetNames });
      chunkCount = 0;
    }
    if (event.data.chunk !== undefined) {
      parser?.write(event.data.chunk);
      chunkCount += 1;
      if (chunkCount % 12 === 0) {
        self.postMessage({ ...parser?.snapshot(), partial: true });
        return;
      }
    }
    if (event.data.finish) {
      const programmes = parser?.finish() ?? {};
      self.postMessage({
        programmes,
        aliases: parser?.aliases() ?? {},
        artwork: parser?.artwork() ?? {},
      });
      parser = undefined;
      chunkCount = 0;
    } else self.postMessage({ ready: true });
  } catch {
    parser = undefined;
    self.postMessage({
      error:
        "The full guide is unavailable; channel guides will load automatically instead.",
    });
  }
};
