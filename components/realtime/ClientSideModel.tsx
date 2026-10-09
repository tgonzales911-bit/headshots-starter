"use client";

import OrderProgress from "@/components/order/OrderProgress";
import PortraitGallery from "@/components/order/PortraitGallery";
import StatusBadge from "@/components/order/StatusBadge";
import { clearOrderDraft } from "@/components/order/orderDraft";
import { ORDER_NAME_FALLBACK, formatOrderDate } from "@/components/order/orderHelpers";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL, customerStatus, isInFlight } from "@/lib/site";
import { Database } from "@/types/supabase";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export type OrderView = {
  id: number;
  status: string;
  createdAt: string;
  customerName: string;
};

type ClientSideModelProps = {
  order: OrderView;
  /** The finished portraits. Empty until the order is finished. */
  finalUrls: string[];
  /** The customer's own uploaded photos of their face. */
  selfies: { id: number; uri: string }[];
  customerEmail: string | null;
  /** True when the customer has just come back from a successful checkout. */
  paymentSuccess: boolean;
  /** Rendered by the server for the operator account only. */
  operatorPanel?: ReactNode;
};

function SupportLink() {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
      className="break-all font-semibold text-primary underline underline-offset-4"
    >
      {SUPPORT_EMAIL}
    </a>
  );
}

export default function ClientSideModel({
  order,
  finalUrls,
  selfies,
  customerEmail,
  paymentSuccess,
  operatorPanel,
}: ClientSideModelProps) {
  const router = useRouter();
  const [supabase] = useState(() => createClientComponentClient<Database>());
  const [status, setStatus] = useState(order.status);

  // The server is the source of truth whenever it re-renders this page.
  useEffect(() => {
    setStatus(order.status);
  }, [order.status]);

  // Live updates for THIS order only. Only the status is taken from the
  // message; everything else (including the finished portraits) is re-read
  // from the server, which decides what a customer may see.
  useEffect(() => {
    const channel = supabase
      .channel(`order-${order.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "models", filter: `id=eq.${order.id}` },
        (payload) => {
          const row = payload.new as { id?: unknown; status?: unknown };
          if (row.id !== order.id || typeof row.status !== "string") return;
          setStatus(row.status);
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, order.id, router]);

  const awaitingPaymentConfirmation = paymentSuccess && status === "pending_payment";
  const inFlight = isInFlight(status);
  const finished = status === "finished";
  const portraitsMissing = finished && finalUrls.length === 0;

  // Safety net if a live update is missed: quietly re-check while work is
  // running, and quickly while a payment is being confirmed.
  useEffect(() => {
    const everyMs = awaitingPaymentConfirmation || portraitsMissing ? 4000 : inFlight ? 30000 : 0;
    if (!everyMs) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [awaitingPaymentConfirmation, portraitsMissing, inFlight, router]);

  // Paid: the saved order form is no longer needed on this device.
  useEffect(() => {
    if (paymentSuccess) clearOrderDraft();
  }, [paymentSuccess]);

  const failed = status === "failed";
  const unpaid = status === "pending_payment" && !paymentSuccess;
  const showTracker = !finished && !failed && status !== "pending_payment";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="break-words font-display text-3xl leading-tight text-foreground sm:text-4xl">
          {order.customerName === ORDER_NAME_FALLBACK
            ? ORDER_NAME_FALLBACK
            : `Order for ${order.customerName}`}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-base text-muted-foreground">
            Placed{" "}
            <time dateTime={order.createdAt} suppressHydrationWarning>
              {formatOrderDate(order.createdAt)}
            </time>
          </p>
          <span aria-live="polite">
            <StatusBadge status={awaitingPaymentConfirmation ? "queued" : status} />
          </span>
        </div>
      </header>

      {paymentSuccess && !failed && (
        <section
          role="status"
          className="flex gap-3 rounded-lg border-2 border-primary bg-primary/10 p-4 text-base leading-relaxed text-foreground sm:p-5"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          {awaitingPaymentConfirmation ? (
            <p>
              Thank you. We are confirming your payment, which usually takes a few seconds. This
              page will update by itself.
            </p>
          ) : (
            <p>
              Payment received — your order has started.{" "}
              {customerEmail ? (
                <>
                  We&apos;ll email you at{" "}
                  <span className="break-all font-semibold">{customerEmail}</span> when your
                  portraits are ready.
                </>
              ) : (
                <>We&apos;ll email you when your portraits are ready.</>
              )}{" "}
              You can close this page.
            </p>
          )}
        </section>
      )}

      {unpaid && (
        <section className="flex flex-col items-start gap-4 rounded-lg border bg-card p-5 sm:p-6">
          <h2 className="font-display text-xl text-card-foreground">This order was not paid for</h2>
          <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
            {customerStatus(status).detail} Nothing was charged. To go ahead, start your order
            again; if you are on the same device, your details are still filled in.
          </p>
          <Button asChild className="h-12 px-6 text-base font-semibold">
            <Link href="/overview/models/train">Start my order</Link>
          </Button>
        </section>
      )}

      {showTracker && (
        <>
          <OrderProgress status={status} />
          {!paymentSuccess && (
            <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
              {customerEmail ? (
                <>
                  We&apos;ll email you at{" "}
                  <span className="break-all text-foreground">{customerEmail}</span> when your
                  portraits are ready.
                </>
              ) : (
                <>We&apos;ll email you when your portraits are ready.</>
              )}{" "}
              You can close this page; it also updates by itself if you leave it open.
            </p>
          )}
        </>
      )}

      {failed && (
        <section role="status" className="rounded-lg border-2 border-destructive bg-card p-5 sm:p-6">
          <h2 className="font-display text-xl text-card-foreground">
            {customerStatus("failed").label}
          </h2>
          <p className="mt-2 max-w-prose text-base leading-relaxed text-card-foreground">
            {customerStatus("failed").detail}
          </p>
          <p className="mt-3 max-w-prose text-base leading-relaxed text-muted-foreground">
            If you would like to talk to someone, write to <SupportLink />. Replies reach a
            person.
          </p>
        </section>
      )}

      {finished &&
        (portraitsMissing ? (
          <section role="status" className="rounded-lg border bg-card p-5 sm:p-6">
            <p className="max-w-prose text-base leading-relaxed text-card-foreground">
              Your portraits are ready, and we are loading them now. If they do not appear in a
              minute, refresh this page or write to <SupportLink />.
            </p>
          </section>
        ) : (
          <PortraitGallery orderId={order.id} customerName={order.customerName} urls={finalUrls} />
        ))}

      {showTracker && selfies.length > 0 && (
        <details className="rounded-lg border bg-card p-4">
          <summary className="flex min-h-[44px] cursor-pointer items-center text-base font-semibold text-card-foreground">
            Your photos ({selfies.length})
          </summary>
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {selfies.map((s, i) => (
              <li key={s.id} className="aspect-square overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.uri}
                  alt={`Your photo ${i + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </li>
            ))}
          </ul>
        </details>
      )}

      {operatorPanel}
    </div>
  );
}
