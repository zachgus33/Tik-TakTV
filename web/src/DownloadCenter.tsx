import { useEffect, useState } from "react";
import { CheckCircle2, Download, Trash2, TriangleAlert } from "lucide-react";
import {
  clearDownloadJobs,
  downloadJobs,
  type DownloadJob,
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
            </article>
          ))}
        </div>
      )}
      <p className="hint">
        Browsers do not expose byte-level progress for files handed to their
        native download manager. “Started” means the MP4 was prepared and
        transferred to your browser.
      </p>
    </section>
  );
}
