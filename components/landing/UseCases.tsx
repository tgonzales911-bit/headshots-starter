import { Award, Globe2, Medal, Newspaper } from "lucide-react";

const CASES = [
  { icon: Medal, title: "Promotions and swearing-in", body: "A portrait that matches the new rank on day one." },
  { icon: Award, title: "Awards and banquets", body: "For the program, the slideshow and the plaque." },
  { icon: Globe2, title: "Department website and annual report", body: "A consistent command-staff page without a studio day." },
  { icon: Newspaper, title: "Press, social and retirement", body: "When the paper or the union asks for a photo by Friday." },
];

export default function UseCases() {
  return (
    <section aria-labelledby="uses-title" className="border-b border-navy-600 bg-navy-950">
      <div className="container py-16 md:py-20">
        <h2 id="uses-title" className="max-w-2xl font-display text-3xl text-steel md:text-4xl">
          For the moments that call for Class A
        </h2>
        <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {CASES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Icon aria-hidden="true" className="h-7 w-7 text-gold" />
              <h3 className="mt-3 text-lg font-semibold text-steel">{title}</h3>
              <p className="mt-1.5 text-base leading-relaxed text-steel-dim">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
