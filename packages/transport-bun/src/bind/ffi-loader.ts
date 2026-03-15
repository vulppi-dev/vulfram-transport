import { dlopen, ptr, toArrayBuffer, type Pointer } from 'bun:ffi';
import {
  VULFRAM_ENV_BASE_URL,
  VULFRAM_ENV_CHANNEL,
  VULFRAM_ENV_OFFLINE,
  VULFRAM_ENV_VERSION,
  VULFRAM_ENV_CACHE_DIR,
  buildArtifactUrl,
  getArtifactFileName,
  resolveNativePlatform,
  type BufferResult,
  type VulframChannel,
} from '@vulfram/transport-types';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function env(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env?.[name];
}

function envBool(name: string): boolean {
  const raw = env(name)?.toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function getCacheDir(): string {
  return env(VULFRAM_ENV_CACHE_DIR) ?? join(homedir(), '.cache', 'vulfram-transport');
}

async function ensureFileDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function sha256File(path: string): Promise<string> {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function downloadArtifactWithHash(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download artifact: ${url} (${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await ensureFileDir(destination);
  await writeFile(destination, bytes);

  const hashResponse = await fetch(`${url}.sha256`);
  if (!hashResponse.ok) return;

  const expected = (await hashResponse.text()).trim().split(/\s+/)[0] ?? '';
  if (!expected) return;

  const actual = await sha256File(destination);
  if (actual !== expected) {
    throw new Error(
      `SHA256 mismatch for ${url}: expected=${expected} actual=${actual}`,
    );
  }
}

async function resolveNativeLibraryPath(): Promise<string> {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('ffi', platform);
  const localPath = fileURLToPath(
    new URL(`../../lib/${platform}/${filename}`, import.meta.url),
  );

  if (existsSync(localPath)) return localPath;

  if (envBool(VULFRAM_ENV_OFFLINE)) {
    throw new Error(
      `FFI library not found locally (${localPath}) and offline mode is enabled.`,
    );
  }

  const version = env(VULFRAM_ENV_VERSION);
  if (!version) {
    throw new Error(
      `FFI library not found locally (${localPath}) and ${VULFRAM_ENV_VERSION} is not set for runtime fallback download.`,
    );
  }

  const channel = (env(VULFRAM_ENV_CHANNEL) as VulframChannel | undefined) ?? 'alpha';
  const baseUrl = env(VULFRAM_ENV_BASE_URL);
  const remoteUrl = buildArtifactUrl({
    baseUrl,
    channel,
    version,
    binding: 'ffi',
    platform,
    artifact: filename,
  });

  const cachePath = join(
    getCacheDir(),
    'runtime',
    channel,
    version,
    'ffi',
    platform,
    filename,
  );

  if (!existsSync(cachePath)) {
    await downloadArtifactWithHash(remoteUrl, cachePath);
  }

  return cachePath;
}

const lib = await resolveNativeLibraryPath();

const { symbols: VULFRAM_CORE_DYLIB, close } = dlopen(lib, {
  vulfram_init: { args: [], returns: 'u32' },
  vulfram_dispose: { args: [], returns: 'u32' },
  vulfram_send_queue: { args: ['ptr', 'usize'], returns: 'u32' },
  vulfram_receive_queue: { args: ['ptr', 'ptr'], returns: 'u32' },
  vulfram_receive_events: { args: ['ptr', 'ptr'], returns: 'u32' },
  vulfram_upload_buffer: {
    args: ['u64', 'u32', 'ptr', 'usize'],
    returns: 'u32',
  },
  vulfram_tick: { args: ['u64', 'u32'], returns: 'u32' },
  vulfram_get_profiling: { args: ['ptr', 'ptr'], returns: 'u32' },
});

process.once('beforeExit', () => {
  close();
});

function vulframDispose(): number {
  return VULFRAM_CORE_DYLIB.vulfram_dispose();
}

function vulframInit(): number {
  return VULFRAM_CORE_DYLIB.vulfram_init();
}

function vulframReceiveQueue(): BufferResult {
  const ptrHolder = new BigUint64Array(1);
  const sizeHolder = new BigUint64Array(1);
  const result = VULFRAM_CORE_DYLIB.vulfram_receive_queue(
    ptr(ptrHolder),
    ptr(sizeHolder),
  );
  if (!sizeHolder[0]) {
    return { buffer: Buffer.alloc(0), result };
  }
  const srcPtr = Number(ptrHolder[0]) as Pointer;
  if (!srcPtr) {
    return { buffer: Buffer.alloc(0), result };
  }
  const buffer = Buffer.from(toArrayBuffer(srcPtr, 0, Number(sizeHolder[0])));

  return { buffer, result };
}

function vulframReceiveEvents(): BufferResult {
  const ptrHolder = new BigUint64Array(1);
  const sizeHolder = new BigUint64Array(1);
  const result = VULFRAM_CORE_DYLIB.vulfram_receive_events(
    ptr(ptrHolder),
    ptr(sizeHolder),
  );
  if (!sizeHolder[0]) {
    return { buffer: Buffer.alloc(0), result };
  }
  const srcPtr = Number(ptrHolder[0]) as Pointer;
  if (!srcPtr) {
    return { buffer: Buffer.alloc(0), result };
  }
  const buffer = Buffer.from(toArrayBuffer(srcPtr, 0, Number(sizeHolder[0])));

  return { buffer, result };
}

function vulframSendQueue(data: Uint8Array): number {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return VULFRAM_CORE_DYLIB.vulfram_send_queue(ptr(buffer), buffer.length);
}

function vulframTick(time: number, deltaTime: number): number {
  return VULFRAM_CORE_DYLIB.vulfram_tick(time, deltaTime);
}

function vulframUploadBuffer(
  id: number,
  uploadType: number,
  data: Uint8Array,
): number {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return VULFRAM_CORE_DYLIB.vulfram_upload_buffer(
    id,
    uploadType,
    ptr(buffer),
    buffer.length,
  );
}

function vulframGetProfiling(): BufferResult {
  const ptrHolder = new BigUint64Array(1);
  const sizeHolder = new BigUint64Array(1);
  const result = VULFRAM_CORE_DYLIB.vulfram_get_profiling(
    ptr(ptrHolder),
    ptr(sizeHolder),
  );
  if (!sizeHolder[0]) {
    return { buffer: Buffer.alloc(0), result };
  }
  const srcPtr = Number(ptrHolder[0]) as Pointer;
  if (!srcPtr) {
    return { buffer: Buffer.alloc(0), result };
  }
  const buffer = Buffer.from(toArrayBuffer(srcPtr, 0, Number(sizeHolder[0])));

  return { buffer, result };
}

export const VULFRAM_CORE = {
  vulframDispose,
  vulframInit,
  vulframReceiveQueue,
  vulframReceiveEvents,
  vulframSendQueue,
  vulframTick,
  vulframUploadBuffer,
  vulframGetProfiling,
};
