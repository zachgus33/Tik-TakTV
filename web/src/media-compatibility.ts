export function liveAudioCodec(userAgent: string): "aac" | "mp3" {
  const safari =
    /AppleWebKit/i.test(userAgent) &&
    /Safari/i.test(userAgent) &&
    !/(?:CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Edg|OPR|Brave)/i.test(
      userAgent,
    );
  // Native Safari HLS has the most reliable A/V timestamp handling with AAC.
  // The Chromium path keeps MP3, which is already verified against this relay.
  return safari ? "aac" : "mp3";
}
