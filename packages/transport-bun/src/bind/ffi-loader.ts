import { dlopen, ptr, toArrayBuffer, type Pointer } from 'bun:ffi';
import type { BufferResult } from './types';
import { detectRuntime } from './utils';

const loaders: Record<
  string,
  Record<string, () => Promise<{ default: string }>>
> = {
  darwin: {
    arm64: () =>
      // @ts-expect-error
      import('../../lib/macos-arm64/libvulfram_core.dylib', {
        with: { type: 'file' },
      }),
    x64: () =>
      // @ts-expect-error
      import('../../lib/macos-x64/libvulfram_core.dylib', {
        with: { type: 'file' },
      }),
  },
  linux: {
    arm64: () =>
      // @ts-expect-error
      import('../../lib/linux-arm64/libvulfram_core.so', {
        with: { type: 'file' },
      }),
    x64: () =>
      // @ts-expect-error
      import('../../lib/linux-x64/libvulfram_core.so', {
        with: { type: 'file' },
      }),
  },
  win32: {
    arm64: () =>
      // @ts-expect-error
      import('../../lib/windows-arm64/vulfram_core.dll', {
        with: { type: 'file' },
      }),
    x64: () =>
      // @ts-expect-error
      import('../../lib/windows-x64/vulfram_core.dll', {
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
