export const dynamic = "force-dynamic";

/**
 * Shared frame for the signed-in order pages. Each page checks the session
 * itself and sends signed-out visitors to /login with a `next` path, so they
 * land back on the page they asked for (for example from the delivery email).
 */
export default function OverviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-4 py-6 sm:px-6 sm:py-10">
      {children}
    </div>
  );
}
