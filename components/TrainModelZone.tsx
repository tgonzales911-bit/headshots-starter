"use client";

import InsigniaDropzone from "@/components/order/InsigniaDropzone";
import SelfieUploader from "@/components/order/SelfieUploader";
import {
  clearOrderDraft,
  loadOrderDraft,
  saveOrderDraft,
  type DraftPhoto,
} from "@/components/order/orderDraft";
import { SIGNED_OUT } from "@/components/order/photoUpload";
import { useSelfieUploads } from "@/components/order/useSelfieUploads";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  BACKDROP_OPTIONS,
  DELIVERY_PROMISE,
  ORDER_PRICE_LABEL,
  PORTRAITS_PER_ORDER,
  SELFIE_MAX,
  SELFIE_MIN,
  SELFIE_RECOMMENDED,
  SUPPORT_EMAIL,
} from "@/lib/site";
import {
  BRASS_COLORS,
  MAX_YEARS_OF_SERVICE,
  fileUploadFormSchema,
  orderNameFromCustomerName,
  type OrderFormValues,
} from "@/types/zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";

type InsigniaSlot = "badge" | "patch" | "brass" | "jacket";
type InsigniaState = Record<InsigniaSlot, DraftPhoto | null>;

const EMPTY_INSIGNIA: InsigniaState = { badge: null, patch: null, brass: null, jacket: null };

const DEFAULTS: OrderFormValues = {
  customerName: "",
  department: "",
  rank: "",
  rankDevice: "",
  badgeNumber: "",
  brassColor: "Gold / Polished Brass",
  needsStripes: false,
  stripeCount: "0",
  yearsOfService: "",
  needsChevrons: false,
  notes: "",
  background: "american_flag",
};

const BRASS_LABEL: Record<(typeof BRASS_COLORS)[number], string> = {
  "Gold / Polished Brass": "Gold",
  "Silver / Nickel": "Silver",
};

const ORDER_FAILED = `We could not start your order, and you have not been charged. Please try again in a minute. If it keeps happening, email ${SUPPORT_EMAIL}.`;

function Section({
  step,
  id,
  title,
  intro,
  children,
}: {
  step: number;
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t pt-8">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary font-display text-lg text-primary"
        >
          {step}
        </span>
        <h2 id={id} className="font-display text-2xl text-foreground">
          <span className="sr-only">Step {step}: </span>
          {title}
        </h2>
      </div>
      {intro && (
        <div className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
          {intro}
        </div>
      )}
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** Take only saved values that still fit the form; anything else falls back to the default. */
function fieldsFromDraft(saved: Record<string, unknown>): OrderFormValues {
  const next: Record<string, unknown> = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof OrderFormValues)[]) {
    if (typeof saved[key] === typeof DEFAULTS[key]) next[key] = saved[key];
  }
  if (!BACKDROP_OPTIONS.some((b) => b.key === next.background)) {
    next.background = DEFAULTS.background;
  }
  if (!(BRASS_COLORS as readonly unknown[]).includes(next.brassColor)) {
    next.brassColor = DEFAULTS.brassColor;
  }
  return next as OrderFormValues;
}

