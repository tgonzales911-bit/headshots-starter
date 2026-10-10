import Link from "next/link";
import { Camera, Download, ShieldCheck } from "lucide-react";
import { SELFIE_MAX, SELFIE_MIN } from "@/lib/site";

const STEPS = [
  {
    icon: Camera,
    title: "Take your photos",
    body: `${SELFIE_MIN} to ${SELFIE_MAX} photos of your face, plus one each of your badge, shoulder patch and collar brass. A phone is all you need; plan on ten minutes.`,
  },
  {
    icon: ShieldCheck,
    title: "We make and check them",
    body: "Each portrait starts from one of your own photos, so it looks like you. Your real insignia goes on the uniform, and a person picks the best four.",
  },
  {
    icon: Download,
    title: "Download and print",
    body: "You get an email when they are ready, within 24 hours. Full resolution, ready for an 8 × 10, a program, the department website or a press release.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="border-b border-navy-600">
      <div className="container py-16 md:py-24">
        <h2 id="how-title" className="font-display text-3xl text-steel md:text-5xl">
          How it works
        </h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative rounded-lg border border-navy-600 bg-navy-900 p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/60 font-display text-lg text-gold-bright">
                  {i + 1}
                </span>
                <Icon aria-hidden="true" className="h-6 w-6 text-gold" />
              </div>
              <h3 className="mt-5 font-display text-2xl text-steel">{title}</h3>
              <p className="mt-3 text-base leading-relaxed text-steel-dim">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-base text-steel-dim">
          Want to get the photos right first?{" "}
          <Link href="/photo-guide" className="link-gold">
            Read the photo guide
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
