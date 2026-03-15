import {
  VULFRAM_ENV_BASE_URL,
  VULFRAM_ENV_CHANNEL,
  VULFRAM_ENV_OFFLINE,
  VULFRAM_ENV_VERSION,
  VULFRAM_ENV_CACHE_DIR,
  buildArtifactUrl,
  getArtifactFileName,
  resolveNativePlatform,
  type VulframChannel,
} from '@vulfram/transport-types';
import type { BufferResult } from './types';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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

async function resolveNativeModulePath(): Promise<string> {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('napi', platform);
  const localPath = fileURLToPath(
    new URL(`../../lib/${platform}/${filename}`, import.meta.url),
  );

  if (existsSync(localPath)) return localPath;

  if (envBool(VULFRAM_ENV_OFFLINE)) {
    throw new Error(
      `N-API module not found locally (${localPath}) and offline mode is enabled.`,
    );
  }

  const version = env(VULFRAM_ENV_VERSION);
  if (!version) {
    throw new Error(
      `N-API module not found locally (${localPath}) and ${VULFRAM_ENV_VERSION} is not set for runtime fallback download.`,
    );
  }

  const channel = (env(VULFRAM_ENV_CHANNEL) as VulframChannel | undefined) ?? 'alpha';
  const baseUrl = env(VULFRAM_ENV_BASE_URL);
  const remoteUrl = buildArtifactUrl({
    baseUrl,
    channel,
    version,
    binding: 'napi',
    platform,
    artifact: filename,
  });

  const cachePath = join(
    getCacheDir(),
    'runtime',
    channel,
    version,
    'napi',
    platform,
    filename,
  );

  if (!existsSync(cachePath)) {
    await downloadArtifactWithHash(remoteUrl, cachePath);
  }

  return cachePath;
}

const requireNative = createRequire(import.meta.url);
const modulePath = await resolveNativeModulePath();
const raw = requireNative(modulePath) as {
  vulframInit: () => number;
  vulframDispose: () => number;
  vulframSendQueue: (buffer: Buffer) => number;
  vulframReceiveQueue: () => BufferResult;
  vulframReceiveEvents: () => BufferResult;
  vulframUploadBuffer: (
    id: number,
    uploadType: number,
    buffer: Buffer,
  ) => number;
  vulframTick: (timeMs: number, deltaMs: number) => number;
  vulframGetProfiling: () => BufferResult;
};

export const VULFRAM_CORE = {
  vulframInit: () => raw.vulframInit(),
  vulframDispose: () => raw.vulframDispose(),
  vulframReceiveQueue: () => raw.vulframReceiveQueue(),
  vulframReceiveEvents: () => raw.vulframReceiveEvents(),
  vulframTick: (timeMs: number, deltaMs: number) =>
    raw.vulframTick(timeMs, deltaMs),
  vulframGetProfiling: () => raw.vulframGetProfiling(),
  vulframSendQueue: (buffer: Uint8Array) => {
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return raw.vulframSendQueue(data);
  },
  vulframUploadBuffer: (
    id: number,
    uploadType: number,
    buffer: Uint8Array,
  ) => {
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return raw.vulframUploadBuffer(id, uploadType, data);
  },
};
