import type { BufferResult } from './types';
import { detectRuntime } from './utils';

console.log(process.platform, process.arch);

const loaders: Record<
  string,
  Record<string, () => Promise<{ default: any }>>
> = {
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

const importLoader = loaders[process.platform]?.[process.arch];

if (!importLoader) {
  throw new Error(
    `FFI build not found for the current runtime: ${JSON.stringify(
      detectRuntime(),
    )}`,
  );
}

const lib = await importLoader().then((mod) => mod.default);

const raw = lib as {
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
