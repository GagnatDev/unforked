import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Config } from "../config/env.js";
import { logger } from "../logger.js";

/** What a stored photo object looks like, as reported by a HEAD request. */
export interface PhotoObjectStat {
  size: number;
  contentType?: string;
}

/**
 * Object-storage seam for recipe photos. The browser talks to the bucket
 * directly via presigned URLs; the backend only mints those URLs and verifies/
 * deletes objects. Tests substitute an in-memory fake.
 */
export interface PhotoStorage {
  /** Presigned PUT URL. The client must send the same Content-Type and Cache-Control. */
  presignUpload(key: string, contentType: string, cacheControl: string): Promise<string>;
  /** Presigned GET URL, valid for `expiresInSeconds`. */
  presignDownload(key: string, expiresInSeconds: number): Promise<string>;
  /** Object metadata, or null when the object does not exist. */
  head(key: string): Promise<PhotoObjectStat | null>;
  /** Best-effort delete; failures are logged, never thrown. */
  deleteAll(keys: string[]): Promise<void>;
}

/** Upload URLs expire quickly: the client PUTs immediately after asking. */
const UPLOAD_EXPIRY_SECONDS = 15 * 60;

export function createS3PhotoStorage(config: S3Config): PhotoStorage {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

  return {
    presignUpload(key, contentType, cacheControl) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
        { expiresIn: UPLOAD_EXPIRY_SECONDS },
      );
    },

    presignDownload(key, expiresInSeconds) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    },

    async head(key) {
      try {
        const res = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return { size: res.ContentLength ?? 0, contentType: res.ContentType };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async deleteAll(keys) {
      await Promise.all(
        keys.map(async (key) => {
          try {
            await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
          } catch (err) {
            logger.warn({ err, key }, "failed to delete photo object");
          }
        }),
      );
    },
  };
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const name = (err as { name?: string }).name;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}
