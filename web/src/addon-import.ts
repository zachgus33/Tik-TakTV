import { installAddon } from "./api";
import type { Addon } from "./types";

export async function installMany(
  urls: string[],
): Promise<{ addons: Addon[]; failed: number }> {
  const queue = urls.map((url, index) => ({ url, index }));
  const installed: { addon: Addon; index: number }[] = [];
  let failed = 0;
  async function work() {
    while (queue.length) {
      const next = queue.shift()!;
      try {
        installed.push({
          addon: await installAddon(next.url),
          index: next.index,
        });
      } catch {
        failed++;
      }
    }
  }
  await Promise.all([work(), work(), work()]);
  return {
    addons: installed.sort((a, b) => a.index - b.index).map((x) => x.addon),
    failed,
  };
}
export function mergeAddons(current: Addon[], incoming: Addon[]) {
  return [
    ...new Map([...current, ...incoming].map((a) => [a.base, a])).values(),
  ];
}
