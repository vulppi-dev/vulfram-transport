export function detectRuntime() {
  if (
    // @ts-ignore
    typeof globalThis.Deno !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.Deno?.version?.deno === 'string'
  ) {
    // @ts-ignore
    return { runtime: 'deno', version: globalThis.Deno.version.deno };
  }

  if (
    // @ts-ignore
    typeof globalThis.Bun !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.Bun?.version === 'string'
  ) {
    // @ts-ignore
    return { runtime: 'bun', version: globalThis.Bun.version };
  }

  if (
    // @ts-ignore
    typeof globalThis.process !== 'undefined' &&
    // @ts-ignore
    typeof globalThis.process?.versions?.node === 'string'
  ) {
    // @ts-ignore
    return { runtime: 'node', version: globalThis.process.versions.node };
  }

  return { runtime: 'unknown', version: null };
}
