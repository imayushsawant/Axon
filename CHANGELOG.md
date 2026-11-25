# Changelog

## 0.2.0

- Add Jev as an optional Judge backend alongside LLM Judges, selected with
  `judge.provider: "jev"`. Existing Judge configurations continue to work.
- Evaluate the same four rubric axes in one TypeSafe System One request using
  built-in fetch, with no new dependency or Node runtime requirement.
- Route Jev errors directly to the configured fallback completion tier. No
  automatic second Judge, confidence threshold, or ranking of backend quality.
- Support backend selection in the evaluation harness with
  `AXON_JUDGE_PROVIDER=llm|jev`, and record the backend in run metadata.
- Include the previously ignored routing test suite in source control and release
  checks. Refresh two stale heuristic expectations to match existing Gate rules.
- Fix CommonJS loading of TanStack's ESM-only packages by loading providers on
  demand. Check built ESM and CommonJS entry points before publication.

Jev output is structured and its price is zero; the API can still report output
token usage. This release does not change Axon's experimental savings estimates
into measured token costs. Live accuracy and latency depend on the selected
backend and should be evaluated against the integrating application's workload.
