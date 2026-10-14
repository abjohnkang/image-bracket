import type { ReactNode } from 'react'
import styles from './HeaderAction.module.css'

interface HeaderActionProps {
  icon: ReactNode
  label: string // visible text; hidden on portrait phones (icon-only)
  ariaLabel: string // full accessible name, always available
  disabled?: boolean // shown as disabled but stays focusable
  className?: string // placement from the screen's own layout
  onClick: () => void
}

// The quiet text-and-icon action used in match and winner headers (Quit, Undo).
function HeaderAction({
  icon,
  label,
  ariaLabel,
  disabled = false,
  className,
  onClick,
}: HeaderActionProps) {
  return (
    <button
      type="button"
      className={className ? `${styles.action} ${className}` : styles.action}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onClick={onClick}
    >
      {icon}
      <span className={styles.label}>{label}</span>
    </button>
  )
}

export default HeaderAction
