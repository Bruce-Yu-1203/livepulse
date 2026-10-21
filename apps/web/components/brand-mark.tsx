export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17 12C3 26 3 54 17 68M63 12c14 14 14 42 0 56"
        stroke="#858589"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path
        d="M27 21c-10 10-10 28 0 38m26-38c10 10 10 28 0 38"
        stroke="#F8F8FA"
        strokeLinecap="round"
        strokeWidth="7"
      />
      <circle cx="40" cy="40" fill="#FF4961" r="10" />
    </svg>
  );
}
