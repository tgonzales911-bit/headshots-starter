# A/B/C Model Test Protocol (Phase 2, Item 6)

Run three orders on the **same selfie set and the same badge/patch/brass/jacket
reference photos**, tracked as numbered models. Compare on:

1. **Identity consistency** across the 4-image set (the Model 30 failure: 2 of 4 faces drifted)
2. **Insignia fidelity** to the reference photos (badge/brass/patch match, no hallucination)
3. **Background consistency** across the set

The judge node scores land in `pipeline_events` (stage `judge`) for every order,
so each variant gets objective 1–10 scores on exactly these axes — compare the
score payloads, not just eyeballs.

## Variant A — control

Current pipeline as of Item 3 (canonical backdrop + reference-image edit).
No env changes. Run one order.

## Variant B — FLUX.2 [dev] LoRA base generation

1. Retrain the same selfie set on fal's FLUX.2 trainer (or TrainModelZone's
   FLUX.2 option when available). FLUX.2 tuning differs from FLUX.1:
   - LoRA rank 32 (up to 64 for complex identities)
   - guidance_scale ≈ 1 during training
   - Differential Output Preservation on, to fight overfit
2. Set Vercel env for the test window:
   - `FAL_MODEL_BASE_GENERATION` = the FLUX.2 LoRA inference endpoint
     (e.g. `fal-ai/flux-2/lora`)
   - `FAL_BASE_GUIDANCE_SCALE` = `3` (FLUX.2 inference wants 2–4)
   - `FAL_BASE_INFERENCE_STEPS` = `28` (adjust per endpoint docs)
3. Keep the reference-image Gemini edit pass unchanged. Run one order.
4. Revert the env vars after the run (or leave if B wins).

Note: `image_size` is passed as an explicit `{width: 832, height: 1248}`
object, which FLUX.2 endpoints also accept — no code change needed.

## Variant C — only if B still hallucinates insignia

Add region-scoped masked inpainting per insignia region (badge, collar points,
patch). This is a code change (SAM or box-mask per region + inpaint endpoint);
do not build it unless B's judge scores show badge_match/brass_match < 7.

## Decision rule

If B ≥ A on identity AND insignia fidelity is clean → adopt B, skip C entirely.

## Bookkeeping

- Name the models `AB-test-A`, `AB-test-B`, `AB-test-C` in TrainModelZone.
- Record judge scores from `/overview/models/[id]` (or `pipeline_events`) per
  variant in this file when done.

| Variant | Model # | face_match (avg) | badge_match | brass_match | background | Verdict |
|---------|---------|------------------|-------------|-------------|------------|---------|
| A       |         |                  |             |             |            |         |
| B       |         |                  |             |             |            |         |
| C       |         |                  |             |             |            |         |
