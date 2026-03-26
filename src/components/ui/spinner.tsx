type Size = "sm" | "md" | "lg";

interface SpinnerProps {
  size?: Size;
}

const sizeStyles: Record<Size, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

function Spinner({ size = "md" }: SpinnerProps) {
  return (
    <svg
      className={`animate-spin text-emerald-600 ${sizeStyles[size]}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export { Spinner, type SpinnerProps };
