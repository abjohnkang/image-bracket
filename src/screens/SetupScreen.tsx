import { useEffect, useEffectEvent, useRef, useState } from 'react'
import BracketMark from '../components/BracketMark'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import { createContestantId } from '../contestantId'
import type { Contestant, TournamentSize } from '../tournament'
import {
  ACCEPT_ATTRIBUTE,
  NO_SKIPS,
  describeUpload,
  sortFiles,
  type UploadResult,
} from '../upload'
import styles from './SetupScreen.module.css'

interface SetupScreenProps {
  size: TournamentSize
  contestants: Contestant[]
  onAddContestants: (contestants: Contestant[]) => void
  onRemove: (id: string) => void
  onStart: () => void
  onBackToSizes: () => void
}

function SetupScreen({
  size,
  contestants,
  onAddContestants,
  onRemove,
  onStart,
  onBackToSizes,
}: SetupScreenProps) {
  // The latest upload batch, kept until dismissed or replaced.
  const [upload, setUpload] = useState<UploadResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const browseRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const focusAfterRemove = useRef<number | null>(null)

  const count = contestants.length
  const isFull = count === size
  const notice = upload && describeUpload(upload)

  function handleFiles(files: File[]) {
    if (files.length === 0) return // e.g. the file picker was cancelled

    const { accepted, skipped } = sortFiles(files, size - count)
    if (accepted.length > 0) {
      onAddContestants(
        accepted.map((file) => ({
          id: createContestantId(),
          url: URL.createObjectURL(file),
        })),
      )
    }
    setUpload({ added: accepted.length, skipped })
  }

  // An accepted file that cannot be displayed is removed (which frees its
  // slot and, through App's cleanup, its URL) and counted in the notice.
  function handlePreviewError(id: string) {
    if (!contestants.some((c) => c.id === id)) return
    onRemove(id)
    setUpload((previous) => {
      const skipped = previous?.skipped ?? NO_SKIPS
      return {
        added:
          previous && previous.added !== null
            ? Math.max(0, previous.added - 1)
            : null,
        skipped: { ...skipped, unreadable: skipped.unreadable + 1 },
      }
    })
  }

  function handleRemove(index: number, id: string) {
    focusAfterRemove.current = index
    onRemove(id)
  }

  function handleChangeSize() {
    if (count === 0) onBackToSizes()
    else setIsConfirmOpen(true)
  }

  // After a removal, keep keyboard focus in the grid: the next tile's remove
  // button, else the previous one, else Browse files.
  useEffect(() => {
    const index = focusAfterRemove.current
    if (index === null) return
    focusAfterRemove.current = null
    const buttons =
      gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')
    const target = buttons?.[index] ?? buttons?.[index - 1] ?? browseRef.current
    target?.focus()
  }, [contestants])

  // The whole window accepts file drops while this screen is shown.
  const onDropFiles = useEffectEvent((files: File[]) => {
    if (!isConfirmOpen) handleFiles(files)
  })
  const canShowOverlay = useEffectEvent(() => !isConfirmOpen)

  useEffect(() => {
    let depth = 0 // dragenter/leave fire for every child element
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes('Files') ?? false

    function handleDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth += 1
      if (canShowOverlay()) setIsDragging(true)
    }
    function handleDragOver(event: DragEvent) {
      // Required for drop to fire, and stops the browser opening the file.
      if (hasFiles(event)) event.preventDefault()
    }
    function handleDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setIsDragging(false)
    }
    function handleDrop(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth = 0
      setIsDragging(false)
      onDropFiles(Array.from(event.dataTransfer?.files ?? []))
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [])

  const openFilePicker = () => fileInputRef.current?.click()

  return (
    <div className={styles.page} data-size={size}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <BracketMark className={styles.mark} />
          <span className={styles.brandName}>Image Bracket</span>
        </div>
        <div className={styles.sizeInfo}>
          <span>{size}-image bracket</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className={styles.changeSize}
            onClick={handleChangeSize}
          >
            Change size
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Add your images</h1>

        {count === 0 ? (
          <section className={styles.dropzone} aria-labelledby="dropzone-title">
            <ImageIcon className={styles.dropzoneIcon} />
            <h2 className={styles.dropzoneTitle} id="dropzone-title">
              Drop images here
            </h2>
            <Button ref={browseRef} onClick={openFilePicker}>
              Browse files
            </Button>
            <p className={styles.dropzoneHint}>
              JPG, PNG, WebP, GIF or AVIF · {size} needed
            </p>
          </section>
        ) : (
          <ul className={styles.grid} ref={gridRef} aria-label="Uploaded images">
            {contestants.map((contestant, index) => (
              <li key={contestant.id} className={styles.tile}>
                <img
                  src={contestant.url}
                  alt={`Image ${index + 1}`}
                  decoding="async"
                  onError={() => handlePreviewError(contestant.id)}
                />
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove image ${index + 1}`}
                  data-remove
                  onClick={() => handleRemove(index, contestant.id)}
                >
                  <span className={styles.removeCircle}>
                    <CrossIcon />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className={styles.dock}>
        <div className={styles.noticeRegion} role="status">
          {notice && (
            <div className={styles.notice}>
              <InfoIcon className={styles.noticeIcon} />
              <div className={styles.noticeText}>
                <p>{notice.message}</p>
                {notice.detail && (
                  <p className={styles.noticeDetail}>{notice.detail}</p>
                )}
              </div>
              <button
                type="button"
                className={styles.noticeClose}
                aria-label="Dismiss notice"
                onClick={() => setUpload(null)}
              >
                <CrossIcon />
              </button>
            </div>
          )}
        </div>

        <div className={styles.bar}>
          <div className={styles.barContent}>
            <div className={styles.progress} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{ width: `${(count / size) * 100}%` }}
              />
            </div>
            <div className={styles.barRow}>
              <p className={styles.status}>
                <span className={styles.count}>
                  {count} / {size}
                </span>
                {isFull ? (
                  <span className={styles.ready}>
                    <CheckIcon />
                    Ready
                  </span>
                ) : (
                  <span className={styles.remaining}>
                    {size - count} more to go
                  </span>
                )}
              </p>
              <div className={styles.actions}>
                {count > 0 && !isFull && (
                  <Button onClick={openFilePicker}>
                    <PlusIcon />
                    Add images
                  </Button>
                )}
                <Button variant="primary" disabled={!isFull} onClick={onStart}>
                  Start Tournament
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <span className={styles.visuallyHidden} aria-live="polite">
        {count} of {size} images added
      </span>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = '' // so the same file can be picked again
          handleFiles(files)
        }}
      />

      {isDragging && (
        <div className={styles.overlay} aria-hidden="true">
          <div className={styles.overlayFrame}>
            <DropIcon className={styles.overlayIcon} />
            Drop to add images
          </div>
        </div>
      )}

      <ConfirmDialog
        open={isConfirmOpen}
        title="Change tournament size?"
        body="Changing the tournament size will remove your uploaded images."
        confirmLabel="Remove images"
        cancelLabel="Cancel"
        onConfirm={() => {
          setIsConfirmOpen(false)
          onBackToSizes()
        }}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </div>
  )
}

// --- icons -------------------------------------------------------------------

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="6" y="9" width="36" height="30" rx="5" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="17" cy="19" r="3.5" stroke="currentColor" strokeWidth="2.5" />
      <path d="M6 33l10-9 8 7 6-5 12 10" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

function DropIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M24 8v24M14 22l10 10 10-10M8 40h32"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 8v4.5M9 5.5v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default SetupScreen
