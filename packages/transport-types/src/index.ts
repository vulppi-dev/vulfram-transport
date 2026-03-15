export type TransportBuffer = Uint8Array;

export type BufferResult = {
  buffer: TransportBuffer;
  result: number;
};

export type EngineTransport = {
  vulframInit: () => number;
  vulframDispose: () => number;
  vulframSendQueue: (buffer: TransportBuffer) => number;
  vulframReceiveQueue: () => BufferResult;
  vulframReceiveEvents: () => BufferResult;
  vulframUploadBuffer: (
    id: number,
    uploadType: number,
    buffer: TransportBuffer,
  ) => number;
  vulframTick: (timeMs: number, deltaMs: number) => number;
  vulframGetProfiling: () => BufferResult;
};

export type EngineTransportFactory = () => EngineTransport;
