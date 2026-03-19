# vulfram-transport

Transport monorepo for Vulfram, separated from `@vulfram/engine`.

## Packages

- `@vulfram/transport-types`: shared contracts and utility helpers.
- `@vulfram/transport-bun`: Bun FFI transport.
- `@vulfram/transport-napi`: Node.js N-API transport.
- `@vulfram/transport-browser`: browser transport (WASM).

## Artifact loading policy

- Transport packages load only bundled artifacts from their own `lib/` directories.
- Runtime fallback download from R2/CDN is disabled.
- The `bun scripts/artifacts.ts` pipeline clears package `lib/` targets before downloading new artifacts (preserving `.gitkeep`).

## Scripts

- `bun run artifacts`: baixa artefatos dos transports para `packages/*/lib`.
- `bun run version -- <semver>`: atualiza versão dos pacotes de transport.
- `bun run core-version`: consulta a versão do core via transport (`bun:ffi` no Bun, N-API no Node) com `CmdSystemBuildVersionGet`.
