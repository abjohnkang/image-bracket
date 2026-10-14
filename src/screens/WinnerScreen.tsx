import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import BracketMark from '../components/BracketMark'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import HeaderAction from '../components/HeaderAction'
import { UndoIcon } from '../components/icons'
import { isEditableTarget, isUndoShortcut } from '../keyboard'
import type { Contestant, TournamentSize } from '../tournament'
import { useFocusOnEnter } from '../useFocusOnEnter'
import styles from './WinnerScreen.module.css'

interface WinnerScreenProps {
  champion: Contestant
  size: TournamentSize
  onUndo: () => void
  onPlayAgain: () => void
  onNewTournament: () => void // only called after confirmation
}

function WinnerScreen({
  champion,
  size,
  onUndo,
  onPlayAgain,
  onNewTournament,
}: WinnerScreenProps) {
  const [isNewOpen, setIsNewOpen] = useState(false)
  // The photo's proportions, known once it loads. Until then it stays hidden;
  // if it never loads, the image area simply stays empty.
  const [ratio, setRatio] = useState<number | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Announce the result: focus the heading (not in Tab order, no ring).
  useFocusOnEnter(headingRef)

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isNewOpen || event.defaultPrevented) return
    if (isEditableTarget(event.target) || !isUndoShortcut(event)) return
    event.preventDefault()
    if (!event.repeat) onUndo()
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.progress} aria-hidden="true" />

      {/* The heading comes first in the DOM: focus starts on it, so Tab then
          reaches Undo, Play Again, New Tournament. Grid areas place them. */}
      <div className={styles.titleArea}>
        <div className={styles.titleRow}>
          <BracketMark className={styles.mark} />
          <h1 className={styles.heading} ref={headingRef} tabIndex={-1}>
            Winner
          </h1>
        </div>
        <p className={styles.context}>{size}-image bracket</p>
      </div>

      <div className={styles.undoArea}>
        <HeaderAction
          icon={<UndoIcon />}
          label="Undo"
          ariaLabel="Undo last pick"
          onClick={onUndo}
        />
      </div>

      <main className={styles.imageArea}>
        <img
          key={champion.id}
          className={`${styles.photo} ${ratio ? styles.ready : ''}`}
          style={ratio ? ({ '--ratio': ratio } as CSSProperties) : undefined}
          src={champion.url}
          alt="Winning image"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            if (naturalWidth > 0 && naturalHeight > 0) {
              setRatio(naturalWidth / naturalHeight)
            }
          }}
        />
      </main>

      <div className={styles.actions}>
        <Button
          variant="primary"
          className={styles.actionButton}
          onClick={onPlayAgain}
        >
          Play Again
        </Button>
        <Button
          className={styles.actionButton}
          onClick={() => setIsNewOpen(true)}
        >
          New Tournament
        </Button>
      </div>

      <ConfirmDialog
        open={isNewOpen}
        title="Start a new tournament?"
        body="Your uploaded images will be removed."
        confirmLabel="Start new tournament"
        cancelLabel="Cancel"
        onConfirm={() => {
          setIsNewOpen(false)
          onNewTournament()
        }}
        onCancel={() => setIsNewOpen(false)}
      />
    </div>
  )
}

export default WinnerScreen
