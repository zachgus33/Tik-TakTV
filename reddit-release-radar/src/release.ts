export const REPO = "zachgus33/Tik-TakTV";
export const SUBREDDIT = "TikTakTV";

export const sources = [
  {
    key: "web",
    workflow: "web-pages.yml",
    product: "Web/PWA",
    versionFile: "web/src/WhatsNew.tsx",
    destination: "https://www.tiktaktv.me/",
  },
  {
    key: "native-tv",
    workflow: "native-tv-android.yml",
    product: "Android TV / Fire TV",
    versionFile: "nativeTvApp/build.gradle.kts",
    destination: "https://github.com/zachgus33/Tik-TakTV/releases/tag/tv-latest",
  },
  {
    key: "legacy-tv",
    workflow: "tv-android-release.yml",
    product: "Android TV / Fire TV",
    versionFile: "tvApp/build.gradle.kts",
    destination: "https://github.com/zachgus33/Tik-TakTV/releases/tag/tv-latest",
  },
] as const;

export type Source = (typeof sources)[number];
export type WorkflowRun = {
  id: number;
  event: string;
  head_branch: string | null;
  head_sha: string;
  html_url: string;
  run_started_at: string;
  updated_at: string;
  conclusion: string | null;
  head_commit?: { message?: string };
};
export type Cursor = { id: number; sha: string; version: string | null };
export type ReleaseNotes = { version: string | null; title: string | null; changes: string[] };

export function validRun(run: WorkflowRun, source: Source): boolean {
  return (
    run.conclusion === "success" &&
    run.head_branch === "web-enhanced-pages" &&
    (run.event === "push" || (source.key !== "native-tv" && run.event === "workflow_dispatch"))
  );
}

export function parseNotes(source: Source, file: string): ReleaseNotes {
  if (source.key === "web") {
    const version = file.match(/export const latestRelease\s*=\s*"([^"]+)"/)?.[1] ?? null;
    const block = file.match(/export const releases\s*=\s*\[\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? "";
    const title = block.match(/title:\s*"([^"]+)"/)?.[1] ?? null;
    const changesBlock = block.match(/changes:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const changes = [...changesBlock.matchAll(/^\s*("(?:\\.|[^"\\])*")\s*,?\s*$/gm)]
      .map((match) => JSON.parse(match[1]) as string)
      .slice(0, 8);
    return { version, title, changes };
  }

  const version = file.match(/versionName\s*=\s*"([^"]+)"/)?.[1] ?? null;
  return { version, title: null, changes: [] };
}

export function commitChanges(message: string | undefined): string[] {
  return (message ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => line && !/^merge (pull request|branch)/i.test(line))
    .slice(0, 5);
}

export function compareChanges(messages: string[]): string[] {
  return [...new Set(messages
    .map((message) => message.split(/\r?\n/)[0].trim())
    .filter((line) => line && !/^merge (pull request|branch)/i.test(line))
    .filter((line) => !/^(docs?|chore|ci|test)(\(.+\))?:/i.test(line))
    .map((line) => line.replace(/^(feat|fix|perf|refactor)(\(.+\))?:\s*/i, "")))]
    .slice(0, 8);
}

export function composePost(
  source: Source,
  run: WorkflowRun,
  notes: ReleaseNotes,
  previous: Cursor,
): { title: string; text: string } {
  const newNotes = source.key === "web" && notes.version !== previous.version && notes.changes.length > 0;
  const changes = newNotes ? notes.changes : commitChanges(run.head_commit?.message);
  const version = notes.version ? ` ${notes.version}` : "";
  const title = `TikTak TV ${source.product} release${version} (${run.head_sha.slice(0, 7)})`;
  const intro = newNotes && notes.title ? `**${notes.title}**\n\n` : "";
  const bullets = (changes.length ? changes : ["A new release is available."])
    .map((change) => `- ${change}`)
    .join("\n");
  const label = source.key === "web" ? "Open the website" : "Download the TV app";
  const text = `${intro}**Improvements & fixes**\n\n${bullets}\n\n[${label}](${source.destination}) · [Build and release details](${run.html_url})\n\nQuestions or issues? Reply here with your device, app version, and steps to reproduce. Please hide account credentials, provider URLs, and tokens.`;
  return { title, text };
}
