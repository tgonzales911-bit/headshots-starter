/**
 * Approved, real BadgeShot portraits shown on the order-start page.
 *
 * Leave this empty until there are real customer outputs that the customer has
 * agreed to show. Never add stock photos, template images or mock-ups: the
 * gallery section renders nothing while this list is empty.
 *
 * To add one: put the file under public/examples/ and append
 * { src: "/examples/your-file.jpg", alt: "Describe the portrait: rank, uniform, backdrop" }.
 * Portraits are displayed at a 4:5 ratio.
 */
export const EXAMPLE_PORTRAITS: { src: string; alt: string }[] = [
  {
    src: "/examples/portrait-1.webp",
    alt: "Assistant chief in Class A uniform, three-quarter view, American flag backdrop",
  },
  {
    src: "/examples/portrait-2.webp",
    alt: "The same assistant chief turned slightly to his left, flag backdrop",
  },
  {
    src: "/examples/portrait-4.webp",
    alt: "The same assistant chief facing the camera, flag backdrop",
  },
  {
    src: "/examples/portrait-5.webp",
    alt: "The same assistant chief with a slight smile, flag backdrop",
  },
];
