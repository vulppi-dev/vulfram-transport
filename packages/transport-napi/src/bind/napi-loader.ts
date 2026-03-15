import {
  VULFRAM_R2_DEFAULT_BASE_URL,
  buildArtifactUrl,
  getArtifactFileName,
  parsePackageArtifactTarget,
  resolveNativePlatform,
  selectPlatformLoader,
  type PlatformLoaderMap,
} from '@vulfram/transport-types';
import type { BufferResult } from './types';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { homedir } from 'os';
import { dirname, join } from 'path';

const requireNative = createRequire(import.meta.url);
const pkg = requireNative('../../package.json') as { version: string };
const { channel, artifactVersion } = parsePackageArtifactTarget(pkg.version);

const loaders: PlatformLoaderMap<{ default: string }> = {
  darwin: {
    arm64: () =>
      // @ts-expect-error
      import('../../lib/macos-arm64/vulfram_core.node', {
        with: { type: 'file' },
      }),
    x64: () =>
      // @ts-expect-error
      import('../../lib/macos-x64/vulfram_core.node', {
        with: { type: 'file' },
      }),
  },
  linux: {
    arm64: () =>
      // @ts-expect-error
      import('../../lib/linux-arm64/vulfram_core.node', {
        with: { type: 'file' },
      }),
    x64: () =>
      // @ts-expect-error
      import('../../lib/linux-x64/vulfram_core.node', {
        with: { type: 'file' },
      }),
  },
  win32: {
    arm64: () =>
      // @ts-expect-error
      import('../../lib/windows-arm64/vulfram_core.node', {
        with: { type: 'file' },
      }),
    x64: () =>
      // @ts-expect-error
      import('../../lib/windows-x64/vulfram_core.node', {
        with: { type: 'file' },
      }),
  },
};

function getCacheDir(): string {
  return join(homedir(), '.cache', 'vulfram-transport');
}

async function ensureFileDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function sha256File(path: string): Promise<string> {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function downloadArtifactWithHash(
  url: string,
  destination: string,
): Promise<void> {
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

async function resolveRemoteModulePath(): Promise<string> {
  const platform = resolveNativePlatform();
  const filename = getArtifactFileName('napi', platform);
  const remoteUrl = buildArtifactUrl({
    baseUrl: VULFRAM_R2_DEFAULT_BASE_URL,
    channel,
    artifactVersion,
    binding: 'napi',
    platform,
    artifact: filename,
  });

  const cachePath = join(
    getCacheDir(),
    'runtime',
    channel,
    artifactVersion,
    'napi',
    platform,
    filename,
  );

  if (!existsSync(cachePath)) {
    await downloadArtifactWithHash(remoteUrl, cachePath);
  }

  return cachePath;
}

async function resolveNativeModulePath(): Promise<string> {
  const importLoader = selectPlatformLoader(loaders, 'N-API');

  try {
    return (await importLoader()).default;
  } catch {
    return resolveRemoteModulePath();
  }
}

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
