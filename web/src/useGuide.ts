import { useEffect, useRef, useState } from "react";
import { epg } from "./api";
import type { Item, Programme, Provider } from "./types";

type State = {
  scope: string;
  xml: Record<string, Programme[]>;
  channels: Record<string, Programme[]>;
  failed: string[];
  loading: boolean;
  fallback: boolean;
};
const empty: State = {
  scope: "",
  xml: {},
  channels: {},
  failed: [],
  loading: false,
  fallback: false,
};
export function useGuide(
  provider: Provider | null,
  visible: Item[],
  active: Item | null,
  revision: number,
) {
  const [state, setState] = useState<State>(empty);
  const [now, setNow] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const reload = setInterval(() => setRefresh((n) => n + 1), 15 * 60_000);
    return () => {
      clearInterval(timer);
      clearInterval(reload);
    };
  }, []);
  useEffect(() => {
    if (!provider) {
      setState(empty);
      return;
    }
    const reset = { ...empty, scope: provider.scope, loading: true };
    stateRef.current = reset;
    setState(reset);
    const worker = new Worker(new URL("./guide.worker.ts", import.meta.url), {
      type: "module",
    });
    let stopped = false;
    const controller = new AbortController();
    let acknowledge: (() => void) | undefined;
    const unavailable = () => {
      if (!stopped) setState((s) => ({ ...s, loading: false, fallback: true }));
    };
    worker.onmessage = (
      e: MessageEvent<{
        ready?: boolean;
        programmes?: Record<string, Programme[]>;
        error?: string;
      }>,
    ) => {
      if (e.data.ready) {
        acknowledge?.();
        return;
      }
      controller.abort();
      acknowledge?.();
      clearTimeout(timer);
      if (!stopped)
        setState((s) => ({
          ...s,
          xml: e.data.programmes ?? {},
          loading: false,
          fallback: !!e.data.error,
        }));
      worker.terminate();
    };
    worker.onerror = () => {
      controller.abort();
      acknowledge?.();
      clearTimeout(timer);
      unavailable();
      worker.terminate();
    };
    const query = new URLSearchParams({
      username: provider.username,
      password: provider.password,
    });
    async function send(message: { start?: boolean; chunk?: string }) {
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
        worker.postMessage(message);
      });
    }
    async function load() {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetch(`${provider!.server}/xmltv.php?${query}`, {
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (
          !response.ok ||
          !response.body ||
          Number(response.headers.get("content-length")) > 60_000_000
        )
          throw new Error("Guide unavailable");
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        await send({ start: true });
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 60_000_000) throw new Error("Guide too large");
          await send({ chunk: decoder.decode(value, { stream: true }) });
        }
        if (!controller.signal.aborted) {
          await send({ chunk: decoder.decode() });
          worker.postMessage({ finish: true });
        }
      } catch {
        if (!controller.signal.aborted) {
          unavailable();
          clearTimeout(timer);
          worker.terminate();
        }
      } finally {
        await reader?.cancel().catch(() => {});
      }
    }
    void load();
    const timer = setTimeout(() => {
      unavailable();
      controller.abort();
      acknowledge?.();
      worker.terminate();
    }, 47000);
    return () => {
      stopped = true;
      controller.abort();
      acknowledge?.();
      clearTimeout(timer);
      worker.terminate();
    };
  }, [provider, revision, refresh]);
  const ids = [
    ...new Map(
      [...(active ? [active] : []), ...visible]
        .filter((i) => i.source === "xtream" && i.provider === provider?.scope)
        .map((i) => [i.id, i]),
    ).values(),
  ];
  const signature = ids.map((i) => `${i.id}:${i.epgId ?? ""}`).join("|");
  useEffect(() => {
    if (!provider) return;
    const c = new AbortController();
    const queue = ids.filter(
      (i) =>
        !stateRef.current.channels[i.id] &&
        !stateRef.current.failed.includes(i.id) &&
        !stateRef.current.xml[i.epgId ?? ""],
    );
    async function consume() {
      while (queue.length && !c.signal.aborted) {
        const item = queue.shift()!;
        try {
          const list = await epg(provider!, item.id, c.signal);
          if (!c.signal.aborted)
            setState((s) =>
              s.scope === provider!.scope
                ? { ...s, channels: { ...s.channels, [item.id]: list } }
                : s,
            );
        } catch {
          if (!c.signal.aborted)
            setState((s) => ({ ...s, failed: [...s.failed, item.id] }));
        }
      }
    }
    // Only visible channels, at most three requests at once. The full feed loads in a worker.
    void Promise.all([consume(), consume(), consume()]);
    return () => c.abort();
  }, [provider, signature, revision, refresh]);
  const valid = state.scope === provider?.scope ? state : empty;
  const get = (item: Item) =>
    (valid.xml[item.epgId ?? ""] ?? valid.channels[item.id] ?? []).filter(
      (p) => p.end > now,
    );
  return {
    get,
    now,
    loading: valid.loading,
    fallback: valid.fallback,
    failed: (id: string) => valid.failed.includes(id),
    loaded: (item: Item) =>
      !!(valid.xml[item.epgId ?? ""] || valid.channels[item.id]),
    count: Object.keys(valid.xml).length || Object.keys(valid.channels).length,
  };
}
