import { cn } from "@/lib/utils";
import { DELIVERY_PROMISE, ORDER_STEPS, customerStatus } from "@/lib/site";
import { Check } from "lucide-react";

/**
 * The order's journey as a vertical ladder: finished rungs are solid gold,
 * the current rung is ringed and carries the one-sentence explanation.
 */
export default function OrderProgress({ status }: { status: string }) {
  const s = customerStatus(status);
  const current = s.step;

  return (
    <section aria-labelledby="order-progress-heading" className="rounded-lg border bg-card p-5 sm:p-6">
      <h2 id="order-progress-heading" className="font-display text-xl text-card-foreground">
        Where your order is
      </h2>
      <ol className="mt-5">
        {ORDER_STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? "current" : "upcoming";
          const last = i === ORDER_STEPS.length - 1;
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-0.5",
                    state === "done" ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  state === "done" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-background text-primary",
                  state === "upcoming" && "border-border bg-background text-muted-foreground"
                )}
              >
                {state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 pt-1">
                <p
                  className={cn(
                    "text-base leading-tight",
                    state === "current" && "font-semibold text-card-foreground",
                    state === "done" && "text-card-foreground",
                    state === "upcoming" && "text-muted-foreground"
                  )}
                >
                  {label}
                  <span className="sr-only">
                    {state === "done" ? " (complete)" : state === "current" ? " (in progress)" : " (not started)"}
                  </span>
                </p>
                {state === "current" && (
                  <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
                    {s.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">{DELIVERY_PROMISE}.</p>
    </section>
  );
}
