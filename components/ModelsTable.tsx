"use client";

import StatusBadge from "@/components/order/StatusBadge";
import { formatOrderDate, type OrderSummary } from "@/components/order/orderHelpers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SUPPORT_EMAIL } from "@/lib/site";
import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type OrdersListProps = {
  orders: OrderSummary[];
  onOrderRemoved?: (id: number) => void;
};

/** Removal is only ever offered for orders with no work running. */
const REMOVABLE = ["pending_payment", "failed", "finished"];

const REMOVE_FAILED = `We could not remove this order. Please try again, or email ${SUPPORT_EMAIL}.`;

export default function ModelsTable({ orders, onOrderRemoved }: OrdersListProps) {
  const [target, setTarget] = useState<OrderSummary | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (removing) return;
    setTarget(null);
    setError(null);
  };

  const confirmRemove = async () => {
    if (!target) return;
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/models/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
        const serverMessage =
          typeof body?.message === "string" && body.message.trim() ? body.message.trim() : null;
        setError(res.status === 409 && serverMessage ? serverMessage : REMOVE_FAILED);
        return;
      }
      onOrderRemoved?.(target.id);
      setTarget(null);
    } catch {
      setError(REMOVE_FAILED);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <ul className="flex flex-col gap-3">
        {orders.map((order) => {
          const removable = REMOVABLE.includes(order.status);
          const unpaid = order.status === "pending_payment";
          return (
            <li
              key={order.id}
              className="flex flex-col rounded-lg border bg-card transition-colors focus-within:border-primary hover:border-primary/70 sm:flex-row sm:items-stretch"
            >
              <Link
                href={`/overview/models/${order.id}`}
                className="flex min-h-[72px] min-w-0 flex-1 items-center gap-4 rounded-lg p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                  {order.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.thumbUrl}
                      alt={`Finished portrait for ${order.customerName}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span aria-hidden className="font-display text-xl text-muted-foreground">
                      {order.customerName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-base font-semibold text-card-foreground">
                    {order.customerName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Placed{" "}
                    <time dateTime={order.createdAt} suppressHydrationWarning>
                      {formatOrderDate(order.createdAt)}
                    </time>
                  </span>
                  <span>
                    <StatusBadge status={order.status} />
                  </span>
                  {unpaid && (
                    <span className="text-sm text-muted-foreground">Nothing was charged.</span>
                  )}
                </span>
                <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
              {removable && (
                <div className="flex items-center border-t px-2 py-1 sm:border-l sm:border-t-0 sm:px-3">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-full text-sm text-muted-foreground sm:w-auto"
                    onClick={() => {
                      setError(null);
                      setTarget(order);
                    }}
                  >
                    Remove
                    <span className="sr-only"> order for {order.customerName}</span>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={target !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-lg">
          <DialogHeader>
            <DialogTitle>Remove this order?</DialogTitle>
            <DialogDescription className="text-base">
              Remove this order and its portraits? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm leading-relaxed text-foreground">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="h-11" onClick={close} disabled={removing}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              onClick={confirmRemove}
              disabled={removing}
            >
              {removing && <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              Remove order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
