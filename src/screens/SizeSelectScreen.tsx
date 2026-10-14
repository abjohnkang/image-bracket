import { useRef } from 'react'
import BracketMark from '../components/BracketMark'
import { TOURNAMENT_SIZES, type TournamentSize } from '../tournament'
import { useFocusOnEnter } from '../useFocusOnEnter'
import styles from './SizeSelectScreen.module.css'

interface SizeSelectScreenProps {
  onSelect: (size: TournamentSize) => void
}

function SizeSelectScreen({ onSelect }: SizeSelectScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useFocusOnEnter(headingRef)

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <BracketMark className={styles.mark} />
          <h1 className={styles.title} ref={headingRef} tabIndex={-1}>
            Image Bracket
          </h1>
          <p className={styles.tagline}>
            Upload images. Pick one of two. Crown a winner.
          </p>
        </header>

        <section className={styles.picker} aria-labelledby="size-prompt">
          <h2 className={styles.prompt} id="size-prompt">
            How many contenders?
          </h2>
          <ul className={styles.sizes}>
            {TOURNAMENT_SIZES.map((size) => (
              <li key={size}>
                <button
                  type="button"
                  className={styles.size}
                  onClick={() => onSelect(size)}
                >
                  <span className={styles.sizeNumber}>{size}</span>
                  <span className={styles.sizeCaption}>
                    {size - 1} matches
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="3"
            y="7"
            width="10"
            height="7"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        Your images never leave your device.
      </footer>
    </div>
  )
}

export default SizeSelectScreen
