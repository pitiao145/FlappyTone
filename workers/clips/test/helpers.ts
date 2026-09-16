/**
 * Shared fakes for the route tests: an in-memory R2 bucket that counts its
 * own `get` calls (the cache test asserts on that count), a fake
 * `caches.default`, and a minimal `Env`.
 */
import type { Env } from "../src/index.ts";

export interface FakeBucket {
  objects: Map<string, Uint8Array>;
  getCalls: number;
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null>;
  put(key: string, body: Uint8Array): Promise<void>;
}

export function fakeBucket(initial: Record<string, string> = {}): FakeBucket {
  const objects = new Map<string, Uint8Array>();
  for (const [k, v] of Object.entries(initial)) objects.set(k, new TextEncoder().encode(v));
  const bucket: FakeBucket = {
    objects,
    getCalls: 0,
    async get(key: string) {
      bucket.getCalls++;
      const bytes = objects.get(key);
      if (!bytes) return null;
      return {
        body: new Response(bytes).body as ReadableStream,
        httpEtag: `"etag-${key}"`,
      };
    },
    async put(key: string, body: Uint8Array) {
      objects.set(key, body);
    },
  };
  return bucket;
}

export interface FakeCache {
  store: Map<string, Response>;
  matchCalls: number;
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

export function installFakeCache(): FakeCache {
  const store = new Map<string, Response>();
  const cache: FakeCache = {
    store,
    matchCalls: 0,
    async match(req: Request) {
      cache.matchCalls++;
      const hit = store.get(req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req: Request, res: Response) {
      store.set(req.url, res);
    },
  };
  (globalThis as unknown as { caches: { default: FakeCache } }).caches = { default: cache };
  return cache;
}

export function fakeCtx(): ExecutionContext {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil(p: Promise<unknown>) {
      promises.push(p);
    },
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
}

export const TEST_SECRET = "test-clip-secret";
export const TEST_IP = "203.0.113.7";

export function fakeEnv(over: Partial<Env> = {}): Env {
  return {
    RAW: fakeBucket() as unknown as R2Bucket,
    CLIPS: fakeBucket() as unknown as R2Bucket,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    CLIP_TOKEN_SECRET: TEST_SECRET,
    RECORD_PASSCODES: '{"hunter2":"jane","mark-code":"mark"}',
    ALLOWED_ORIGINS: "https://flappytone.com",
    ...over,
  };
}
