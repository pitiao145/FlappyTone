/**
 * Ships accepted takes to the server without ever making Jane wait for them.
 *
 * She records unsupervised, probably on a phone, possibly on bad wifi. Two
 * rules follow: recording never blocks on the network, and nothing is lost if
 * the network drops. So takes go into a queue that drains in the background and
 * retries with backoff, and the word is only marked done once the server has
 * actually acknowledged it.
 *
 * A re-recorded word replaces the queued one rather than joining it — she has
 * decided the earlier take was wrong, and uploading both would race over the
 * same key.
 */

export type UploadStatus = "queued" | "uploading" | "done" | "failed";

export interface UploadState {
  /** Per-word status, keyed by word id. */
  byId: Record<string, UploadStatus>;
  pending: number;
  failed: number;
}

interface Job {
  id: string;
  blob: Blob;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 800;

export interface UploaderOptions {
  sessionId: string;
  passcode: string;
  onChange: (state: UploadState) => void;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export class Uploader {
  private queue: Job[] = [];
  /**
   * Takes that gave up, held so "retry" has something to send. Dropping the
   * blob on failure would make the button a lie and lose her recording.
   */
  private failedJobs = new Map<string, Job>();
  private byId: Record<string, UploadStatus> = {};
  /** The drain in flight, if any. Held so `flush` can await it. */
  private draining: Promise<void> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly options: UploaderOptions;

  constructor(options: UploaderOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? ((...a) => fetch(...a));
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  getState(): UploadState {
    const statuses = Object.values(this.byId);
    return {
      byId: { ...this.byId },
      pending: statuses.filter((s) => s === "queued" || s === "uploading").length,
      failed: statuses.filter((s) => s === "failed").length,
    };
  }

  /** Queues a take. Returns immediately; the upload happens behind her. */
  enqueue(id: string, blob: Blob): void {
    this.queue = this.queue.filter((j) => j.id !== id);
    this.failedJobs.delete(id);
    this.queue.push({ id, blob, attempts: 0 });
    this.byId[id] = "queued";
    this.emit();
    void this.drain();
  }

  /** Re-queues everything that gave up, for the "retry" button. */
  retryFailed(): void {
    for (const job of this.failedJobs.values()) {
      job.attempts = 0;
      this.queue.push(job);
      this.byId[job.id] = "queued";
    }
    this.failedJobs.clear();
    this.emit();
    void this.drain();
  }

  /** Resolves when the queue is empty — for the "all done" screen. */
  async flush(): Promise<void> {
    await this.drain();
  }

  private emit(): void {
    this.options.onChange(this.getState());
  }

  /**
   * Joins the running drain rather than starting a second one — two drains
   * would pop the same queue and upload jobs twice.
   */
  private drain(): Promise<void> {
    this.draining ??= this.runDrain().finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async runDrain(): Promise<void> {
    while (this.queue.length > 0) {
      const job = this.queue[0];
      // A word re-recorded while its predecessor was in flight has already
      // replaced this job in the queue; skip the stale one.
      if (this.byId[job.id] === "done") {
        this.queue.shift();
        continue;
      }
      this.byId[job.id] = "uploading";
      this.emit();

      const ok = await this.send(job);
      if (ok) {
        this.queue.shift();
        this.byId[job.id] = "done";
        this.emit();
        continue;
      }

      job.attempts++;
      if (job.attempts >= MAX_ATTEMPTS) {
        this.queue.shift();
        this.failedJobs.set(job.id, job);
        this.byId[job.id] = "failed";
        this.emit();
        continue;
      }
      this.byId[job.id] = "queued";
      this.emit();
      await this.sleep(BASE_BACKOFF_MS * 2 ** (job.attempts - 1));
    }
  }

  private async send(job: Job): Promise<boolean> {
    try {
      const params = new URLSearchParams({ id: job.id, session: this.options.sessionId });
      const res = await this.fetchImpl(`/api/upload?${params}`, {
        method: "POST",
        headers: {
          "content-type": "audio/wav",
          "x-record-passcode": this.options.passcode,
        },
        body: job.blob,
      });
      // A 4xx will fail identically forever — retrying it just delays the
      // moment she finds out. Only server and network faults are worth a retry.
      if (!res.ok && res.status >= 400 && res.status < 500) {
        job.attempts = MAX_ATTEMPTS;
        return false;
      }
      return res.ok;
    } catch {
      return false;
    }
  }
}
