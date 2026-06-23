import path from "path";
import { PassThrough } from "stream";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as tar from "tar";
import { databaseLogger } from "./logger.js";
import { saveMemoryDatabaseToFile, databasePaths } from "../database/db/index.js";

/**
 * Off-site backups of the entire DATA_DIR to a Cloudflare R2 bucket (S3-compatible).
 *
 * Fork addition (not in upstream). Self-contained so it survives upstream syncs:
 * the only touch point in shared code is a single dynamic import in
 * initializeDatabase(). No-op unless BACKUP_ENABLED=true and R2_* are set.
 *
 * Why code-level instead of a host cron: this flushes the in-memory database to
 * disk via saveMemoryDatabaseToFile() *before* archiving, so the snapshot is
 * consistent and current — a `docker cp` cron can only grab a file that is up to
 * 5 minutes stale (see the periodic save in database/db/index.ts).
 */

interface BackupConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  keepCount: number;
  intervalHours: number;
  runOnStart: boolean;
}

const TEMP_SUFFIXES = [".tmp", ".encrypted.tmp", "-wal", "-shm"];

let running = false;
let started = false;

function readConfig(): BackupConfig | null {
  if (process.env.BACKUP_ENABLED !== "true") {
    databaseLogger.info("R2 backup disabled (set BACKUP_ENABLED=true to enable)", {
      operation: "r2_backup_disabled",
    });
    return null;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    databaseLogger.warn(
      "R2 backup enabled but missing required env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) — skipping",
      { operation: "r2_backup_misconfigured" },
    );
    return null;
  }

  const keepCount = Math.max(1, parseInt(process.env.BACKUP_KEEP_COUNT || "30", 10));
  const intervalHours = Math.max(
    1,
    parseInt(process.env.BACKUP_INTERVAL_HOURS || "12", 10),
  );

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    prefix: (process.env.R2_PREFIX || "data-backups").replace(/\/+$/, ""),
    keepCount,
    intervalHours,
    runOnStart: process.env.BACKUP_RUN_ON_START !== "false",
  };
}

function makeClient(cfg: BackupConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // R2 rejects aws-sdk v3's default checksum behaviour; only send when required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function uploadArchive(client: S3Client, cfg: BackupConfig): Promise<string> {
  const dataDir = databasePaths.directory; // resolved DATA_DIR
  const parent = path.dirname(dataDir);
  const base = path.basename(dataDir);
  const key = `${cfg.prefix}/backup-${timestamp()}.tar.gz`;

  // Stream tar.gz straight to R2 — no temp file on disk. tar's Pack isn't a Node
  // Readable, so pipe it through a PassThrough and forward errors to it.
  const archive = new PassThrough();
  const pack = tar.create(
    {
      gzip: true,
      cwd: parent,
      // Skip transient DB/temp files that would be inconsistent or useless.
      filter: (p) => !TEMP_SUFFIXES.some((s) => p.endsWith(s)),
    },
    [base],
  );
  pack.on("error", (err: unknown) =>
    archive.destroy(err instanceof Error ? err : new Error(String(err))),
  );
  pack.pipe(archive);

  const upload = new Upload({
    client,
    params: {
      Bucket: cfg.bucket,
      Key: key,
      Body: archive,
      ContentType: "application/gzip",
    },
  });
  await upload.done();
  return key;
}

interface BackupObject {
  key: string;
  lastModified?: Date;
}

