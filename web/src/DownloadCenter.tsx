import { useEffect, useState } from "react";
import { CheckCircle2, Download, Trash2, TriangleAlert } from "lucide-react";
import {
  clearDownloadJobs,
  downloadJobs,
  type DownloadJob,
  updateDownloadJob,
} from "./reliability";
import {
  completedDownloadUrl,
  downloadPreparationStatus,
} from "./connection";

export default function DownloadCenter() {
  const [jobs, setJobs] = useState<DownloadJob[]>(downloadJobs);
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
            if (!active) return;
            const megabytes = Number(status.bytes ?? 0) / 1_048_576;
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
                    ? `MP4 is ready${megabytes ? ` · ${megabytes.toFixed(1)} MB` : ""}. Tap below to download the completed file.`
                    : `Preparing the complete MP4 on the playback service${megabytes ? ` · ${megabytes.toFixed(1)} MB written` : ""}.`,
              at: Date.now(),
              bytes: status.bytes,
              url:
                status.status === "ready" && status.path
                  ? completedDownloadUrl(status.path)
                  : job.url,
            });
          } catch {
            // A temporary status failure must not turn a running Pi job into a
            // false failure. The next poll can recover it.
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
        <div className="download-jobs">
          {jobs.map((job) => (
            <article key={job.id}>
              {job.status === "failed" ? <TriangleAlert /> : <CheckCircle2 />}
              <div>
                <strong>{job.name}</strong>
                <p>{job.detail}</p>
                <small>{new Date(job.at).toLocaleString()}</small>
              </div>
              <span className={`badge ${job.status}`}>{job.status}</span>
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
                  {appleTouchBrowser ? "Open MP4 / Save to Files" : "Download MP4"}
                </a>
              )}
            </article>
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
