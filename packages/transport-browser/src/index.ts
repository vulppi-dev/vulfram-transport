import type {
  EngineTransport,
  EngineTransportFactory,
  VulframChannel,
} from '@vulfram/transport-types';
import {
  VULFRAM_ENV_BASE_URL,
  VULFRAM_ENV_CHANNEL,
  VULFRAM_ENV_VERSION,
  buildArtifactUrl,
} from '@vulfram/transport-types';

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

function processEnv(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env?.[name];
}

function resolveBrowserFallbackArtifact(artifact: string): string | null {
  const version = processEnv(VULFRAM_ENV_VERSION);
  if (!version) return null;

  const baseUrl = processEnv(VULFRAM_ENV_BASE_URL);
  const channel =
    (processEnv(VULFRAM_ENV_CHANNEL) as VulframChannel | undefined) ?? 'alpha';

  return buildArtifactUrl({
    baseUrl,
    channel,
    version,
    binding: 'wasm',
    platform: 'browser',
    artifact,
  });
}

async function loadBindings(): Promise<WasmBindings> {
  if (bindings) return bindings;

  try {
    const localModulePath = '../lib/vulfram_core.js';
    bindings = (await import(
      /* @vite-ignore */ localModulePath
    )) as WasmBindings;
    return bindings;
  } catch (localError) {
    const remoteModule = resolveBrowserFallbackArtifact('vulfram_core.js');
    if (!remoteModule) {
      throw localError;
    }

    bindings = (await import(
      /* @vite-ignore */ remoteModule
    )) as WasmBindings;
    return bindings;
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
    if (moduleOrPath !== undefined) {
      throw error;
    }

    const fallbackWasmUrl = resolveBrowserFallbackArtifact(
      'vulfram_core_bg.wasm',
    );
    if (!fallbackWasmUrl) {
      throw error;
    }

    await wasm.default(fallbackWasmUrl);
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
