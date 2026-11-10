import { createGuideParser } from "./guide-parser";
let parser: ReturnType<typeof createGuideParser> | undefined;
let bytesSincePublish = 0;
self.onmessage = (
  event: MessageEvent<{ start?: boolean; chunk?: string; finish?: boolean; targetIds?: string[]; targetNames?: string[] }>,
) => {
  try {
    if (event.data.start) {
      parser = createGuideParser(Date.now(), { ids: event.data.targetIds, names: event.data.targetNames });
      bytesSincePublish = 0;
    }
    if (event.data.chunk !== undefined) {
      parser?.write(event.data.chunk);
      bytesSincePublish += event.data.chunk.length;
      // Send deltas rather than cloning the complete parsed guide over and
      // over. A multi-thousand-channel XMLTV file otherwise gets slower with
      // every progress update.
      if (bytesSincePublish >= 2_000_000) {
        self.postMessage({ ...parser?.drain(), partial: true });
        bytesSincePublish = 0;
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
      bytesSincePublish = 0;
    } else self.postMessage({ ready: true });
  } catch {
    parser = undefined;
    self.postMessage({
      error:
        "The full guide is unavailable; channel guides will load automatically instead.",
    });
  }
};
