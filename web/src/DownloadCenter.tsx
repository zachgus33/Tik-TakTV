import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  LoaderCircle,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  clearDownloadJobs,
  downloadJobs,
  removeDownloadJob,
  type DownloadJob,
  updateDownloadJob,
} from "./reliability";
import {
  completedDownloadUrl,
  cancelDownloadPreparation,
  DownloadStatusError,
  downloadPreparationStatus,
} from "./connection";

function preparationDetail(
  status: Awaited<ReturnType<typeof downloadPreparationStatus>>,
) {
  const megabytes = Number(status.bytes ?? 0) / 1_048_576;
  const processed = Math.max(0, Math.floor(Number(status.progressSeconds) || 0));
  const size = megabytes ? ` - ${megabytes.toFixed(1)} MB written` : "";
  const duration = processed
    ? ` - ${Math.floor(processed / 60)}m ${processed % 60}s processed`
    : "";
  const phase = status.stage === "transcode" ? "Converting" : "Copying";
  return `${phase} the source into a complete MP4 on the playback service${size}${duration}. No download starts until it finishes.`;
}

function readyDetail(bytes?: number) {
  const megabytes = Number(bytes ?? 0) / 1_048_576;
  return `MP4 is ready${megabytes ? ` - ${megabytes.toFixed(1)} MB` : ""}. Tap below to download the completed file.`;
}

export default function DownloadCenter() {
  const [jobs, setJobs] = useState<DownloadJob[]>(downloadJobs);
  const [action, setAction] = useState("");
  const cancelledIds = useRef(new Set<string>());
  useEffect(() => {
    const refresh = () => setJobs(downloadJobs());
    let active = true;
    const refreshPreparations = async () => {
      const preparing = downloadJobs().filter(
        (job) => job.status === "preparing" && job.statusPath,
      );
      await Promise.all(
        preparing.map(async (job) => {
          try {
            const status = await downloadPreparationStatus(job.statusPath!);
            if (!active || cancelledIds.current.has(job.id)) return;
            updateDownloadJob({
              ...job,
              status:
                status.status === "failed"
                  ? "failed"
                  : status.status === "ready"
                    ? "ready"
                    : "preparing",
              detail:
                status.status === "failed"
                  ? (status.error ?? "MP4 preparation failed.")
                  : status.status === "ready"
                    ? readyDetail(status.bytes)
                    : preparationDetail(status),
              // Viewing the manager cannot extend its 30-day retention.
              at: job.at,
              bytes: status.bytes,
              progressSeconds: status.progressSeconds,
              stage: status.stage,
              url:
                status.status === "ready" && status.path
                  ? completedDownloadUrl(status.path)
                  : job.url,
            });
          } catch (error) {
            if (!active || cancelledIds.current.has(job.id)) return;
            if (error instanceof DownloadStatusError && error.permanent) {
              updateDownloadJob({
                ...job,
                status: "failed",
                detail: `The temporary MP4 is no longer available: ${error.message}`,
                at: job.at,
              });
            } else {
              // Keep network/tunnel trouble retryable, but do not pretend the
              // companion is still making conversion progress.
              updateDownloadJob({
                ...job,
                detail: `Waiting to refresh preparation status: ${error instanceof Error ? error.message : "unknown error"} Retrying automatically.`,
                at: job.at,
              });
            }
          }
        }),
      );
    };
    window.addEventListener("downloads-changed", refresh);
    window.addEventListener("storage", refresh);
    void refreshPreparations();
    const timer = window.setInterval(() => void refreshPreparations(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("downloads-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const appleTouchBrowser =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const groups = [
    {
      id: "active",
      title: "Active",
      jobs: jobs.filter((job) => job.status === "preparing"),
    },
    {
      id: "ready",
      title: "Ready to download",
      jobs: jobs.filter((job) => job.status === "ready"),
    },
    {
      id: "history",
      title: "History",
      jobs: jobs.filter(
        (job) => job.status === "started" || job.status === "failed",
      ),
    },
  ].filter((group) => group.jobs.length > 0);
  const remove = async (job: DownloadJob) => {
    if (action) return;
    setAction(job.id);
    cancelledIds.current.add(job.id);
    try {
      if (job.statusPath && job.status !== "started")
        await cancelDownloadPreparation(job.statusPath).catch((error) => {
          if (!/not found|no longer available/i.test(String(error))) throw error;
        });
      removeDownloadJob(job.id);
    } catch (error) {
      cancelledIds.current.delete(job.id);
      updateDownloadJob({
        ...job,
        detail:
          error instanceof Error
            ? `Could not cancel: ${error.message}`
            : "Could not cancel this download.",
      });
    } finally {
      setAction("");
    }
  };
  return (
    <section className="settings-card download-center">
      <div className="card-heading">
        <Download />
        <div>
          <h2>Download center</h2>
          <p>Completed MP4 preparation and browser downloads.</p>
        </div>
        {jobs.length > 0 && (
          <button onClick={() => clearDownloadJobs()}>
            <Trash2 size={16} />
            Clear history
          </button>
        )}
      </div>
      {!jobs.length ? (
        <p className="empty-state">
          Downloads you start from a movie or episode will appear here.
        </p>
      ) : (
        <div className="download-groups">
          {groups.map((group) => (
            <section key={group.id}>
              <header>
                <h3>{group.title}</h3>
                <span>{group.jobs.length}</span>
              </header>
              <div className="download-jobs">
                {group.jobs.map((job) => (
                  <article key={job.id}>
                    {job.status === "failed" ? (
                      <TriangleAlert />
                    ) : job.status === "preparing" ? (
                      <LoaderCircle className="spin" />
                    ) : job.status === "started" ? (
                      <Clock3 />
                    ) : (
                      <CheckCircle2 />
                    )}
                    <div>
                      <strong>{job.name}</strong>
                      <p>{job.detail}</p>
                      <small>{new Date(job.at).toLocaleString()}</small>
                      {job.status === "preparing" && (
                        <progress
                          aria-label={`Preparing ${job.name}`}
                        />
                      )}
                    </div>
                    <span className={`badge ${job.status}`}>{job.status}</span>
                    <div className="download-job-actions">
                      {job.url && (
                        <a
                          className="download-job-action"
                          href={job.url}
                          download={appleTouchBrowser ? undefined : job.name}
                          rel="noopener"
                          onClick={() => {
                            updateDownloadJob({
                              ...job,
                              status: "started",
                              detail: "Download requested from the browser.",
                              at: Date.now(),
                            });
                          }}
                        >
                          <Download size={16} />
                          {appleTouchBrowser
                            ? "Open MP4 / Save to Files"
                            : "Download MP4"}
                        </a>
                      )}
                      <button
                        type="button"
                        disabled={action === job.id}
                        aria-label={`${job.status === "preparing" ? "Cancel" : "Remove"} ${job.name}`}
                        onClick={() => void remove(job)}
                      >
                        <X size={16} />
                        {job.status === "preparing" ? "Cancel" : "Remove"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="hint">
        TikTak finishes the MP4 on the playback service before showing the
        download button, so iPhone, iPad, PWA, and desktop receive a real file
        size instead of an indeterminate stream. Temporary files are removed
        after delivery or expiry.
      </p>
    </section>
  );
}
