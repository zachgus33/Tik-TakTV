import type { Progress } from "./types";

const reminderWindowMs = 48 * 60 * 60 * 1000;

export type EpisodeReminder = {
  key: string;
  title: string;
  body: string;
  releasedAt: number;
};

function notificationStoreKey(profile: string) {
  return `tiktak:episode-notifications:${profile.trim().toLocaleLowerCase() || "local"}`;
}

export function dueEpisodeReminders(
  progress: Progress[],
  leadMinutes: number,
  now = Date.now(),
  notified = new Set<string>(),
): EpisodeReminder[] {
  const leadMs = Math.max(0, leadMinutes) * 60 * 1000;
  return progress
    .flatMap((entry) => {
      const release = entry.episode?.released;
      const releasedAt = release ? new Date(release).valueOf() : NaN;
      if (
        entry.item.type !== "series" ||
        !entry.episode ||
        !Number.isFinite(releasedAt)
      )
        return [];
      const key = `${entry.item.id}:${entry.episode.id}:${release}`;
      const reminderAt = releasedAt - leadMs;
      if (
        notified.has(key) ||
        reminderAt > now ||
        reminderAt < now - reminderWindowMs
      )
        return [];
      return [
        {
          key,
          title: `${entry.item.name} is ready`,
          body: `Season ${entry.episode.season}, episode ${entry.episode.episode}: ${entry.episode.name}`,
          releasedAt,
        },
      ];
    })
    .sort((left, right) => left.releasedAt - right.releasedAt)
    .slice(0, 5);
}

function readNotified(profile: string) {
  try {
    return new Set<string>(
      JSON.parse(localStorage.getItem(notificationStoreKey(profile)) || "[]"),
    );
  } catch {
    return new Set<string>();
  }
}

function saveNotified(profile: string, notified: Set<string>) {
  localStorage.setItem(
    notificationStoreKey(profile),
    JSON.stringify([...notified].slice(-500)),
  );
}

export async function notifyDueEpisodes(
  progress: Progress[],
  leadMinutes: number,
  profile: string,
) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    return 0;
  const notified = readNotified(profile);
  const reminders = dueEpisodeReminders(
    progress,
    leadMinutes,
    Date.now(),
    notified,
  );
  if (!reminders.length) return 0;
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker?.ready;
  } catch {
    registration = undefined;
  }
  let delivered = 0;
  for (const reminder of reminders) {
    try {
      if (registration)
        await registration.showNotification(reminder.title, {
          body: reminder.body,
          icon: "./icon-192.png",
          tag: `tiktak-release-${reminder.key}`,
        });
      else
        new Notification(reminder.title, {
          body: reminder.body,
          icon: "./icon-192.png",
          tag: `tiktak-release-${reminder.key}`,
        });
      notified.add(reminder.key);
      delivered += 1;
    } catch {
      // Permission can be revoked while the app is open. Leave this reminder
      // unmarked so a later foreground check can try again.
    }
  }
  if (delivered) saveNotified(profile, notified);
  return delivered;
}
