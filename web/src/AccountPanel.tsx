import { useEffect, useRef, useState } from "react";
import {
  account,
  avatars,
  avatarUrl,
  profiles,
  loadSetup,
  saveSetup,
  updateProfile,
  type Avatar,
  type Profile,
  type Setup,
} from "./account";
import { storeProvider } from "./storage";

export default function AccountPanel({
  setup,
  onLoad,
  onLoading,
  onChangeUser,
  skipProfileSelection,
  onSkipProfileSelection,
  onProfileUpdated,
}: {
  setup: Setup;
  onLoad: (s: Setup) => void;
  onLoading: (value: boolean) => void;
  onChangeUser: () => void;
  skipProfileSelection: boolean;
  onSkipProfileSelection: (value: boolean) => void;
  onProfileUpdated: (profile: {
    name: string;
    image?: string;
    color?: string;
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Profile | null>(null);
  const [catalog, setCatalog] = useState<Avatar[]>([]);
  const [chosenAvatar, setChosenAvatar] = useState<Avatar>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const initial = useRef("");
  const [lastSynced, setLastSynced] = useState<number>(() =>
    Number(localStorage.getItem("tiktak:last-sync") ?? 0),
  );

  useEffect(() => {
    let live = true;
    onLoading(true);
    void account.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session || !live) return;
        setEmail(data.session.user.email ?? "Signed in");
        const [available, avatarCatalog] = await Promise.all([
          profiles(),
          avatars().catch(() => []),
        ]);
        if (!live) return;
        setCatalog(avatarCatalog);
        const remembered = Number(
          localStorage.getItem(`tiktak:profile:${data.session.user.id}`),
        );
        const active =
          available.find((profile) => profile.profile_index === remembered) ??
          available[0] ??
          null;
        setSelected(active);
        if (active) {
          const avatar = avatarCatalog.find(
            (item) => item.id === active.avatar_id,
          );
          onProfileUpdated({
            name: active.name,
            image:
              active.avatar_url ?? (avatar ? avatarUrl(avatar) : undefined),
            color: active.avatar_color_hex,
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (live) onLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const next = JSON.stringify(setup);
    if (!initial.current) {
      initial.current = next;
      return;
    }
    if (next === initial.current) return;
    const timer = setTimeout(() => {
      setStatus("Saving changes…");
      void saveSetup(selected, setup)
        .then(() => {
          initial.current = next;
          const now = Date.now();
          setLastSynced(now);
          localStorage.setItem("tiktak:last-sync", String(now));
          setStatus("All changes saved to Nuvio.");
        })
        .catch((e) => setError(e.message));
    }, 1200);
    return () => clearTimeout(timer);
  }, [setup, selected]);

  const currentAvatar =
    chosenAvatar ?? catalog.find((avatar) => avatar.id === selected?.avatar_id);
  return (
    <div className="account-page-content">
      <section className="settings-card account-hero-card">
        <div
          className="account-avatar-large"
          style={{
            background:
              currentAvatar?.bg_color ??
              selected?.avatar_color_hex ??
              "#8E24AA",
          }}
        >
          {currentAvatar ? (
            <img src={avatarUrl(currentAvatar)} alt="" />
          ) : (
            selected?.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <span className="eyebrow">ACTIVE PROFILE</span>
          <h2>{selected?.name ?? "Nuvio profile"}</h2>
          <p>{email}</p>
          {status && <small role="status">{status}</small>}
        </div>
        <button onClick={onChangeUser}>Change user</button>
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {selected && (
        <section className="settings-card">
          <h2>Edit profile</h2>
          <p>Your name and avatar sync with the same profile in Nuvio.</p>
          <form
            className="account-profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(
                new FormData(event.currentTarget).get("name") ?? "",
              ).trim();
              if (!name) return;
              setBusy(true);
              setError("");
              void updateProfile(selected, { name, avatar: chosenAvatar })
                .then(async () => {
                  const refreshed = await profiles();
                  setSelected(
                    refreshed.find(
                      (profile) =>
                        profile.profile_index === selected.profile_index,
                    ) ?? { ...selected, name },
                  );
                  const avatar = chosenAvatar;
                  onProfileUpdated({
                    name,
                    image: avatar
                      ? avatarUrl(avatar)
                      : (selected.avatar_url ?? undefined),
                    color: avatar?.bg_color ?? selected.avatar_color_hex,
                  });
                  setStatus("Profile updated in Nuvio.");
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <label>
              Profile name
              <input
                name="name"
                defaultValue={selected.name}
                maxLength={40}
                required
              />
            </label>
            {catalog.length > 0 && (
              <fieldset className="avatar-picker">
                <legend>Profile image</legend>
                <div>
                  {catalog.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      className={
                        (chosenAvatar?.id ?? selected.avatar_id) === avatar.id
                          ? "selected"
                          : ""
                      }
                      onClick={() => setChosenAvatar(avatar)}
                      aria-label={`Use ${avatar.display_name || "avatar"}`}
                    >
                      <img src={avatarUrl(avatar)} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>
      )}
      <section className="settings-card account-actions">
        <div>
          <strong>Automatic sync</strong>
          <p>
            Add-ons, collections, playback settings, and preferences save
            automatically to this profile.
          </p>
          {lastSynced > 0 && (
            <small>Last synced {new Date(lastSynced).toLocaleString()}</small>
          )}
        </div>
        <button
          disabled={busy || !selected}
          onClick={() => {
            if (!selected) return;
            setBusy(true);
            setStatus("Syncing with Nuvio…");
            void loadSetup(selected)
              .then(({ setup: remote, warnings }) => {
                onLoad(remote);
                initial.current = JSON.stringify(remote);
                const now = Date.now();
                setLastSynced(now);
                localStorage.setItem("tiktak:last-sync", String(now));
                setStatus(
                  warnings.length
                    ? `Sync finished. ${warnings.join(" ")}`
                    : "Everything is synced with Nuvio.",
                );
              })
              .catch((reason) => setError(reason.message))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? "Syncing…" : "Sync now"}
        </button>
        <button
          onClick={() => {
            storeProvider(null, true);
            void account.auth
              .signOut({ scope: "local" })
              .then(() => onChangeUser());
          }}
        >
          Sign out
        </button>
      </section>
      <section className="settings-card preference-card">
        <div>
          <strong>Profile selection on launch</strong>
          <p>
            Skip the profile chooser on this device and open the last profile
            automatically.
          </p>
        </div>
        <label className="switch-control">
          <input
            type="checkbox"
            checked={skipProfileSelection}
            onChange={(event) => onSkipProfileSelection(event.target.checked)}
          />
          <span aria-hidden="true" />
          <em>{skipProfileSelection ? "Skip selector" : "Show selector"}</em>
        </label>
      </section>
    </div>
  );
}