async function listBackups(
  client: S3Client,
  cfg: BackupConfig,
): Promise<BackupObject[]> {
  const objects: BackupObject[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: cfg.bucket,
        Prefix: `${cfg.prefix}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents || []) {
      if (obj.Key && obj.Key.endsWith(".tar.gz")) {
        objects.push({ key: obj.Key, lastModified: obj.LastModified });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

/**
 * True if the newest backup is younger than the configured interval (minus a
 * small tolerance for timer jitter). Gates the actual upload so container
 * restarts / runOnStart can't spam extra backups — the schedule is enforced by
 * what's actually in the bucket, not by the in-process timer.
 */
function hasRecentBackup(objects: BackupObject[], cfg: BackupConfig): boolean {
  const newest = objects.reduce<Date | null>((max, o) => {
    if (!o.lastModified) return max;
    return !max || o.lastModified > max ? o.lastModified : max;
  }, null);
  if (!newest) return false;
  const intervalMs = cfg.intervalHours * 60 * 60 * 1000;
  const toleranceMs = 30 * 60 * 1000; // absorb timer jitter so we don't skip a real cycle
  return Date.now() - newest.getTime() < intervalMs - toleranceMs;
}

/**
 * Count-based retention: keep the newest cfg.keepCount, delete only the
 * surplus. Never deletes when we have <= keepCount, so the bucket always
 * holds up to keepCount and the freshest backups survive — even if uploads
 * have been failing and only pruning runs.
 */
async function prune(
  client: S3Client,
  cfg: BackupConfig,
  objects: BackupObject[],
): Promise<number> {
  // Keys embed a UTC timestamp, so lexical sort == chronological.
  const keys = objects.map((o) => o.key).sort();
  const toDelete = keys.slice(0, Math.max(0, keys.length - cfg.keepCount));
  if (toDelete.length === 0) return 0;

  await client.send(
    new DeleteObjectsCommand({
      Bucket: cfg.bucket,
      Delete: { Objects: toDelete.map((Key) => ({ Key })) },
    }),
  );
  return toDelete.length;
}

async function runBackup(client: S3Client, cfg: BackupConfig): Promise<void> {
  if (running) {
    databaseLogger.warn("Skipping R2 backup — previous run still in progress", {
      operation: "r2_backup_overlap",
    });
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    // 0. Skip the upload if a recent backup already exists (restart / runOnStart
    //    safety) — but ALWAYS prune so the count cap is enforced regardless.
    const existing = await listBackups(client, cfg);
    if (hasRecentBackup(existing, cfg)) {
      const pruned = await prune(client, cfg, existing);
      databaseLogger.info(
        `R2 backup skipped — a backup within the last ${cfg.intervalHours}h already exists (pruned ${pruned}, keeping ${cfg.keepCount})`,
        { operation: "r2_backup_skipped_recent", pruned },
      );
      return;
    }
    // 1. Force a consistent, current on-disk snapshot of the in-memory DB.
    await saveMemoryDatabaseToFile();
    // 2. Archive + upload the whole data dir.
    const key = await uploadArchive(client, cfg);
    // 3. Keep only the newest N by count (oldest deleted only when over cap).
    const pruned = await prune(client, cfg, [...existing, { key }]);
    databaseLogger.info(
      `R2 backup complete: ${key} (${Math.round((Date.now() - startedAt) / 1000)}s, pruned ${pruned}, keeping ${cfg.keepCount})`,
      { operation: "r2_backup_success", key, pruned },
    );
  } catch (error) {
    databaseLogger.error("R2 backup failed", error, {
      operation: "r2_backup_failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    running = false;
  }
}

export function startR2BackupScheduler(): void {
  if (started) return;
  const cfg = readConfig();
  if (!cfg) return;
  started = true;

  const client = makeClient(cfg);
  const intervalMs = cfg.intervalHours * 60 * 60 * 1000;

  databaseLogger.info(
    `R2 backup scheduler started: every ${cfg.intervalHours}h, keep last ${cfg.keepCount}, bucket ${cfg.bucket}/${cfg.prefix}`,
    { operation: "r2_backup_started" },
  );

  if (cfg.runOnStart) {
    // Small delay so startup isn't competing with the first backup.
    setTimeout(() => void runBackup(client, cfg), 60 * 1000);
  }
  const timer = setInterval(() => void runBackup(client, cfg), intervalMs);
  // Don't keep the event loop alive solely for backups.
  if (typeof timer.unref === "function") timer.unref();
}
