import { afterEach, expect, it } from "vitest";
import { migrateLegacyTraktProfile, traktProfileIdentity } from "../src/trakt-profile";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

afterEach(() => { delete (globalThis as { localStorage?: Storage }).localStorage; });

it("migrates an existing Trakt login once and keeps same-name profiles separate", () => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  storage.setItem("tiktak:trakt:Mom", "existing-token");
  storage.setItem("tiktak:active-profile-owner", "account-a:1");
  migrateLegacyTraktProfile("Mom");
  expect(traktProfileIdentity("Mom")).toBe("profile:account-a:1");
  expect(storage.getItem("tiktak:trakt:profile%3Aaccount-a%3A1")).toBe("existing-token");
  expect(storage.getItem("tiktak:trakt:Mom")).toBeNull();
  storage.setItem("tiktak:active-profile-owner", "account-a:2");
  migrateLegacyTraktProfile("Mom");
  expect(traktProfileIdentity("Mom")).toBe("profile:account-a:2");
  expect(storage.getItem("tiktak:trakt:profile%3Aaccount-a%3A2")).toBeNull();
});
