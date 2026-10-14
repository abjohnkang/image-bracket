import { useEffect, useEffectEvent, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'
import { getRoundName, type Contestant } from '../tournament'
import { useMediaQuery } from '../useMediaQuery'
import styles from './MatchScreen.module.css'

// Must match the stacked layout rule in MatchScreen.module.css.
const STACKED_QUERY = '(max-width: 640px) and (orientation: portrait)'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const PICK_FEEDBACK_MS = 130 // winner/loser response before the pick is sent
const ENTER_MS = 80 // next pair fades in; input stays locked meanwhile
const REDUCED_GUARD_MS = 120 // double-tap guard when motion is reduced
const ROUND_TITLE_MS = 600

type Side = 0 | 1

interface MatchScreenProps {
  roundSize: number
  matchNumber: number
  matchCount: number
  left: Contestant
  right: Contestant
  progress: number // picks / (size - 1)
  canUndo: boolean
  onPick: (id: string) => void
  onUndo: () => void
  onQuit: () => void
}

function MatchScreen({
  roundSize,
  matchNumber,
  matchCount,
  left,
  right,
  progress,
  canUndo,
  onPick,
  onUndo,
  onQuit,
}: MatchScreenProps) {
  const pair = `${left.id}|${right.id}`
  // The side being picked, tied to its pair so it never carries over.
  const [chosen, setChosen] = useState<{ pair: string; side: Side } | null>(
    null,
  )
  const [roundTitle, setRoundTitle] = useState<string | null>(null)
  const [isQuitOpen, setIsQuitOpen] = useState(false)

  // A ref, not state, so two inputs in the same instant can't both pass.
  const lockRef = useRef(false)
  const titleTimerRef = useRef<number | null>(null)
  // When a key closed the round title, the lock waits for that key's release
  // so its keyup (e.g. Space on a focused frame) can't also pick.
  const releaseOnKeyUpRef = useRef<string | null>(null)
  const timersRef = useRef(new Set<number>())

  const isStacked = useMediaQuery(STACKED_QUERY)
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)

  const chosenSide = chosen?.pair === pair ? chosen.side : null
  const roundName = getRoundName(roundSize)

  function later(callback: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id)
      callback()
    }, ms)
    timersRef.current.add(id)
    return id
  }

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const id of timers) window.clearTimeout(id)
    }
  }, [])

  function unlock() {
    lockRef.current = false
  }

  function choose(side: Side) {
    if (lockRef.current || isQuitOpen) return
    lockRef.current = true

    const winnerId = (side === 0 ? left : right).id
    // The last match of a round (except the final) starts a new round.
    const endsRound = matchNumber === matchCount && roundSize > 2
    const nextRoundName = getRoundName(roundSize / 2)

    const commit = () => {
      onPick(winnerId)
      if (endsRound && !reducedMotion) {
        setRoundTitle(nextRoundName)
        titleTimerRef.current = later(dismissRoundTitle, ROUND_TITLE_MS)
      } else {
        later(unlock, reducedMotion ? REDUCED_GUARD_MS : ENTER_MS)
      }
    }

    if (reducedMotion) {
      commit()
    } else {
      setChosen({ pair, side })
      later(commit, PICK_FEEDBACK_MS)
    }
  }

  function dismissRoundTitle({ holdForKey }: { holdForKey?: string } = {}) {
    if (titleTimerRef.current !== null) {
      window.clearTimeout(titleTimerRef.current)
      timersRef.current.delete(titleTimerRef.current)
      titleTimerRef.current = null
    }
    setRoundTitle(null)
    if (!holdForKey) {
      unlock()
      return
    }
    releaseOnKeyUpRef.current = holdForKey
    // Fallback in case the keyup never arrives (e.g. the window lost focus).
    later(() => {
      if (releaseOnKeyUpRef.current !== holdForKey) return
      releaseOnKeyUpRef.current = null
      unlock()
    }, 1000)
  }

  function undo() {
    if (lockRef.current || !canUndo) return
    onUndo()
  }

  function openQuit() {
    if (lockRef.current) return
    setIsQuitOpen(true)
  }

  // --- keyboard ---------------------------------------------------------------

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isQuitOpen || event.defaultPrevented || isEditable(event.target)) {
      return
    }
    const undoShortcut = isUndoShortcut(event)

    if (roundTitle !== null) {
      if (event.key === 'Tab' || MODIFIER_KEYS.has(event.key)) return
      event.preventDefault()
      if (undoShortcut) {
        // Ctrl/Cmd+Z means undo, not just "skip".
        dismissRoundTitle()
        if (!event.repeat) onUndo()
      } else {
        dismissRoundTitle({ holdForKey: event.key })
      }
      return
    }

    if (undoShortcut) {
      event.preventDefault()
      if (!event.repeat) undo()
      return
    }

    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.shiftKey) return
    const side = keyToSide(event.key, isStacked)
    if (side === null) return
    event.preventDefault()
    choose(side)
  })

  const handleKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (releaseOnKeyUpRef.current !== event.key) return
    releaseOnKeyUpRef.current = null
    // After this key's default action (a button click) has run.
    later(unlock, 0)
  })

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // --- rendering --------------------------------------------------------------

  const sideLabel = (side: Side) =>
    isStacked ? (side === 0 ? 'top' : 'bottom') : side === 0 ? 'left' : 'right'

  function frameClass(side: Side) {
    if (chosenSide === null) return styles.frame
    return `${styles.frame} ${chosenSide === side ? styles.won : styles.lost}`
  }

  return (
    <div className={styles.page}>
      <div className={styles.progress} aria-hidden="true">
        <div
          className={styles.progressFill}
          style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
        />
      </div>

      <header className={styles.header}>
        <button
          type="button"
          className={`${styles.action} ${styles.quit}`}
          aria-label="Quit tournament"
          onClick={openQuit}
        >
          <QuitIcon />
          <span className={styles.actionLabel}>Quit</span>
        </button>
        <h1 className={styles.title}>
          <span className={styles.round}>{roundName}</span>
          <span className={styles.match}>
            Match {matchNumber} of {matchCount}
          </span>
        </h1>
        <button
          type="button"
          className={`${styles.action} ${styles.undo}`}
          aria-label="Undo last pick"
          aria-disabled={!canUndo}
          onClick={undo}
        >
          <UndoIcon />
          <span className={styles.actionLabel}>Undo</span>
        </button>
      </header>

      <main className={styles.stage}>
        {([0, 1] as const).map((side) => {
          const contestant = side === 0 ? left : right
          return (
            <button
              key={side} // same button every match, so focus stays put
              type="button"
              className={frameClass(side)}
              aria-label={`Choose ${sideLabel(side)} image`}
              onClick={() => choose(side)}
            >
              <img
                key={contestant.id} // a fresh element fades in per contestant
                className={styles.image}
                src={contestant.url}
                alt=""
                decoding="async"
              />
            </button>
          )
        })}
        <span className={styles.vs} aria-hidden="true">
          VS
        </span>

        {roundTitle && (
          <div
            className={styles.roundTitle}
            onClick={() => dismissRoundTitle()}
            aria-hidden="true"
          >
            {roundTitle}
          </div>
        )}
      </main>

      <p className={styles.hint}>
        Click your favorite · <kbd>←</kbd> <kbd>→</kbd> keys
      </p>

      <span className={styles.visuallyHidden} aria-live="polite">
        {roundName}, match {matchNumber} of {matchCount}
      </span>

      <ConfirmDialog
        open={isQuitOpen}
        title="Quit tournament?"
        body="Your tournament progress will be lost. Your uploaded images will stay."
        confirmLabel="Quit tournament"
        cancelLabel="Keep playing"
        onConfirm={() => {
          setIsQuitOpen(false)
          onQuit()
        }}
        onCancel={() => setIsQuitOpen(false)}
      />
    </div>
  )
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

function isUndoShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'z'
  )
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  )
}

function keyToSide(key: string, stacked: boolean): Side | null {
  if (key === 'ArrowLeft' || (stacked && key === 'ArrowUp')) return 0
  if (key === 'ArrowRight' || (stacked && key === 'ArrowDown')) return 1
  return null
}

export function QuitIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function UndoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.5 3.5L2.5 6.5l3 3M3 6.5h6.5a4 4 0 010 8H7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default MatchScreen
