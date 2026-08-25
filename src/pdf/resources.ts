export const MERGED_OUTPUT_OWNER = 'output:merged';
export const EXTRACTED_OUTPUT_OWNER = 'output:extracted';

export function thumbnailOwner(fileId: string, pageIndex: number): string {
  return `file:${fileId}:thumbnail:${pageIndex}`;
}

/** Releases a resource that arrived in a response which can no longer be accepted. */
export function discardWorkerResponseResources(response: unknown): void {
  if (!response || typeof response !== 'object') return;
  const payload = (response as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return;
  const candidate = payload as { url?: unknown; urls?: unknown };
  if (typeof candidate.url === 'string') URL.revokeObjectURL(candidate.url);
  if (Array.isArray(candidate.urls)) {
    for (const url of candidate.urls) {
      if (typeof url === 'string') URL.revokeObjectURL(url);
    }
  }
}

/** Owns every object URL created from a worker/client PDF resource. */
export class ResourceRegistry {
  private readonly owners = new Map<string, Set<string>>();

  create(owner: string, blob: Blob): string {
    this.release(owner);
    const url = URL.createObjectURL(blob);
    this.track(owner, url);
    return url;
  }

  adopt(owner: string, url: string | null | undefined): string | null {
    this.release(owner);
    if (!url) return null;
    this.track(owner, url);
    return url;
  }

  release(owner: string, fallbackUrls: Iterable<string | null | undefined> = []): void {
    const urls = new Set<string>(this.owners.get(owner) ?? []);
    for (const url of fallbackUrls) {
      if (url) urls.add(url);
    }
    this.owners.delete(owner);
    this.revoke(urls);
  }

  releaseFile(fileId: string, fallbackUrls: Iterable<string | null | undefined> = []): void {
    const prefix = `file:${fileId}:`;
    const urls = new Set<string>();
    for (const [owner, ownedUrls] of this.owners) {
      if (!owner.startsWith(prefix)) continue;
      for (const url of ownedUrls) urls.add(url);
      this.owners.delete(owner);
    }
    for (const url of fallbackUrls) {
      if (url) urls.add(url);
    }
    this.revoke(urls);
  }

  releaseAll(fallbackUrls: Iterable<string | null | undefined> = []): void {
    const urls = new Set<string>();
    for (const ownedUrls of this.owners.values()) {
      for (const url of ownedUrls) urls.add(url);
    }
    this.owners.clear();
    for (const url of fallbackUrls) {
      if (url) urls.add(url);
    }
    this.revoke(urls);
  }

  has(owner: string, url?: string): boolean {
    const ownedUrls = this.owners.get(owner);
    return Boolean(ownedUrls && (url ? ownedUrls.has(url) : ownedUrls.size > 0));
  }

  ownedUrlCount(): number {
    let count = 0;
    for (const urls of this.owners.values()) count += urls.size;
    return count;
  }

  private track(owner: string, url: string): void {
    const ownedUrls = this.owners.get(owner) ?? new Set<string>();
    ownedUrls.add(url);
    this.owners.set(owner, ownedUrls);
  }

  private revoke(urls: Iterable<string>): void {
    for (const url of urls) URL.revokeObjectURL(url);
  }
}
