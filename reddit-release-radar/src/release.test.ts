import assert from "node:assert/strict";
import { test } from "node:test";
import { commitChanges, compareChanges, composePost, parseNotes, sources, validRun, type WorkflowRun } from "./release.ts";

const run: WorkflowRun = {
  id: 123,
  event: "push",
  head_branch: "web-enhanced-pages",
  head_sha: "aabbccddeeff0011",
  html_url: "https://github.com/zachgus33/Tik-TakTV/actions/runs/123",
  run_started_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:20:00Z",
  conclusion: "success",
  head_commit: { message: "Fix streaming fallback\n\nPreserve configured add-on parameters" },
};

test("only completed production releases qualify", () => {
  assert.equal(validRun(run, sources[0]), true);
  assert.equal(validRun({ ...run, conclusion: "failure" }, sources[0]), false);
  assert.equal(validRun({ ...run, head_branch: "feature" }, sources[0]), false);
  assert.equal(validRun({ ...run, event: "pull_request" }, sources[0]), false);
  assert.equal(validRun({ ...run, event: "workflow_dispatch" }, sources[0]), true);
  assert.equal(validRun({ ...run, event: "workflow_dispatch" }, sources[1]), false);
});

test("website post uses curated What’s New only when its version advances", () => {
  const file = `export const latestRelease = "2026.11.12.2";\nexport const releases = [\n  {\n    version: latestRelease,\n    title: "Streaming fix",\n    changes: [\n      "Preserved add-on parameters.",\n      "Improved playback recovery.",\n    ],\n  },\n];`;
  const notes = parseNotes(sources[0], file);
  assert.deepEqual(notes, {
    version: "2026.11.12.2",
    title: "Streaming fix",
    changes: ["Preserved add-on parameters.", "Improved playback recovery."],
  });
  const post = composePost(sources[0], run, notes, { id: 122, sha: "old", version: "2026.11.12.1" });
  assert.match(post.title, /Web\/PWA release 2026\.11\.12\.2/);
  assert.match(post.text, /Preserved add-on parameters/);
  assert.match(post.text, /Build and release details/);
  const followup = composePost(sources[0], run, notes, { id: 122, sha: "old", version: notes.version });
  assert.match(followup.text, /Fix streaming fallback/);
  assert.doesNotMatch(followup.text, /Improved playback recovery/);
});

test("TV release uses its own version and install link", () => {
  const notes = parseNotes(sources[1], 'versionCode = 80\nversionName = "0.3.70"');
  const post = composePost(sources[1], run, notes, { id: 122, sha: "old", version: "0.3.69" });
  assert.match(post.title, /Android TV \/ Fire TV release 0\.3\.70/);
  assert.match(post.text, /releases\/tag\/tv-latest/);
  assert.deepEqual(commitChanges("Merge pull request #1\n\nFix app"), ["Fix app"]);
  assert.deepEqual(compareChanges(["Merge pull request #1", "docs: update guide", "fix: TV remote focus", "fix: TV remote focus"]), ["TV remote focus"]);
});
