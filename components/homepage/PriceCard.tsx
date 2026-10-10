import Link from "next/link";
import { Check } from "lucide-react";
import {
  BACKDROP_OPTIONS,
  DELIVERY_PROMISE,
  ORDER_PRICE_LABEL,
  PORTRAITS_PER_ORDER,
} from "@/lib/site";

/** "American flag, formal blue studio or neutral gray studio" from the real backdrop list. */
function backdropList(): string {
  const labels = BACKDROP_OPTIONS.map((b, i) =>
    i === 0 ? b.label : b.label.charAt(0).toLowerCase() + b.label.slice(1)
  );
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export default function PriceCard({ orderHref }: { orderHref: string }) {
  const included: { lead: string; rest?: string }[] = [
    { lead: `${PORTRAITS_PER_ORDER} finished portraits`, rest: "in fire service Class A uniform" },
    { lead: "Your own badge, shoulder patch and collar brass", rest: "placed from your photos" },
    { lead: "A backdrop of your choice:", rest: backdropList() },
    { lead: "Print-ready exports", rest: "up to 8 × 10" },
    { lead: `${DELIVERY_PROMISE}` },
  ];

  return (
    <section id="price" aria-labelledby="price-title" className="border-b border-navy-600 bg-navy-950">
      <div className="container grid gap-10 py-14 md:grid-cols-2 md:items-center md:gap-16 md:py-20">
        <div className="max-w-xl">
          <h2 id="price-title" className="font-display text-3xl text-steel md:text-4xl">
            What you get
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-steel-dim">
            One order, one price, paid once.
          </p>
          <p className="mt-4 text-lg leading-relaxed text-steel-dim">
            If you are not satisfied, we regenerate your portraits at no extra cost.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-gold/50 bg-navy-800">
          <div aria-hidden="true" className="braid mx-6 mt-6 md:mx-8 md:mt-8" />
          <div className="p-6 md:p-8">
            <p className="text-base font-semibold text-gold">One order</p>
            <p className="mt-1 font-display text-6xl leading-none text-steel">{ORDER_PRICE_LABEL}</p>
            <p className="mt-2 text-base text-steel-dim">Per person. Pay once.</p>

            <ul className="mt-6 space-y-3 border-t border-navy-600 pt-6">
              {included.map(({ lead, rest }) => (
                <li key={lead} className="flex items-start gap-3 text-base leading-relaxed">
                  <Check aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-gold" strokeWidth={2.5} />
                  <span className="text-steel">
                    {lead}
                    {rest ? <span className="text-steel-dim"> {rest}</span> : null}
                  </span>
                </li>
              ))}
            </ul>

            <Link href={orderHref} className="btn-gold mt-8 w-full">
              Start my order — {ORDER_PRICE_LABEL}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