export default function TrainModelZone() {
  const router = useRouter();
  const uploads = useSelfieUploads();
  const [insignia, setInsignia] = useState<InsigniaState>(EMPTY_INSIGNIA);
  const [busySlots, setBusySlots] = useState<Record<InsigniaSlot, boolean>>({
    badge: false,
    patch: false,
    brass: false,
    jacket: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(fileUploadFormSchema),
    defaultValues: DEFAULTS,
    mode: "onTouched",
  });

  // --- Saved draft: restore once on arrival, then keep it current. ---------
  const restoreSelfies = uploads.restore;
  useEffect(() => {
    const draft = loadOrderDraft();
    if (draft) {
      form.reset(fieldsFromDraft(draft.fields));
      restoreSelfies(draft.selfies);
      setInsignia({
        badge: draft.insignia.badge ?? null,
        patch: draft.insignia.patch ?? null,
        brass: draft.insignia.brass ?? null,
        jacket: draft.insignia.jacket ?? null,
      });
    }
    setDraftReady(true);
    // Runs once: form and restoreSelfies are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = useRef({ items: uploads.items, insignia });
  latest.current = { items: uploads.items, insignia };

  const persist = useCallback(() => {
    const { items, insignia: ins } = latest.current;
    saveOrderDraft({
      fields: form.getValues(),
      selfies: items
        .filter((i) => i.status === "done" && i.url)
        .map((i) => ({ key: i.key, name: i.name, url: i.url as string, bytes: i.bytes })),
      insignia: {
        ...(ins.badge ? { badge: ins.badge } : {}),
        ...(ins.patch ? { patch: ins.patch } : {}),
        ...(ins.brass ? { brass: ins.brass } : {}),
        ...(ins.jacket ? { jacket: ins.jacket } : {}),
      },
    });
  }, [form]);

  useEffect(() => {
    if (!draftReady) return;
    const sub = form.watch(() => persist());
    return () => sub.unsubscribe();
  }, [draftReady, form, persist]);

  useEffect(() => {
    if (draftReady) persist();
  }, [draftReady, persist, uploads.items, insignia]);

  // --- Insignia slots -------------------------------------------------------
  const setBadge = useCallback((p: DraftPhoto | null) => setInsignia((s) => ({ ...s, badge: p })), []);
  const setPatch = useCallback((p: DraftPhoto | null) => setInsignia((s) => ({ ...s, patch: p })), []);
  const setBrass = useCallback((p: DraftPhoto | null) => setInsignia((s) => ({ ...s, brass: p })), []);
  const setJacket = useCallback((p: DraftPhoto | null) => setInsignia((s) => ({ ...s, jacket: p })), []);
  const busyBadge = useCallback((b: boolean) => setBusySlots((s) => ({ ...s, badge: b })), []);
  const busyPatch = useCallback((b: boolean) => setBusySlots((s) => ({ ...s, patch: b })), []);
  const busyBrass = useCallback((b: boolean) => setBusySlots((s) => ({ ...s, brass: b })), []);
  const busyJacket = useCallback((b: boolean) => setBusySlots((s) => ({ ...s, jacket: b })), []);

  // --- What is still missing -----------------------------------------------
  const [customerName, department, rank, background, needsStripes] = form.watch([
    "customerName",
    "department",
    "rank",
    "background",
    "needsStripes",
  ]);

  const selfiesDone = uploads.items.filter((i) => i.status === "done" && i.url);
  const selfiesPending = uploads.items.filter(
    (i) => i.status === "queued" || i.status === "uploading"
  ).length;

  const missing: string[] = [];
  const shortBy = SELFIE_MIN - selfiesDone.length;
  if (shortBy > 0) {
    missing.push(
      selfiesPending >= shortBy
        ? "your photos to finish uploading"
        : `${shortBy} more ${shortBy === 1 ? "photo" : "photos"} of your face`
    );
  } else if (selfiesPending > 0) {
    missing.push("your photos to finish uploading");
  }
  const insigniaNeeds: [InsigniaSlot, string][] = [
    ["badge", "badge photo"],
    ["patch", "shoulder patch photo"],
    ["brass", "collar brass photo"],
  ];
  for (const [slot, label] of insigniaNeeds) {
    if (!insignia[slot]) missing.push(busySlots[slot] ? `${label} to finish uploading` : label);
  }
  if (busySlots.jacket) missing.push("jacket photo to finish uploading");
  if (!customerName?.trim()) missing.push("your full name");
  if (!department?.trim()) missing.push("your department");
  if (!rank?.trim()) missing.push("your rank");

  const canSubmit = missing.length === 0 && !submitting;
  const backdrop = BACKDROP_OPTIONS.find((b) => b.key === background) ?? BACKDROP_OPTIONS[0];

  // --- Submit ---------------------------------------------------------------
  const onSubmit: SubmitHandler<OrderFormValues> = async (values) => {
    if (missing.length > 0 || submitting) return;
    const { badge, patch, brass, jacket } = insignia;
    if (!badge || !patch || !brass) return;

    setSubmitting(true);
    setSubmitError(null);

    const fd = new FormData();
    fd.append("urls", JSON.stringify(selfiesDone.map((i) => i.url)));
    fd.append("modelName", orderNameFromCustomerName(values.customerName));
    fd.append("type", "portrait");
    fd.append("uniform", "class_a");
    fd.append("background", values.background);
    fd.append("badge_url", badge.url);
    fd.append("patch_url", patch.url);
    fd.append("brass_url", brass.url);
    if (jacket) fd.append("jacket_url", jacket.url);
    fd.append("name", values.customerName.trim());
    fd.append("department", values.department.trim());
    fd.append("rank", values.rank.trim());
    fd.append("rankDevice", values.rankDevice.trim());
    fd.append("badgeNumber", values.badgeNumber.trim());
    fd.append("brassColor", values.brassColor);
    fd.append("stripeCount", values.needsStripes ? values.stripeCount || "0" : "0");
    fd.append("yearsOfService", values.yearsOfService || "0");
    fd.append("needsStripes", values.needsStripes ? "true" : "false");
    fd.append("needsChevrons", values.needsChevrons ? "true" : "false");
    fd.append("notes", values.notes.trim());

    let leaving = false;
    try {
      const response = await fetch("/api/train-model", { method: "POST", body: fd });
      const data = (await response.json().catch(() => ({}))) as {
        message?: unknown;
        checkoutUrl?: unknown;
        modelId?: unknown;
      };

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setSubmitError(SIGNED_OUT);
        } else if (
          response.status >= 400 &&
          response.status < 500 &&
          typeof data.message === "string" &&
          data.message.trim()
        ) {
          const msg = data.message.trim().replace(/[.\s]+$/, "");
          setSubmitError(
            `${msg}. You have not been charged. If this does not look right, email ${SUPPORT_EMAIL}.`
          );
        } else {
          console.error("[order] could not start order", response.status, data.message);
          setSubmitError(ORDER_FAILED);
        }
        return;
      }

      if (typeof data.checkoutUrl === "string" && data.checkoutUrl) {
        // The draft is kept on purpose: if checkout is cancelled the customer
        // lands back here with everything still filled in. It is cleared on the
        // order page once payment succeeds.
        leaving = true;
        window.location.assign(data.checkoutUrl);
        return;
      }

      // Order started without payment.
      clearOrderDraft();
      leaving = true;
      const id =
        typeof data.modelId === "number" || typeof data.modelId === "string"
          ? String(data.modelId)
          : "";
      router.push(id ? `/overview/models/${encodeURIComponent(id)}` : "/overview");
    } catch (e) {
      console.error("[order] could not start order", e);
      setSubmitError(ORDER_FAILED);
    } finally {
      if (!leaving) setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-10">
        <Section
          step={1}
          id="section-photos"
          title="Your photos"
          intro={
            <p>
              We learn your face from everyday photos of you. Add {SELFIE_MIN} to {SELFIE_MAX};{" "}
              {SELFIE_RECOMMENDED} gives the best likeness.
            </p>
          }
        >
          <ul className="max-w-prose list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
            <li>Different days, rooms, lighting and angles. Variety matters more than polish.</li>
            <li>Your face clearly visible. No hats, sunglasses or filters.</li>
            <li>Only you in the picture. No group shots.</li>
            <li>Include a few with the expression you want in your portrait.</li>
          </ul>
          <SelfieUploader uploads={uploads} />
        </Section>

        <Section
          step={2}
          id="section-insignia"
          title="Your insignia"
          intro={
            <p>
              Your portraits carry your own badge, patch and brass, copied from these photos. The
              sharper the photo, the truer the result. This is the step that matters most.
            </p>
          }
        >
          <div className="rounded-lg border border-primary/50 bg-primary/5 p-4 sm:p-5">
            <h3 className="text-base font-semibold text-foreground">For every insignia photo</h3>
            <ol className="mt-2 max-w-prose list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
              <li>Fill the frame with the item.</li>
              <li>
                Shoot straight on. Lay it flat and shoot from directly above, or hold the camera
                square to it.
              </li>
              <li>
                Use a plain background that contrasts: a dark item on light paper, or the reverse.
              </li>
              <li>
                Use soft, indirect light or open shade so polished metal does not glare. No flash.
              </li>
              <li>Tap the item to focus, then zoom in and check the lettering is sharp.</li>
            </ol>
          </div>

          <InsigniaDropzone
            slot="badge"
            title="Badge"
            required
            diagram="badge"
            instructions={<p>Take it off the uniform if you can, and lay it flat on plain paper.</p>}
            value={insignia.badge}
            onChange={setBadge}
            onBusyChange={busyBadge}
          />
          <InsigniaDropzone
            slot="patch"
            title="Shoulder patch"
            required
            diagram="patch"
            instructions={
              <p>
                Photograph it flat, not wrapped around the sleeve. A spare patch on a table is
                ideal; otherwise lay the sleeve flat and smooth it out.
              </p>
            }
            value={insignia.patch}
            onChange={setPatch}
            onBusyChange={busyPatch}
          />
          <InsigniaDropzone
            slot="brass"
            title="Collar brass"
            required
            diagram="brass"
            instructions={
              <p>
                One piece, close up. If your left and right pieces differ, photograph the left one
                and tell us in the special instructions below.
              </p>
            }
            value={insignia.brass}
            onChange={setBrass}
            onBusyChange={busyBrass}
          />
          <InsigniaDropzone
            slot="jacket"
            title="Class A jacket"
            instructions={
              <p>
                The front of your jacket, on a hanger or laid flat, with the whole jacket in the
                frame. If you skip this, we use a standard navy double-breasted Class A jacket.
              </p>
            }
            value={insignia.jacket}
            onChange={setJacket}
            onBusyChange={busyJacket}
          />
        </Section>

        <Section step={3} id="section-details" title="Your details">
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Full name</FormLabel>
                <FormControl>
                  <Input {...field} autoComplete="name" className="h-11" aria-required />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Department</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="organization"
                    placeholder="e.g. Springfield Fire Department"
                    className="h-11"
                    aria-required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="rank"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base">Rank or title</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    autoComplete="organization-title"
                    placeholder="e.g. Lieutenant"
                    className="h-11"
                    aria-required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <fieldset className="flex flex-col gap-6 rounded-lg border bg-card p-4 sm:p-5">
            <legend className="px-1 text-base font-semibold text-card-foreground">
              Optional details
            </legend>
            <p className="-mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
              For our reviewer — a person checks these against your portraits before delivery.
            </p>

            <FormField
              control={form.control}
              name="rankDevice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Rank collar device</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      autoComplete="off"
                      placeholder="e.g. two crossed bugles"
                      className="h-11"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="badgeNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Badge number</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="off" className="h-11 sm:max-w-[12rem]" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="brassColor"
              render={({ field }) => (
                <FormItem>
                  <p id="brass-colour-label" className="text-base font-medium leading-none">
                    Brass colour
                  </p>
                  <RadioGroup
                    aria-labelledby="brass-colour-label"
                    value={field.value}
                    onValueChange={field.onChange}
                    className="flex flex-wrap gap-2"
                  >
                    {BRASS_COLORS.map((c) => (
                      <Label
                        key={c}
                        htmlFor={`brass-${BRASS_LABEL[c]}`}
                        className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-md border bg-background px-4 text-base font-normal [&:has([data-state=checked])]:border-primary"
                      >
                        <RadioGroupItem value={c} id={`brass-${BRASS_LABEL[c]}`} />
                        {BRASS_LABEL[c]}
                      </Label>
                    ))}
                  </RadioGroup>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="needsStripes"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => {
                            field.onChange(e.target.checked);
                            if (e.target.checked && !Number(form.getValues("stripeCount"))) {
                              form.setValue("stripeCount", "1", { shouldValidate: true });
                            }
                          }}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          className="h-5 w-5 shrink-0 accent-primary"
                        />
                      </FormControl>
                      My jacket has sleeve stripes
                    </label>
                  </FormItem>
                )}
              />
              {needsStripes && (
                <FormField
                  control={form.control}
                  name="stripeCount"
                  render={({ field }) => (
                    <FormItem className="pl-8">
                      <FormLabel className="text-base">Stripes on each sleeve</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="numeric"
                          pattern="[0-6]"
                          maxLength={1}
                          autoComplete="off"
                          className="h-11 max-w-[6rem]"
                          onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                        />
                      </FormControl>
                      <FormDescription>0 to 6.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="yearsOfService"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">Years of service</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        maxLength={2}
                        autoComplete="off"
                        className="h-11 max-w-[6rem]"
                        onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                      />
                    </FormControl>
                    <FormDescription>Up to {MAX_YEARS_OF_SERVICE}.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="needsChevrons"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-base">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          className="h-5 w-5 shrink-0 accent-primary"
                        />
                      </FormControl>
                      My jacket has service chevrons
                    </label>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">Special instructions</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      autoComplete="off"
                      placeholder="e.g. My left and right collar brass are different."
                      className="min-h-[112px] text-base"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
        </Section>

        <Section
          step={4}
          id="section-backdrop"
          title="Backdrop"
          intro={<p>All {PORTRAITS_PER_ORDER} portraits share the backdrop you choose.</p>}
        >
          <FormField
            control={form.control}
            name="background"
            render={({ field }) => (
              <FormItem>
                <RadioGroup
                  aria-labelledby="section-backdrop"
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-3 sm:grid-cols-3"
                >
                  {BACKDROP_OPTIONS.map((b) => (
                    <Label
                      key={b.key}
                      htmlFor={`backdrop-${b.key}`}
                      className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border bg-card p-4 font-normal [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/10"
                    >
                      <RadioGroupItem value={b.key} id={`backdrop-${b.key}`} className="mt-1" />
                      <span className="flex flex-col gap-1">
                        <span className="text-base font-semibold leading-tight text-card-foreground">
                          {b.label}
                        </span>
                        <span className="text-sm leading-snug text-muted-foreground">
                          {b.description}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <section aria-labelledby="section-summary" className="rounded-lg border-2 border-primary/60 bg-card p-5 sm:p-6">
          <h2 id="section-summary" className="font-display text-2xl text-card-foreground">
            Your order
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base">
            <dt className="text-muted-foreground">Portraits</dt>
            <dd className="text-card-foreground">
              {PORTRAITS_PER_ORDER} finished Class A portraits
            </dd>
            <dt className="text-muted-foreground">Backdrop</dt>
            <dd className="text-card-foreground">{backdrop.label}</dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold text-card-foreground">
              {ORDER_PRICE_LABEL}, one payment
            </dd>
          </dl>

          {submitError && (
            <p role="alert" className="mt-5 rounded-md border border-destructive bg-destructive/15 p-3 text-sm leading-relaxed text-foreground">
              {submitError}
            </p>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
            aria-describedby="order-still-needed order-assurances"
            className="mt-5 h-auto min-h-[52px] w-full whitespace-normal px-4 py-3 text-base font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Opening secure checkout
              </>
            ) : (
              <>Continue to payment — {ORDER_PRICE_LABEL}</>
            )}
          </Button>

          <p id="order-still-needed" aria-live="polite" className="mt-3 text-sm leading-relaxed text-foreground">
            {missing.length > 0 && !submitting ? (
              <>
                <span className="font-semibold">Still needed: </span>
                {missing.join(", ")}.
              </>
            ) : null}
          </p>

          <div id="order-assurances" className="mt-4 space-y-1 border-t pt-4 text-sm leading-relaxed text-muted-foreground">
            <p>{DELIVERY_PROMISE}.</p>
            <p>Not satisfied? We regenerate your portraits at no extra cost.</p>
          </div>
        </section>
      </form>
    </Form>
  );
}
