import { useEffect, useRef, useState } from "react";
import { Tv } from "lucide-react";
import { sourceFetch } from "./connection";
import type { Item } from "./types";

const artworkCache = new Map<string, Promise<string>>();
let activeArtworkRequests = 0;
const artworkQueue: Array<() => void> = [];

async function withArtworkSlot<T>(work: () => Promise<T>) {
  if (activeArtworkRequests >= 6)
    await new Promise<void>((resolve) => artworkQueue.push(resolve));
  activeArtworkRequests += 1;
  try {
    return await work();
  } finally {
    activeArtworkRequests -= 1;
    artworkQueue.shift()?.();
  }
}

function initials(name: string) {
  return name
    .replace(/^\s*[^|]+\|\s*/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

async function relayedArtwork(url: string) {
  const existing = artworkCache.get(url);
  if (existing) return existing;
  const pending = withArtworkSlot(async () => {
    const response = await sourceFetch(
      url,
      { headers: { Accept: "image/*" } },
      true,
    );
    if (!response.ok) throw new Error("Artwork unavailable");
    const blob = await response.blob();
    if (!blob.size || blob.size > 5_000_000)
      throw new Error("Artwork unavailable");
    return URL.createObjectURL(blob);
  }).catch((error) => {
    artworkCache.delete(url);
    throw error;
  });
  artworkCache.set(url, pending);
  return pending;
}

export default function ChannelArt({
  channel,
  guideArtwork,
}: {
  channel: Item;
  guideArtwork?: string;
}) {
  const candidates = [guideArtwork, channel.poster, channel.background].filter(
    (value, index, values): value is string =>
      !!value && values.indexOf(value) === index,
  );
  const signature = candidates.join("|");
  const [index, setIndex] = useState(0);
  const [source, setSource] = useState(candidates[0] ?? "");
  const [failed, setFailed] = useState(!candidates.length);
  const objectUrl = useRef("");

  useEffect(() => {
    let cancelled = false;
    // Relayed images are shared by every matching channel card through the
    // module cache. Revoking one here breaks all of the other cards that use
    // the same blob URL (common for HD/SD variants of a channel).
    objectUrl.current = "";
    setIndex(0);
    const first = candidates[0] ?? "";
    setSource(first.startsWith("http:") ? "" : first);
    setFailed(!candidates.length);
    if (first.startsWith("http:"))
      void (async () => {
        for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
          const candidate = candidates[candidateIndex];
          if (!candidate.startsWith("http:")) {
            if (!cancelled) {
              setIndex(candidateIndex);
              setSource(candidate);
            }
            return;
          }
          try {
            const url = await relayedArtwork(candidate);
            if (cancelled) return;
            setIndex(candidateIndex);
            objectUrl.current = url;
            setSource(url);
            return;
          } catch {
            // Try the next guide or provider artwork URL.
          }
        }
        if (!cancelled) setFailed(true);
      })();
    return () => {
      cancelled = true;
      objectUrl.current = "";
    };
    // The joined signature intentionally resets this image only when a URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const tryNext = async () => {
    const current = candidates[index];
    if (!current) {
      setFailed(true);
      return;
    }
    try {
      const url = await relayedArtwork(current);
      objectUrl.current = url;
      setSource(objectUrl.current);
    } catch {
      for (let next = index + 1; next < candidates.length; next += 1) {
        setIndex(next);
        if (!candidates[next].startsWith("http:")) {
          setSource(candidates[next]);
          return;
        }
        try {
          const url = await relayedArtwork(candidates[next]);
          objectUrl.current = url;
          setSource(url);
          return;
        } catch {
          // Continue to the next provider or guide artwork candidate.
        }
      }
      setFailed(true);
    }
  };

  const displaySource = source.startsWith("http:") ? "" : source;
  return displaySource && !failed ? (
    <img
      src={displaySource}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => void tryNext()}
    />
  ) : (
    <div className="art-fallback channel-art-fallback" aria-hidden="true">
      <Tv />
      <span>{initials(channel.name)}</span>
    </div>
  );
}
