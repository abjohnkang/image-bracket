import { useEffect, useEffectEvent } from 'react'
import type { Contestant } from '../tournament'
import { UndoIcon } from './MatchScreen'
import styles from './MatchScreen.module.css'

interface WinnerScreenProps {
  champion: Contestant
  onUndo: () => void
}

// Temporary champion state until the full winner screen is designed.
function WinnerScreen({ champion, onUndo }: WinnerScreenProps) {
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const undoShortcut =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'z'
    if (!undoShortcut || event.defaultPrevented) return
    event.preventDefault()
    if (!event.repeat) onUndo()
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: '100%' }} />
      </div>

      <header className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.winnerLabel}>Winner</span>
        </h1>
        <button
          type="button"
          className={`${styles.action} ${styles.undo}`}
          aria-label="Undo last pick"
          onClick={onUndo}
        >
          <UndoIcon />
          <span className={styles.actionLabel}>Undo</span>
        </button>
      </header>

      <main className={`${styles.stage} ${styles.winnerStage}`}>
        <div className={`${styles.frame} ${styles.winnerFrame}`}>
          <img className={styles.image} src={champion.url} alt="Winning image" />
        </div>
      </main>
    </div>
  )
}

export default WinnerScreen
