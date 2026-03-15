import type {
  EngineTransport,
  EngineTransportFactory,
} from '@vulfram/transport-types';
import initWasm, {
  vulfram_dispose,
  vulfram_get_profiling,
  vulfram_init,
  vulfram_receive_events,
  vulfram_receive_queue,
  vulfram_send_queue,
  vulfram_tick,
  vulfram_upload_buffer,
  type BufferResult as WasmBufferResult,
  type InitInput,
} from '../lib/vulfram_core.js';

let initialized = false;

export async function initBrowserTransport(
  moduleOrPath?: InitInput | Promise<InitInput>,
): Promise<void> {
  if (initialized) return;
  await initWasm(moduleOrPath as InitInput | Promise<InitInput>);
  initialized = true;
}

function ensureInitialized(): void {
  if (!initialized) {
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

const transportImpl: EngineTransport = {
  vulframInit: () => {
    ensureInitialized();
    return vulfram_init();
  },
  vulframDispose: () => {
    ensureInitialized();
    return vulfram_dispose();
  },
  vulframSendQueue: (buffer) => {
    ensureInitialized();
    return vulfram_send_queue(buffer);
  },
  vulframReceiveQueue: () => {
    ensureInitialized();
    return unwrapBufferResult(vulfram_receive_queue());
  },
  vulframReceiveEvents: () => {
    ensureInitialized();
    return unwrapBufferResult(vulfram_receive_events());
  },
  vulframUploadBuffer: (id, uploadType, buffer) => {
    ensureInitialized();
    return vulfram_upload_buffer(BigInt(id), uploadType, buffer);
  },
  vulframTick: (timeMs, deltaMs) => {
    ensureInitialized();
    return vulfram_tick(timeMs, deltaMs);
  },
  vulframGetProfiling: () => {
    ensureInitialized();
    return unwrapBufferResult(vulfram_get_profiling());
  },
};

export const transportBrowser: EngineTransportFactory = () => {
  ensureInitialized();
  return transportImpl;
};

export const initWasmTransport = initBrowserTransport;
export const transportWasm = transportBrowser;
