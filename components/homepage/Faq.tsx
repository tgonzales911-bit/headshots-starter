"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { DELIVERY_PROMISE, SUPPORT_EMAIL } from "@/lib/site";

const supportLink = (
  <a href={`mailto:${SUPPORT_EMAIL}`} className="link-gold break-all">
    {SUPPORT_EMAIL}
  </a>
);

const QUESTIONS: { id: string; q: string; a: ReactNode }[] = [
  {
    id: "real-badge",
    q: "Is my real badge used?",
    a: (
      <p>
        Yes. Your badge, shoulder patch and collar brass are placed on the uniform from your own
        photos, then checked by a person. If a detail is wrong, we fix it before delivery.
      </p>
    ),
  },
  {
    id: "photograph",
    q: "How should I photograph my badge, patch and brass?",
    a: (
      <>
        <p>
          One close, sharp, straight-on photo of each. Fill the frame, use a plain contrasting
          background and soft indirect light so polished metal does not glare, tap to focus, and
          leave the flash off.
        </p>
        <p className="mt-3">
          <a href="#ready" className="link-gold">
            See the photo guide with examples
          </a>
        </p>
      </>
    ),
  },
  {
    id: "photos",
    q: "What happens to my photos?",
    a: (
      <p>
        They are used only to make your portraits. The AI services that do the image work process
        them for that purpose alone. They are never sold, and we delete them on request: email{" "}
        {supportLink}.
      </p>
    ),
  },
  {
    id: "time",
    q: "How long does it take?",
    a: (
      <p>
        {DELIVERY_PROMISE}. Every order is checked by a person before it ships, and we email you
        when your portraits are ready.
      </p>
    ),
  },
  {
    id: "use",
    q: "Can I use it for my department, awards and press?",
    a: <p>Yes. It is your portrait. Use it for your department, awards, programs and press.</p>,
  },
  {
    id: "unhappy",
    q: "What if I don't like it?",
    a: (
      <p>
        If you are not satisfied, we regenerate your portraits at no extra cost. Email{" "}
        {supportLink} and tell us what is off.
      </p>
    ),
  },
  {
    id: "other-services",
    q: "Do you do EMS or law enforcement?",
    a: (
      <p>
        Not yet. BadgeShot makes the fire service Class A today; EMS and law enforcement uniforms
        are coming.
      </p>
    ),
  },
];

export default function Faq() {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <section id="faq" aria-labelledby="faq-title" className="border-b border-navy-600">
      <div className="container py-14 md:py-20">
        <h2 id="faq-title" className="font-display text-3xl text-steel md:text-4xl">
          Questions
        </h2>

        <div className="mt-8 max-w-3xl border-b border-navy-600">
          {QUESTIONS.map(({ id, q, a }) => {
            const isOpen = Boolean(open[id]);
            return (
              <div key={id} className="border-t border-navy-600">
                <h3>
                  <button
                    type="button"
                    id={`faq-button-${id}`}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${id}`}
                    onClick={() => setOpen((prev) => ({ ...prev, [id]: !prev[id] }))}
                    className="flex min-h-[56px] w-full items-center justify-between gap-4 py-4 text-left text-lg font-semibold text-steel hover:text-gold-bright"
                  >
                    <span>{q}</span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-5 w-5 shrink-0 text-gold transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </h3>
                <div
                  id={`faq-panel-${id}`}
                  role="region"
                  aria-labelledby={`faq-button-${id}`}
                  hidden={!isOpen}
                  className="max-w-2xl pb-6 text-base leading-relaxed text-steel-dim"
                >
                  {a}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
