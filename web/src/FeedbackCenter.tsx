import {
  Bug,
  CheckCircle2,
  ImagePlus,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { serviceRequest } from "./connection";

type FeedbackType = "bug" | "feature";
type FeedbackStatus = "new" | "reviewing" | "planned" | "completed" | "closed";
type Attachment = { name: string; type: string; data: string };
type FeedbackEntry = {
  id: string;
  type: FeedbackType;
  title: string;
  details: string;
  page: string;
  client: string;
  status: FeedbackStatus;
  createdAt: number;
  updatedAt: number;
  account: string;
  attachments: Attachment[];
};
type AdminResponse = {
  entries: FeedbackEntry[];
  counts: Partial<Record<FeedbackStatus, number>>;
};

const statuses: FeedbackStatus[] = [
  "new",
  "reviewing",
  "planned",
  "completed",
  "closed",
];

function clientName() {
  if (document.body.classList.contains("tv-mode")) return "android-tv";
  if (matchMedia("(display-mode: standalone)").matches) return "pwa";
  return matchMedia("(max-width: 600px)").matches
    ? "web-mobile"
    : "web-desktop";
}

async function imageAttachment(file: File): Promise<Attachment> {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Use a PNG, JPEG, WebP, or GIF image.");
  if (file.size > 2_000_000)
    throw new Error("Each image must be smaller than 2 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, data };
}

export default function FeedbackCenter() {
  const [type, setType] = useState<FeedbackType>("bug");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState<AdminResponse | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  async function loadAdmin() {
    setAdminBusy(true);
    try {
      const response = await serviceRequest("/feedback/admin", {
        action: "list",
      });
      setAdmin(response.ok ? ((await response.json()) as AdminResponse) : null);
    } catch {
      setAdmin(null);
    } finally {
      setAdminBusy(false);
    }
  }

  useEffect(() => {
    void loadAdmin();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await serviceRequest("/feedback/submit", {
        type,
        title: String(form.get("title") ?? ""),
        details: String(form.get("details") ?? ""),
        page: location.origin + location.pathname + location.hash,
        client: clientName(),
        attachments,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(result.error || "Your feedback could not be sent.");
      event.currentTarget.reset();
      setAttachments([]);
      setMessage(
        type === "bug"
          ? "Report sent. Thank you for helping improve TikTak TV."
          : "Feature request sent. Thank you for the idea.",
      );
      void loadAdmin();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your feedback could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function update(
    id: string,
    action: "update" | "delete",
    status?: FeedbackStatus,
  ) {
    setAdminBusy(true);
    try {
      const response = await serviceRequest("/feedback/admin", {
        action,
        id,
        status,
      });
      if (!response.ok) throw new Error("The inbox could not be updated.");
      setAdmin((await response.json()) as AdminResponse);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The inbox could not be updated.",
      );
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <div className="feedback-center">
      <section className="settings-card feedback-compose">
        <div className="card-heading">
          <MessageSquarePlus />
          <div>
            <h2>Feedback and requests</h2>
            <p>Send a report or idea directly to the TikTak TV owner.</p>
          </div>
        </div>
        <div
          className="feedback-type-tabs"
          role="tablist"
          aria-label="Feedback type"
        >
          <button
            type="button"
            className={type === "bug" ? "active" : ""}
            onClick={() => setType("bug")}
          >
            <Bug /> Report a problem
          </button>
          <button
            type="button"
            className={type === "feature" ? "active" : ""}
            onClick={() => setType("feature")}
          >
            <Lightbulb /> Request a feature
          </button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            {type === "bug" ? "What went wrong?" : "What would you like added?"}
            <input
              name="title"
              required
              minLength={5}
              maxLength={140}
              placeholder={
                type === "bug"
                  ? "Example: Live TV player will not open"
                  : "Example: Add a favorites row to YouTube"
              }
            />
          </label>
          <label>
            Details
            <textarea
              name="details"
              required
              minLength={10}
              maxLength={5000}
              rows={7}
              placeholder={
                type === "bug"
                  ? "Tell me what you selected, what happened, and what device or browser you used."
                  : "Explain how the feature should work and where you expect to find it."
              }
            />
          </label>
          <label className="feedback-attachment-button">
            <ImagePlus />
            Add screenshots
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              onChange={(event) => {
                const files = [...(event.target.files ?? [])].slice(
                  0,
                  Math.max(0, 3 - attachments.length),
                );
                void Promise.all(files.map(imageAttachment))
                  .then((images) =>
                    setAttachments((current) =>
                      [...current, ...images].slice(0, 3),
                    ),
                  )
                  .catch((reason) =>
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "The image could not be attached.",
                    ),
                  );
                event.currentTarget.value = "";
              }}
            />
          </label>
          {attachments.length > 0 && (
            <div
              className="feedback-previews"
              aria-label="Attached screenshots"
            >
              {attachments.map((attachment, index) => (
                <figure key={attachment.name + index}>
                  <img src={attachment.data} alt="" />
                  <figcaption>{attachment.name}</figcaption>
                  <button
                    type="button"
                    aria-label={"Remove " + attachment.name}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 />
                  </button>
                </figure>
              ))}
            </div>
          )}
          <div className="feedback-submit-row">
            <p>
              Up to three images, 2 MB each. Provider credentials, stream URLs,
              passwords, and API keys are never added automatically.
            </p>
            <button disabled={busy}>
              {busy ? (
                <RefreshCw className="spin" />
              ) : type === "bug" ? (
                <Bug />
              ) : (
                <Lightbulb />
              )}
              {busy
                ? "Sending..."
                : type === "bug"
                  ? "Send report"
                  : "Send request"}
            </button>
          </div>
          {message && (
            <p className="success" role="status">
              <CheckCircle2 /> {message}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>

      {admin && (
        <section className="settings-card feedback-inbox">
          <div className="card-heading">
            <MessageSquarePlus />
            <div>
              <h2>Private feedback inbox</h2>
              <p>
                Only your TikTak TV owner account can see these submissions.
              </p>
            </div>
            <button
              type="button"
              aria-label="Refresh feedback inbox"
              disabled={adminBusy}
              onClick={() => void loadAdmin()}
            >
              <RefreshCw className={adminBusy ? "spin" : ""} />
            </button>
          </div>
          <div className="feedback-counts">
            {statuses.map((status) => (
              <span key={status}>
                <strong>{admin.counts[status] ?? 0}</strong> {status}
              </span>
            ))}
          </div>
          {admin.entries.length === 0 ? (
            <div className="empty">
              <MessageSquarePlus />
              <h3>No feedback yet</h3>
              <p>New problem reports and feature requests will appear here.</p>
            </div>
          ) : (
            <div className="feedback-list">
              {admin.entries.map((entry) => (
                <article key={entry.id}>
                  <header>
                    <span className={"feedback-kind " + entry.type}>
                      {entry.type === "bug" ? <Bug /> : <Lightbulb />}
                      {entry.type === "bug" ? "Problem" : "Feature"}
                    </span>
                    <time>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(entry.createdAt))}
                    </time>
                  </header>
                  <h3>{entry.title}</h3>
                  <p>{entry.details}</p>
                  <small>
                    {entry.client} � account {entry.account} � {entry.page}
                  </small>
                  {entry.attachments.length > 0 && (
                    <div className="feedback-admin-images">
                      {entry.attachments.map((attachment, index) => (
                        <a
                          key={attachment.name + index}
                          href={attachment.data}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <img src={attachment.data} alt={attachment.name} />
                        </a>
                      ))}
                    </div>
                  )}
                  <footer>
                    <select
                      aria-label={"Status for " + entry.title}
                      value={entry.status}
                      disabled={adminBusy}
                      onChange={(event) =>
                        void update(
                          entry.id,
                          "update",
                          event.target.value as FeedbackStatus,
                        )
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status[0].toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={adminBusy}
                      onClick={() => void update(entry.id, "delete")}
                    >
                      <Trash2 /> Delete
                    </button>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
