import Image from "next/image";
import { EXAMPLE_PORTRAITS } from "@/lib/examples";

/**
 * Real, approved portraits only. While lib/examples.ts is empty this renders
 * nothing at all, so the page never shows placeholder or stock people.
 */
export default function ExamplesGallery() {
  if (EXAMPLE_PORTRAITS.length === 0) return null;

  return (
    <section id="examples" aria-labelledby="examples-title" className="border-b border-navy-600">
      <div className="container py-14 md:py-20">
        <h2 id="examples-title" className="font-display text-3xl text-steel md:text-4xl">
          Delivered portraits
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-dim">
          Real orders, shown with permission.
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {EXAMPLE_PORTRAITS.map(({ src, alt }) => (
            <li
              key={src}
              className="relative aspect-[4/5] overflow-hidden rounded-md border border-navy-600 bg-navy-800"
            >
              <Image
                src={src}
                alt={alt}
                fill
                sizes="(min-width: 768px) 25vw, 50vw"
                className="object-cover"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
