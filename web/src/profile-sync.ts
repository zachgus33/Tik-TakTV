/** Open a profile immediately and complete its remote refresh in the background. */
export function beginProfileSync<T>(
  open: () => void,
  load: () => Promise<T>,
  apply: (value: T) => void,
  fail: (reason: unknown) => void,
) {
  open();
  void load().then(apply, fail);
}
