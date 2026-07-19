import type { PhotoObjectStat, PhotoStorage } from "../service/photoStorage.js";

/**
 * In-memory PhotoStorage for route tests. "Uploaded" objects are seeded with
 * `put()`; presigned URLs are deterministic fakes so assertions can match on
 * the embedded key.
 */
export class FakePhotoStorage implements PhotoStorage {
  readonly objects = new Map<string, PhotoObjectStat>();
  readonly deleted: string[] = [];

  put(key: string, stat: Partial<PhotoObjectStat> = {}): void {
    this.objects.set(key, { size: stat.size ?? 100, contentType: stat.contentType ?? "image/jpeg" });
  }

  presignUpload(key: string, contentType: string): Promise<string> {
    return Promise.resolve(
      `https://bucket.test/upload/${key}?ct=${encodeURIComponent(contentType)}&sig=fake`,
    );
  }

  presignDownload(key: string): Promise<string> {
    return Promise.resolve(`https://bucket.test/get/${key}?sig=fake`);
  }

  head(key: string): Promise<PhotoObjectStat | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  deleteAll(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.objects.delete(key);
      this.deleted.push(key);
    }
    return Promise.resolve();
  }
}
