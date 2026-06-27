import { clsx } from "clsx";

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("animate-spin text-gray-400", className ?? "h-6 w-6")}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function FullScreenLoader({ text = "Loading" }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#edf0f7] gap-4">
      <LoadingSpinner className="h-8 w-8" />
      <p className="text-gray-400 text-sm">{text}</p>
    </div>
  );
}
