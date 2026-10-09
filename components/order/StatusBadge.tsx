import { cn } from "@/lib/utils";
import { customerStatus, type CustomerStatusTone } from "@/lib/site";
import { AlertTriangle, Check, Clock, Loader2 } from "lucide-react";

const TONE_CLASS: Record<CustomerStatusTone, string> = {
  waiting: "border-border bg-transparent text-muted-foreground",
  working: "border-primary/50 bg-primary/10 text-foreground",
  ready: "border-transparent bg-primary text-primary-foreground",
  problem: "border-destructive bg-destructive/20 text-foreground",
};

const TONE_ICON = {
  waiting: Clock,
  working: Loader2,
  ready: Check,
  problem: AlertTriangle,
} as const;

/** The only way an order status is ever shown to a customer. */
export default function StatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const s = customerStatus(status);
  const Icon = TONE_ICON[s.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        TONE_CLASS[s.tone],
        className
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          s.tone === "working" && "animate-spin text-primary motion-reduce:animate-none"
        )}
      />
      {s.label}
    </span>
  );
}
