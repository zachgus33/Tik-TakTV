// Android 9 televisions can ship with their original Chromium 69 WebView.
// Keep the small set of newer platform helpers used by TikTak TV available
// without making the main application depend on a large compatibility bundle.

if (!Promise.allSettled) {
  Promise.allSettled = async <T>(
    values: Iterable<T | PromiseLike<T>>,
  ): Promise<PromiseSettledResult<Awaited<T>>[]> =>
    Promise.all(
      Array.from(values, (value) =>
        Promise.resolve(value).then(
          (result) =>
            ({ status: "fulfilled", value: result }) as PromiseFulfilledResult<
              Awaited<T>
            >,
          (reason) => ({ status: "rejected", reason }) as PromiseRejectedResult,
        ),
      ),
    );
}

if (!Object.fromEntries) {
  Object.fromEntries = (entries: Iterable<readonly [PropertyKey, unknown]>) => {
    const result: Record<PropertyKey, unknown> = {};
    for (const [key, value] of entries) result[key] = value;
    return result;
  };
}

if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (
    searchValue: string | RegExp,
    replaceValue: string | ((substring: string, ...args: unknown[]) => string),
  ) {
    if (searchValue instanceof RegExp) {
      if (!searchValue.global)
        throw new TypeError("replaceAll requires a global regular expression");
      return this.replace(searchValue, replaceValue as never);
    }
    const escaped = searchValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.replace(new RegExp(escaped, "g"), replaceValue as never);
  };
}

if (!Array.prototype.at) {
  Array.prototype.at = function <T>(this: T[], index: number) {
    const normalized = Math.trunc(index) || 0;
    const position = normalized < 0 ? this.length + normalized : normalized;
    return this[position];
  };
}

if (!crypto.randomUUID) {
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
      return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
    },
  });
}

if (!(AbortSignal as typeof AbortSignal & { timeout?: unknown }).timeout) {
  Object.defineProperty(AbortSignal, "timeout", {
    configurable: true,
    value: (milliseconds: number) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("Timed out", "TimeoutError")),
        milliseconds,
      );
      return controller.signal;
    },
  });
}
