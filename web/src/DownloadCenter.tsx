import { useEffect, useState } from "react";
import { CheckCircle2, Download, Trash2, TriangleAlert } from "lucide-react";
import {
  clearDownloadJobs,
  downloadJobs,
  type DownloadJob,
  updateDownloadJob,
} from "./reliability";

export default function DownloadCenter() {
  const [jobs, setJobs] = useState<DownloadJob[]>(downloadJobs);
  useEffect(() => {
    const refresh = () => setJobs(downloadJobs());
    window.addEventListener("downloads-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
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
          <p>Recent MP4 preparation and browser downloads.</p>
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
                  download={job.name}
                  target="_blank"
                  rel="noopener"
                  onClick={(event) => {
                    if (appleTouchBrowser) {
                      event.preventDefault();
                      const opened = window.open(job.url!, "_blank");
                      if (opened) opened.opener = null;
                      else window.location.assign(job.url!);
                    }
                    updateDownloadJob({
                      ...job,
                      status: "started",
                      detail: "Download requested from the browser.",
                      at: Date.now(),
                    });
                  }}
                >
                  <Download size={16} /> Download MP4
                </a>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="hint">
        Browsers do not expose byte-level progress for files handed to their
        native download manager. On iPhone or iPad, use Open MP4 and then Share
        → Save to Files when Safari displays the video.
      </p>
    </section>
  );
}
