import { useEffect, useRef, useState } from "react";
import { Tv } from "lucide-react";
import { sourceFetch } from "./connection";
import type { Item } from "./types";

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
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setIndex(0);
    setSource(candidates[0] ?? "");
    setFailed(!candidates.length);
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
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
      const response = await sourceFetch(
        current,
        { headers: { Accept: "image/*" } },
        true,
      );
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.toLowerCase().startsWith("image/"))
        throw new Error("Artwork unavailable");
      const blob = await response.blob();
      if (!blob.size || blob.size > 5_000_000)
        throw new Error("Artwork unavailable");
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setSource(objectUrl.current);
    } catch {
      const next = index + 1;
      if (next < candidates.length) {
        setIndex(next);
        setSource(candidates[next]);
      } else setFailed(true);
    }
  };

  return source && !failed ? (
    <img
      src={source}
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
