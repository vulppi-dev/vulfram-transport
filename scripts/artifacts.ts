import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  VULFRAM_ENV_BASE_URL,
  VULFRAM_ENV_CHANNEL,
  VULFRAM_ENV_OFFLINE,
  VULFRAM_ENV_SKIP_DOWNLOAD,
  VULFRAM_ENV_VERSION,
  buildArtifactUrl,
  getArtifactFileName,
  resolveNativePlatform,
  type VulframBinding,
  type VulframChannel,
  type VulframPlatform,
} from '../packages/transport-types/src/index';

const rootDir = join(import.meta.dir, '..');

function env(name: string): string | undefined {
  return process.env?.[name];
}

function envBool(name: string): boolean {
  const raw = env(name)?.toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function ensureParent(path: string): Promise<void> {
  await ensureDir(dirname(path));
}

async function sha256File(path: string): Promise<string> {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await ensureParent(destination);
  await writeFile(destination, bytes);

  const hashUrl = `${url}.sha256`;
  const hashResponse = await fetch(hashUrl);
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

async function ensureArtifact(config: {
  binding: VulframBinding;
  platform: VulframPlatform;
  artifact: string;
  destination: string;
  baseUrl?: string;
  channel: VulframChannel;
  version: string;
}): Promise<void> {
  if (existsSync(config.destination)) return;

  const url = buildArtifactUrl({
    baseUrl: config.baseUrl,
    channel: config.channel,
    version: config.version,
    binding: config.binding,
    platform: config.platform,
    artifact: config.artifact,
  });

  await downloadFile(url, config.destination);
}

async function main(): Promise<void> {
  if (envBool(VULFRAM_ENV_SKIP_DOWNLOAD)) {
    console.log(
      `[postinstall] Skipping downloads (${VULFRAM_ENV_SKIP_DOWNLOAD}=true).`,
    );
    return;
  }

  if (envBool(VULFRAM_ENV_OFFLINE)) {
    console.log(
      `[postinstall] Offline mode enabled (${VULFRAM_ENV_OFFLINE}=true).`,
    );
    return;
  }

  const version = env(VULFRAM_ENV_VERSION);
  if (!version) {
    console.warn(
      `[postinstall] ${VULFRAM_ENV_VERSION} is not set; skipping transport artifact download.`,
    );
    return;
  }

  const baseUrl = env(VULFRAM_ENV_BASE_URL);
  const channel =
    (env(VULFRAM_ENV_CHANNEL) as VulframChannel | undefined) ?? 'alpha';

  const nativePlatform = resolveNativePlatform();
  const ffiName = getArtifactFileName('ffi', nativePlatform);
  const napiName = getArtifactFileName('napi', nativePlatform);

  const browserArtifacts = [
    'vulfram_core.js',
    'vulfram_core.d.ts',
    'vulfram_core_bg.wasm',
    'vulfram_core_bg.wasm.d.ts',
  ] as const;

  const tasks: Array<Promise<void>> = [
    ensureArtifact({
      binding: 'ffi',
      platform: nativePlatform,
      artifact: ffiName,
      destination: join(
        rootDir,
        'packages',
        'transport-bun',
        'lib',
        nativePlatform,
        ffiName,
      ),
      baseUrl,
      channel,
      version,
    }),
    ensureArtifact({
      binding: 'napi',
      platform: nativePlatform,
      artifact: napiName,
      destination: join(
        rootDir,
        'packages',
        'transport-napi',
        'lib',
        nativePlatform,
        napiName,
      ),
      baseUrl,
      channel,
      version,
    }),
    ...browserArtifacts.map((artifact) =>
      ensureArtifact({
        binding: 'wasm',
        platform: 'browser',
        artifact,
        destination: join(
          rootDir,
          'packages',
          'transport-browser',
          'lib',
          artifact,
        ),
        baseUrl,
        channel,
        version,
      }),
    ),
  ];

  const results = await Promise.allSettled(tasks);
  const failures = results.filter((result) => result.status === 'rejected');

  if (failures.length > 0) {
    console.warn(`[postinstall] ${failures.length} artifact download(s) failed.`);
    for (const failure of failures) {
      console.warn(`- ${(failure as PromiseRejectedResult).reason}`);
    }
    return;
  }

  console.log(
    `[postinstall] Transport artifacts ready for ${nativePlatform} (${channel}/${version}).`,
  );
}

main().catch((error) => {
  console.warn('[postinstall] Unexpected failure:', error);
});
