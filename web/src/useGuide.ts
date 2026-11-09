import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { epg, safeSourceUrl } from "./api";
import { getService, serviceRequest, sourceFetch } from "./connection";
import { readLiveCache, writeLiveCache } from "./live-cache";
import type { Item, Programme, Provider } from "./types";

type State = {
  scope: string;
  xml: Record<string, Programme[]>;
  channels: Record<string, Programme[]>;
  aliases: Record<string, string>;
  artwork: Record<string, string>;
  failed: string[];
  loading: boolean;
  fallback: boolean;
};
const empty: State = {
  scope: "",
  xml: {},
  channels: {},
  aliases: {},
  artwork: {},
  failed: [],
  loading: false,
  fallback: false,
};
export function useGuide(
  provider: Provider | null,
  visible: Item[],
  active: Item | null,
  revision: number,
  customUrl = "",
) {
  const guideUrl = customUrl.trim();
  const scope = useMemo(
    () =>
      provider
        ? `${provider.scope}${guideUrl ? `:${urlFingerprint(guideUrl)}` : ""}`
        : guideUrl
          ? `playlist:${urlFingerprint(guideUrl)}`
          : "",
    [guideUrl, provider],
  );
  const [state, setState] = useState<State>(empty);
  const [now, setNow] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ids = useMemo(
    () => [
      ...new Map(
        [...(active ? [active] : []), ...visible]
          .filter(
            (i) => i.source === "xtream" && i.provider === provider?.scope,
          )
          .map((i) => [i.id, i]),
      ).values(),
    ],
    [active, visible, provider?.scope],
  );
  const signature = useMemo(
    () => ids.map((i) => `${i.id}:${i.epgId ?? ""}`).join("|"),
    [ids],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    const reload = setInterval(() => setRefresh((n) => n + 1), 15 * 60_000);
    return () => {
      clearInterval(timer);
      clearInterval(reload);
    };
  }, []);
  useEffect(() => {
    if (!scope) {
      setState(empty);
      return;
    }
    const reset = { ...empty, scope, loading: true };
    stateRef.current = reset;
    setState(reset);
    const worker = new Worker(new URL("./guide.worker.ts", import.meta.url), {
      type: "module",
    });
    let stopped = false;
    const controller = new AbortController();
    const cacheKey = `guide:${scope}`;
    void readLiveCache<Pick<State, "xml" | "channels" | "aliases" | "artwork">>(
      cacheKey,
    ).then((cached) => {
      if (!stopped && cached)
        setState((s) =>
          s.scope === scope ? { ...s, ...cached, loading: true } : s,
        );
    });
    let acknowledge: (() => void) | undefined;
    const unavailable = () => {
      if (!stopped) setState((s) => ({ ...s, loading: false, fallback: true }));
    };
    worker.onmessage = (
      e: MessageEvent<{
        ready?: boolean;
        programmes?: Record<string, Programme[]>;
        aliases?: Record<string, string>;
        artwork?: Record<string, string>;
        error?: string;
        partial?: boolean;
      }>,
    ) => {
      if (e.data.ready) {
        acknowledge?.();
        return;
      }
      if (e.data.partial) {
        acknowledge?.();
        if (!stopped) {
          setState((s) => s.scope === scope ? {
            ...s,
            xml: e.data.programmes ?? s.xml,
            aliases: e.data.aliases ?? s.aliases,
            artwork: e.data.artwork ?? s.artwork,
          } : s);
        }
        return;
      }
      controller.abort();
      acknowledge?.();
      clearTimeout(timer);
      if (!stopped) {
        const xml = e.data.programmes ?? {};
        const aliases = e.data.aliases ?? {};
        const artwork = e.data.artwork ?? {};
        setState((s) => ({
          ...s,
          xml,
          aliases,
          artwork,
          loading: false,
          fallback: !!e.data.error,
        }));
        if (!e.data.error)
          void writeLiveCache(cacheKey, {
            xml,
            channels: stateRef.current.channels,
            aliases,
            artwork,
          });
      }
      worker.terminate();
    };
    worker.onerror = () => {
      controller.abort();
      acknowledge?.();
      clearTimeout(timer);
      unavailable();
      worker.terminate();
    };
    async function send(message: { start?: boolean; chunk?: string; targetIds?: string[]; targetNames?: string[] }) {
      await new Promise<void>((resolve) => {
        acknowledge = resolve;
        worker.postMessage(message);
      });
    }
    async function load() {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const query = provider
          ? new URLSearchParams({
              username: provider.username,
              password: provider.password,
            })
          : undefined;
        const url =
          guideUrl ||
          (provider && query ? `${provider.server}/xmltv.php?${query}` : "");
        if (!url) throw new Error("Guide unavailable");
        const service = getService();
        let response = service
          ? await serviceRequest("/guide", { url }, controller.signal, service)
          : undefined;
        if (!response || response.status === 404)
          response = await sourceFetch(url, {
            signal: controller.signal,
            cache: "no-store",
            credentials: "omit",
            referrerPolicy: "no-referrer",
          });
        if (
          !response.ok ||
          !response.body ||
          Number(response.headers.get("content-length")) > 192_000_000
        )
          throw new Error("Guide unavailable");
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        await send({
          start: true,
          targetIds: ids.flatMap((item) => [item.id, item.epgId ?? ""]).filter(Boolean),
          targetNames: ids.map((item) => item.name),
        });
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 192_000_000) throw new Error("Guide too large");
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
    }, 180000);
    return () => {
      stopped = true;
      controller.abort();
      acknowledge?.();
      clearTimeout(timer);
      worker.terminate();
    };
  }, [guideUrl, provider, revision, refresh, scope]);
  useEffect(() => {
    if (!provider || stateRef.current.scope !== scope)
      return;
    const c = new AbortController();
    const queue = ids.filter(
      (i) =>
        !stateRef.current.channels[i.id] &&
        !stateRef.current.failed.includes(i.id) &&
        !stateRef.current.xml[i.epgId ?? ""],
    );
    let pending: Record<string, Programme[]> = {};
    let pendingFailed: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      flushTimer = undefined;
      if (
        c.signal.aborted ||
        (!Object.keys(pending).length && !pendingFailed.length)
      )
        return;
      const channels = pending;
      const failed = pendingFailed;
      pending = {};
      pendingFailed = [];
      setState((s) =>
        s.scope === scope
          ? {
              ...s,
              channels: { ...s.channels, ...channels },
              failed: [...s.failed, ...failed],
            }
          : s,
      );
    };
    const scheduleFlush = () => {
      if (!flushTimer) flushTimer = setTimeout(flush, 750);
    };
    async function consume() {
      while (queue.length && !c.signal.aborted) {
        const item = queue.shift()!;
        try {
          const list = await epg(provider!, item.id, c.signal);
          if (!c.signal.aborted) {
            pending[item.id] = list;
            scheduleFlush();
          }
        } catch {
          if (!c.signal.aborted) {
            pendingFailed.push(item.id);
            scheduleFlush();
          }
        }
      }
      flush();
      if (!c.signal.aborted) {
        const current = stateRef.current;
        void writeLiveCache(`guide:${scope}`, {
          xml: current.xml,
          channels: current.channels,
          aliases: current.aliases,
          artwork: current.artwork,
        });
      }
    }
    // Probe visible channels immediately while the full XMLTV feed streams in.
    // Batched state updates keep large providers responsive and allow guide and
    // Sports rows to appear before the complete feed has downloaded.
    void Promise.all(Array.from({ length: 3 }, consume));
    return () => {
      c.abort();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [
    provider,
    scope,
    signature,
    revision,
    refresh,
    state.loading,
    state.scope,
    state.fallback,
  ]);
  const valid = state.scope === scope ? state : empty;
  const aliasIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const [alias, id] of Object.entries(valid.aliases))
      index.set(normalizeGuideName(alias), id);
    return index;
  }, [valid.aliases]);
  const guideId = useCallback(
    (item: Item) =>
      (item.epgId && valid.xml[item.epgId] ? item.epgId : undefined) ??
      aliasIndex.get(normalizeGuideName(item.epgId ?? "")) ??
      aliasIndex.get(normalizeGuideName(item.name)),
    [aliasIndex, valid.xml],
  );
  const get = useCallback(
    (item: Item) =>
      valid.xml[guideId(item) ?? ""] ?? valid.channels[item.id] ?? [],
    [guideId, valid.channels, valid.xml],
  );
  const artwork = useCallback(
    (item: Item) => {
      const value = valid.artwork[guideId(item) ?? ""];
      return safeSourceUrl(value);
    },
    [guideId, valid.artwork],
  );
  const hasUpcoming = useCallback(
    (item: Item) =>
      (valid.xml[guideId(item) ?? ""] ?? valid.channels[item.id] ?? []).some(
        (programme) => programme.end > now,
      ),
    [guideId, now, valid.channels, valid.xml],
  );
  return {
    get,
    artwork,
    hasUpcoming,
    now,
    loading: valid.loading,
    fallback: valid.fallback,
    failed: (id: string) => valid.failed.includes(id),
    loaded: (item: Item) =>
      !!(valid.xml[guideId(item) ?? ""] || valid.channels[item.id]),
    count: Object.keys(valid.xml).length || Object.keys(valid.channels).length,
    unavailable:
      valid.fallback &&
      Object.keys(valid.channels).length === 0 &&
      new Set(valid.failed).size >= 3,
    probed:
      Object.keys(valid.xml).length +
      Object.keys(valid.channels).length +
      new Set(valid.failed).size,
  };
}

function normalizeGuideName(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/^\s*[a-z]{2,3}\s*[|:\-]\s*/i, "")
    .replace(/\b(?:uhd|fhd|hd|sd|4k|1080p|720p|raw)\b/gi, "")
    .replace(/[^a-z0-9]+/g, "");
}

function urlFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
