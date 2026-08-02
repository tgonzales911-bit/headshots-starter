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

Verified against fal's live OpenAPI schemas (2026-08-02). The pipeline is
fully env-switchable — the trainer AND the inference endpoint must both flip,
because a FLUX.1 LoRA will not load on the FLUX.2 base model.

1. Set Vercel **Production** env for the test window (all four):
   - `FAL_MODEL_PORTRAIT_TRAINER` = `fal-ai/flux-2-trainer`
   - `FAL_MODEL_BASE_GENERATION` = `fal-ai/flux-2/lora`
   - `FAL_BASE_GUIDANCE_SCALE` = `3` (FLUX.2 inference wants 2–4; endpoint default 2.5)
   - `FAL_BASE_INFERENCE_STEPS` = `28` (endpoint max 50)
   Optional trainer knobs: `FAL_TRAINER_STEPS` (default 1000),
   `FAL_TRAINER_LEARNING_RATE` (FLUX.2 default 0.00005).
2. **Redeploy after saving the vars** — env changes only apply to new deploys.
3. Run one full order (train → generate → edit → composite → judge).
4. Revert the env vars after the run (or leave if B wins).

Schema notes (already handled in code, `kickoffPortraitTraining`):
- FLUX.2 trainer takes `image_data_url` (singular) and has NO
  `trigger_phrase` param — the trigger phrase is passed as
  `default_caption` instead. Trainer output is `diffusers_lora_file`,
  same field the webhook already reads.
- `fal-ai/flux-2/lora` accepts our exact payload: `image_size`
  `{width: 832, height: 1248}` (allowed 512–2048), `num_images: 4` (max 4),
  `loras: [{path, scale}]`, `guidance_scale`, `num_inference_steps`.

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
