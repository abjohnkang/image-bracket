interface BracketMarkProps {
  className?: string
}

// Four entrants narrowing to one winner.
function BracketMark({ className }: BracketMarkProps) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path
        d="M4 7h8v8H4M4 21h8v8H4M12 11h8v14h-8M20 18h12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default BracketMark
