import type { EngineTransport, EngineTransportFactory } from '@vulfram/transport-types';
import { detectRuntime } from '@vulfram/transport-types';

export type InitInput = unknown | Promise<unknown>;

type WasmBufferResult = {
  result: number;
  takeBuffer: () => Uint8Array;
  free: () => void;
};

type WasmBindings = {
  default: (moduleOrPath?: InitInput) => Promise<unknown>;
  vulfram_dispose: () => number;
  vulfram_get_profiling: () => WasmBufferResult;
  vulfram_init: () => number;
  vulfram_receive_events: () => WasmBufferResult;
  vulfram_receive_queue: () => WasmBufferResult;
  vulfram_send_queue: (data: Uint8Array) => number;
  vulfram_tick: (timeMs: number, deltaMs: number) => number;
  vulfram_upload_buffer: (
    id: bigint,
    uploadType: number,
    data: Uint8Array,
  ) => number;
};

let initialized = false;
let bindings: WasmBindings | null = null;

async function loadBindings(): Promise<WasmBindings> {
  if (bindings) return bindings;

  const localModulePath = '../lib/vulfram_core.js';

  try {
    bindings = (await import(
      /* @vite-ignore */ localModulePath
    )) as WasmBindings;
    return bindings;
  } catch (error) {
    const runtime = detectRuntime();
    throw new Error(
      `Failed to load browser transport module (runtime=${runtime.runtime}, platform=${runtime.platform ?? 'unknown'}, arch=${runtime.arch ?? 'unknown'}, expected=${localModulePath}): ${String(error)}`,
    );
  }
}

function ensureInitialized(): void {
  if (!initialized || !bindings) {
    throw new Error(
      'Browser transport not initialized. Call initBrowserTransport() first.',
    );
  }
}

function unwrapBufferResult(result: WasmBufferResult): {
  buffer: Uint8Array;
  result: number;
} {
  const buffer = result.takeBuffer();
  const code = result.result;
  result.free();
  return { buffer, result: code };
}

export async function initBrowserTransport(
  moduleOrPath?: InitInput,
): Promise<void> {
  if (initialized) return;
  const wasm = await loadBindings();

  try {
    await wasm.default(moduleOrPath);
  } catch (error) {
    const runtime = detectRuntime();
    const expectedArtifact =
      moduleOrPath === undefined ? '../lib/vulfram_core_bg.wasm' : 'custom-init-input';
    throw new Error(
      `Failed to initialize browser transport (runtime=${runtime.runtime}, platform=${runtime.platform ?? 'unknown'}, arch=${runtime.arch ?? 'unknown'}, expected=${expectedArtifact}): ${String(error)}`,
    );
  }

  initialized = true;
}

const transportImpl: EngineTransport = {
  vulframInit: () => {
    ensureInitialized();
    return bindings!.vulfram_init();
  },
  vulframDispose: () => {
    ensureInitialized();
    return bindings!.vulfram_dispose();
  },
  vulframSendQueue: (buffer) => {
    ensureInitialized();
    return bindings!.vulfram_send_queue(buffer);
  },
  vulframReceiveQueue: () => {
    ensureInitialized();
    return unwrapBufferResult(bindings!.vulfram_receive_queue());
  },
  vulframReceiveEvents: () => {
    ensureInitialized();
    return unwrapBufferResult(bindings!.vulfram_receive_events());
  },
  vulframUploadBuffer: (id, uploadType, buffer) => {
    ensureInitialized();
    return bindings!.vulfram_upload_buffer(BigInt(id), uploadType, buffer);
  },
  vulframTick: (timeMs, deltaMs) => {
    ensureInitialized();
    return bindings!.vulfram_tick(timeMs, deltaMs);
  },
  vulframGetProfiling: () => {
    ensureInitialized();
    return unwrapBufferResult(bindings!.vulfram_get_profiling());
  },
};

export const transportBrowser: EngineTransportFactory = () => {
  ensureInitialized();
  return transportImpl;
};

export const initWasmTransport = initBrowserTransport;
export const transportWasm = transportBrowser;
