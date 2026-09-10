# Publish checklist

Tick one item at a time. Out of scope for v1: custom provider adapters, eval harness, streaming `infer()`, Judge field on `HealthStatus`.

## 0. Tracking

- [x] This file exists

## 1. Health

- [ ] `health()` / `health({})` is structural (empty key, missing `baseURL`) plus any status cached from `infer()`
- [ ] `health({ live: true })` probes frontier, balanced, and fast; `fallback` mirrors the fallback tier
- [ ] Live probes skip tiers that already fail structurally
- [ ] `HealthOptions` is public; constructor does not throw or ping

## 2. Bundled declarations

- [ ] tsup `dts: true`; build is `tsup` only
- [ ] `dist/` has a single `index.d.ts` (no router/classifier declaration tree)

## 3. Tests in git

- [ ] `tests/` is not gitignored
- [ ] `npm test` runs; `prepublishOnly` runs typecheck, test, and build
- [ ] Health tests cover structural and live (mocked) probes

## 4. README

- [ ] Install, config, supported providers, `infer()` unions, experimental metrics, `health()` vs live

## 5. Package identity

- [ ] LICENSE (ISC)
- [ ] author, keywords, version `0.1.0`, `engines.node`

## 6. Verify

- [ ] `npm test` && `npm run typecheck` && `npm run build`
- [ ] `npm pack --dry-run`
- [ ] `npm view axon-llmrouter` (name free)
- [ ] Optional live smoke (`infer` + `health({ live: true })`)
- [ ] `npm publish --dry-run` / publish
