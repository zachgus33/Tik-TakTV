import { useEffect, useRef, useState } from "react";
import {
  account,
  profiles,
  unlock,
  loadSetup,
  saveSetup,
  type Profile,
  type Setup,
} from "./account";

export default function AccountPanel({
  setup,
  onLoad,
  onLoading,
}: {
  setup: Setup;
  onLoad: (s: Setup) => void;
  onLoading: (value: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [list, setList] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [auto, setAuto] = useState(false);
  const initial = useRef("");
  const autoOpening = useRef(false);
  const loadRef = useRef(onLoad);
  loadRef.current = onLoad;
  async function openDefaultProfile(available: Profile[], userId: string) {
    const remembered = Number(localStorage.getItem("tiktak:profile:" + userId));
    const profile =
      available.find((item) => item.profile_index === remembered) ??
      available.find((item) => !item.pin_enabled);
    if (profile && !profile.pin_enabled) await openProfile(profile);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account request failed.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    onLoading(true);
    void account.auth
      .getSession()
      .then(async ({ data }) => {
        if (!data.session || !live) return;
        setEmail(data.session.user.email ?? "Signed in");
        try {
          const p = await profiles();
          if (live) {
            setList(p);
          }
        } catch (e) {
          if (live) setError(String(e));
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) onLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  async function openProfile(p: Profile, pin = "") {
    onLoading(true);
    try {
      setAuto(false);
      await unlock(p, pin);
      const result = await loadSetup(p);
      const { data } = await account.auth.getSession();
      if (data.session)
        localStorage.setItem(
          "tiktak:profile:" + data.session.user.id,
          String(p.profile_index),
        );
      setSelected(p);
      initial.current = JSON.stringify(result.setup);
      loadRef.current(result.setup);
      // Seed a locally connected private relay into the account settings so a
      // fresh browser can restore it immediately after profile selection.
      setStatus(
        result.warnings.length
          ? `Nuvio profile loaded. ${result.warnings.join(" ")}`
          : "Nuvio profile loaded. Add-ons, collections and saved setup are available.",
      );
      setAuto(true);
      if (result.setup.playbackService)
        void saveSetup(p, result.setup).catch(() => {
          setStatus(
            "Profile loaded. Playback settings are available on this device; cloud save needs a retry.",
          );
        });
    } finally {
      onLoading(false);
    }
  }
  useEffect(() => {
    if (
      sessionStorage.getItem("tiktak:profile-active") !== "1" ||
      !email ||
      !list.length ||
      selected ||
      autoOpening.current
    )
      return;
    autoOpening.current = true;
    void account.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) return openDefaultProfile(list, data.session.user.id);
      })
      .catch((e) => {
        setError(
          e instanceof Error
            ? e.message
            : "Could not load the default profile.",
        );
        autoOpening.current = false;
      });
  }, [email, list, selected]);
  useEffect(() => {
    if (!auto || !selected || busy) return;
    const next = JSON.stringify(setup);
    if (next === initial.current) return;
    const timer = setTimeout(() => {
      setBusy(true);
      setStatus("Saving to Nuvio...");
      void saveSetup(selected, setup)
        .then(
          () => {
            initial.current = next;
            setStatus("Saved to your Nuvio account.");
          },
          (e) => {
            setError(e.message);
            setStatus(
              "Changes are saved on this device; cloud sync needs attention.",
            );
            setAuto(false);
          },
        )
        .finally(() => setBusy(false));
    }, 1800);
    return () => clearTimeout(timer);
  }, [setup, auto, selected, busy]);
  return (
    <section className="settings-card">
      <h2>Nuvio account</h2>
      <p>
        Sign in with your existing Nuvio account to bring over profiles,
        configured add-ons and collections. Your web setup, including saved IPTV
        and TorBox connections, can sync to your private account settings.
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {!email ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            const data = new FormData(f);
            void run(async () => {
              const { data: auth, error } =
                await account.auth.signInWithPassword({
                  email: String(data.get("email")).trim(),
                  password: String(data.get("password")),
                });
              if (error) throw new Error(error.message);
              sessionStorage.setItem("tiktak:profile-active", "1");
              setEmail(auth.user?.email ?? "Signed in");
              const available = await profiles();
              setList(available);
              f.reset();
              if (auth.user) {
                autoOpening.current = true;
                await openDefaultProfile(available, auth.user.id);
              }
            });
          }}
        >
          <label>
            Nuvio email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Nuvio password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy}>Sign in to Nuvio</button>
          <a href="https://nuvio.tv" target="_blank" rel="noreferrer">
            Create a Nuvio account
          </a>
        </form>
      ) : (
        <>
          <p>Signed in as {email}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const p = list.find(
                (p) => String(p.profile_index) === data.get("profile"),
              );
              if (p)
                void run(() => openProfile(p, String(data.get("pin") ?? "")));
            }}
          >
            <label>
              Nuvio profile
              <select name="profile">
                {list.map((p) => (
                  <option key={p.profile_index} value={p.profile_index}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Profile PIN (if required)
              <input
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
              />
            </label>
            <button disabled={busy || !list.length}>Load Nuvio profile</button>
          </form>
          {selected && (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={auto}
                  onChange={(e) => setAuto(e.target.checked)}
                />
                Automatically save changes to this Nuvio profile
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await saveSetup(selected, setup);
                    initial.current = JSON.stringify(setup);
                    setStatus("Saved to your Nuvio account.");
                  })
                }
              >
                Save setup to Nuvio now
              </button>
            </>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setAuto(false);
                const { error } = await account.auth.signOut({
                  scope: "local",
                });
                if (error) throw error;
                setEmail("");
                setList([]);
                setSelected(null);
                autoOpening.current = false;
                setStatus("Signed out. Device settings remain available.");
              })
            }
          >
            Sign out of Nuvio
          </button>
        </>
      )}
    </section>
  );
}
