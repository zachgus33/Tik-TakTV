import { createServer, getServerPort, redis, reddit } from "@devvit/web/server";
import type { TaskResponse } from "@devvit/web/server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  composePost,
  compareChanges,
  parseNotes,
  REPO,
  sources,
  SUBREDDIT,
  validRun,
  type Cursor,
  type ReleaseNotes,
  type Source,
  type WorkflowRun,
} from "../release";

const app = new Hono();
const API = `https://api.github.com/repos/${REPO}`;

async function github<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "tiktak-release-radar",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${path}`);
  return (await response.json()) as T;
}

async function runsFor(source: Source): Promise<WorkflowRun[]> {
  const result = await github<{ workflow_runs: WorkflowRun[] }>(
    `/actions/workflows/${source.workflow}/runs?branch=web-enhanced-pages&status=success&per_page=20`,
  );
  return result.workflow_runs.filter((run) => validRun(run, source)).sort((a, b) => a.id - b.id);
}

async function notesFor(source: Source, sha: string): Promise<ReleaseNotes> {
  const response = await github<{ content: string; encoding: string }>(
    `/contents/${source.versionFile}?ref=${encodeURIComponent(sha)}`,
  );
  if (response.encoding !== "base64") throw new Error("Unexpected GitHub content encoding");
  return parseNotes(source, Buffer.from(response.content, "base64").toString("utf8"));
}

async function changeSummary(previousSha: string, nextSha: string): Promise<string[]> {
  if (previousSha === nextSha) return [];
  try {
    const result = await github<{ commits: { commit: { message: string } }[] }>(
      `/compare/${encodeURIComponent(previousSha)}...${encodeURIComponent(nextSha)}`,
    );
    return compareChanges(result.commits.map((item) => item.commit.message));
  } catch (error) {
    console.warn("Could not compare commits; using the workflow commit message", error);
    return [];
  }
}

async function checkSource(source: Source): Promise<void> {
  const runs = await runsFor(source);
  if (!runs.length) return;
  const cursorKey = `radar:cursor:${source.key}`;
  const saved = await redis.get(cursorKey);
  if (!saved) {
    const latest = runs[runs.length - 1];
    const notes = await notesFor(source, latest.head_sha);
    await redis.set(cursorKey, JSON.stringify({ id: latest.id, sha: latest.head_sha, version: notes.version } satisfies Cursor));
    console.log(`Initialized ${source.key} at run ${latest.id}; existing releases will not be reposted`);
    return;
  }

  let cursor = JSON.parse(saved) as Cursor;
  for (const run of runs.filter((item) => item.id > cursor.id)) {
    const notes = await notesFor(source, run.head_sha);
    const changes = source.key === "web" && notes.version !== cursor.version && notes.changes.length
      ? []
      : await changeSummary(cursor.sha, run.head_sha);
    const post = composePost(
      source,
      { ...run, head_commit: { message: changes.join("\n") || run.head_commit?.message } },
      notes,
      cursor,
    );
    // Stable run URL in the post lets us recover after a successful submit but failed Redis write.
    const recent = await reddit.getNewPosts({ subredditName: SUBREDDIT, limit: 30 }).all();
    const alreadyPosted = recent.some((item) => item.body?.includes(run.html_url));
    if (!alreadyPosted) {
      const submitted = await reddit.submitPost({
        subredditName: SUBREDDIT,
        title: post.title,
        text: post.text,
        runAs: "APP",
      });
      try {
        const flairs = await reddit.getPostFlairTemplates(SUBREDDIT);
        const updateFlair = flairs.find((flair) => flair.text === "News & Updates");
        if (updateFlair) await reddit.setPostFlair({ subredditName: SUBREDDIT, postId: submitted.id, flairTemplateId: updateFlair.id });
      } catch (error) {
        console.warn("Post created, but flair could not be set", error);
      }
      console.log(`Posted ${source.key} run ${run.id}: ${submitted.id}`);
    }
    cursor = { id: run.id, sha: run.head_sha, version: notes.version };
    await redis.set(cursorKey, JSON.stringify(cursor));
  }
}

app.post("/internal/scheduler/check-releases", async (context) => {
  const errors: string[] = [];
  for (const source of sources) {
    try {
      await checkSource(source);
    } catch (error) {
      const message = `${source.key}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message);
      errors.push(message);
    }
  }
  return context.json<TaskResponse>({ status: errors.length ? "error" : "ok" }, errors.length ? 500 : 200);
});

serve({ fetch: app.fetch, createServer, port: getServerPort() });
