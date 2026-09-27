import { CREDIT } from "@/lib/credits";

/** "Created by …" credit. Inherits colour and size from its container so it fits any theme. */
export function Credits({ className }: { className?: string }) {
  return (
    <p className={className}>
      Created by{" "}
      <a href={CREDIT.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline">
        {CREDIT.name}
      </a>
    </p>
  );
}
