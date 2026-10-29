import { createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [logPath, outputPath] = process.argv.slice(2);
const token = process.env.PLAYBACK_TOKEN;
if (!logPath || !outputPath || !token) process.exit(2);

const configured = process.env.PUBLIC_PLAYBACK_URL?.trim().replace(/\/$/, "");
let url;
if (configured) {
  const candidate = new URL(configured);
  if (
    candidate.protocol !== "https:" || candidate.username || candidate.password ||
    candidate.search || candidate.hash || candidate.pathname !== "/"
  ) process.exit(4);
  url = candidate.origin;
} else {
  const log = await readFile(logPath, "utf8");
  const urls = log.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/g) ?? [];
  url = urls.at(-1);
}
if (!url) process.exit(3);

let previous;
try {
  previous = JSON.parse(await readFile(outputPath, "utf8"));
} catch {}
if (previous?.url === url && previous?.signature) process.exit(0);

const updated = Date.now();
const signature = createHmac("sha256", token)
  .update(`${url}\n${updated}`)
  .digest("hex");
await writeFile(
  outputPath,
  `${JSON.stringify({ url, updated, signature })}\n`,
  { mode: 0o644 },
);
