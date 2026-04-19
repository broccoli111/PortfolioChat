# Reference assets

Drop the reference avatar PNG here as `reference/avatar.png` (transparent
background preferred; any crop is fine as long as the full head is in frame).

The tracing pipeline in `scripts/trace/` reads this file to produce:

- `reference/traced-raw.svg` — raw color-aware vector trace from `vtracer`
- `reference/traced-layered.svg` — the trace re-split into the component's
  `<g id="head" />`, `<g id="hair" />`, `<g id="beard" />`, `<g id="glasses" />`
  (etc.) groups so it's animation-friendly
- `reference/compare.png` — a side-by-side image (original | trace) used to
  visually verify the trace matches before we commit it

Run the pipeline with:

```bash
npm run trace
```
