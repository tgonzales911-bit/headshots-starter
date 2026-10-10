import { ORDER_STEPS } from "@/lib/site";

type Step = (typeof ORDER_STEPS)[number];

/** Plain-language account of each stage. Keyed by name so a renamed stage fails the typecheck. */
const STEP_DETAIL: Record<Step, string> = {
  "Order received":
    "You sign in, upload your photos, choose a backdrop and pay once. That starts the order.",
  "Choosing your best photos":
    "We look through your photos and pick the clearest, best-lit ones of your face to start from.",
  "Making your portraits":
    "We dress you in the fire service Class A uniform, the navy double-breasted jacket, and place your own badge, shoulder patch and collar brass from the photos you took. Your face stays your own.",
  "Final quality check":
    "A person checks every portrait against your photos and your insignia, and chooses the best four. If a detail is wrong, we fix it before anything is sent.",
  Ready:
    "We email you. Your portraits are waiting on your order page, with print-ready exports up to 8 × 10.",
};

const CHECKED_BY_PERSON: Step = "Final quality check";

export default function OrderSteps() {
  return (
    <section id="how" aria-labelledby="how-title" className="border-b border-navy-600">
      <div className="container py-14 md:py-20">
        <div className="max-w-2xl">
          <h2 id="how-title" className="font-display text-3xl text-steel md:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-steel-dim">
            An order moves through five stages. Software does the drawing. A person makes the final
            call on every portrait before it reaches you.
          </p>
        </div>

        <ol className="mt-10 max-w-2xl">
          {ORDER_STEPS.map((step, i) => {
            const human = step === CHECKED_BY_PERSON;
            const last = i === ORDER_STEPS.length - 1;
            return (
              <li key={step} className="relative flex gap-5 pb-8 last:pb-0">
                {!last && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-navy-600"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg ${
                    human
                      ? "border-gold bg-gold text-navy-950"
                      : "border-navy-500 bg-navy-900 text-steel"
                  }`}
                >
                  {i + 1}
                </span>
                <div className="pt-1">
                  <h3 className="text-lg font-semibold text-steel">{step}</h3>
                  <p className="mt-1 text-base leading-relaxed text-steel-dim">{STEP_DETAIL[step]}</p>
                  {human && (
                    <p className="mt-2 text-base font-semibold text-gold">
                      Every order gets this check. None skip it.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
