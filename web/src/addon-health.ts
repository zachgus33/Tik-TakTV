import type { Addon } from "./types";

const storageKey = "tiktak:addon-health";
const threshold = 3;
const quarantineMs = 15 * 60 * 1000;

export type AddonHealthState = {
  id: string;
  name: string;
  failures: number;
  lastFailure: number;
  quarantinedUntil: number;
};

const key = (addon: Addon) => addon.manifest.id || addon.manifest.name;

function readStates(): Record<string, AddonHealthState> {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function writeStates(states: Record<string, AddonHealthState>) {
  localStorage.setItem(storageKey, JSON.stringify(states));
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("addon-health-changed"));
}

export function addonHealth(addons: Addon[]) {
  const states = readStates();
  return addons
    .map((addon) => states[key(addon)])
    .filter((state): state is AddonHealthState => !!state);
}

export function addonQuarantined(addon: Addon, now = Date.now()) {
  return (readStates()[key(addon)]?.quarantinedUntil ?? 0) > now;
}

export function recordAddonSuccess(addon: Addon) {
  const states = readStates();
  if (!states[key(addon)]) return;
  delete states[key(addon)];
  writeStates(states);
}

export function recordAddonFailure(addon: Addon, reason?: unknown) {
  if (reason instanceof DOMException && reason.name === "AbortError") return;
  const states = readStates();
  const id = key(addon);
  const failures = (states[id]?.failures ?? 0) + 1;
  states[id] = {
    id,
    name: addon.manifest.name || id,
    failures,
    lastFailure: Date.now(),
    quarantinedUntil: failures >= threshold ? Date.now() + quarantineMs : 0,
  };
  writeStates(states);
}

export function clearAddonQuarantine(id?: string) {
  if (!id) {
    localStorage.removeItem(storageKey);
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("addon-health-changed"));
    return;
  }
  const states = readStates();
  delete states[id];
  writeStates(states);
}
