import { useEffect, useEffectEvent, useRef, useState } from 'react'
import BracketMark from '../components/BracketMark'
import Button from '../components/Button'
import ConfirmDialog from '../components/ConfirmDialog'
import { CloseIcon } from '../components/icons'
import { createContestantId } from '../contestantId'
import { prepareImage, releasePreparedImage } from '../preview'
import type { Contestant, TournamentSize } from '../tournament'
import {
  ACCEPT_ATTRIBUTE,
  describeUpload,
  processBatch,
  sortFiles,
  type UploadResult,
} from '../upload'
import { useFocusOnEnter } from '../useFocusOnEnter'
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
  // The latest upload batch, kept until dismissed or replaced. The notice
  // text is derived from it plus the current bracket state.
  const [upload, setUpload] = useState<UploadResult | null>(null)
  // Progress of the batch being prepared, or null when idle.
  const [preparing, setPreparing] = useState<{
    done: number
    total: number
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const headingRef = useRef<HTMLHeadingElement>(null)
  useFocusOnEnter(headingRef)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const browseRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const focusAfterRemove = useRef<number | null>(null)
  // Set while a batch runs; aborting it stops the batch and releases any
  // previews it has made but not added.
  const batchRef = useRef<AbortController | null>(null)

  const count = contestants.length
  const isFull = count === size
  const isPreparing = preparing !== null
  const notice = upload && describeUpload(upload, { bracketFull: isFull })

  // One batch at a time: sort the files, then decode and preview the
  // supported ones (two at a time), adding each contestant in file order.
  async function handleFiles(files: File[]) {
    if (files.length === 0) return // e.g. the file picker was cancelled
    if (batchRef.current) return // a batch is already being prepared

    const { candidates, heic, unsupported } = sortFiles(files)
    const freeSlots = size - count
    const total = Math.min(candidates.length, freeSlots)
    const controller = new AbortController()
    batchRef.current = controller
    setUpload(null)
    if (total > 0) setPreparing({ done: 0, total })

    const counts = await processBatch({
      files: candidates,
      freeSlots,
      prepare: prepareImage,
      commit: (image) => {
        onAddContestants([{ id: createContestantId(), ...image }])
        setPreparing((progress) =>
          progress && { ...progress, done: progress.done + 1 },
        )
      },
      discard: releasePreparedImage,
      signal: controller.signal,
    })

    if (controller.signal.aborted) return // the screen closed mid-batch
    batchRef.current = null
    setPreparing(null)
    setUpload({
      added: counts.added,
      skipped: {
        extra: counts.extra,
        heic,
        unsupported,
        unreadable: counts.unreadable,
      },
    })
  }

  // Leaving setup (Change size, Start) cancels any batch still running.
  useEffect(() => () => batchRef.current?.abort(), [])

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

  // If the focused control goes away within this screen (Browse files when
  // the first image arrives, Add images when disabled or hidden), focus would
  // fall back to the page. Put it on the heading instead; never move focus
  // that is still somewhere valid.
  const lastFocusedRef = useRef<Element | null>(null)
  useEffect(() => {
    const remember = (event: FocusEvent) => {
      lastFocusedRef.current = event.target as Element
    }
    document.addEventListener('focusin', remember)
    return () => document.removeEventListener('focusin', remember)
  }, [])
  useEffect(() => {
    const last = lastFocusedRef.current
    if (!last || document.activeElement !== document.body) return
    const lost =
      !last.isConnected || (last instanceof HTMLButtonElement && last.disabled)
    if (lost) headingRef.current?.focus({ preventScroll: true })
  }, [count, isFull, isPreparing])

  // The whole window accepts file drops while this screen is shown.
  const onDropFiles = useEffectEvent((files: File[]) => {
    if (!isConfirmOpen && !isPreparing) void handleFiles(files)
  })
  const canShowOverlay = useEffectEvent(() => !isConfirmOpen && !isPreparing)

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
        <h1 className={styles.title} ref={headingRef} tabIndex={-1}>
          Add your images
        </h1>

        {count === 0 ? (
          <section className={styles.dropzone} aria-labelledby="dropzone-title">
            <ImageIcon className={styles.dropzoneIcon} />
            {/* Only one of these is displayed (and read), depending on
                whether the device has a pointer that can hover/drag. */}
            <h2 className={styles.dropzoneTitle} id="dropzone-title">
              <span className={styles.pointerCopy}>Drop images here</span>
              <span className={styles.touchCopy}>Choose images</span>
            </h2>
            <Button
              ref={browseRef}
              disabled={isPreparing}
              onClick={openFilePicker}
            >
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
                  src={contestant.previewUrl}
                  alt={`Image ${index + 1}`}
                  decoding="async"
                />
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove image ${index + 1}`}
                  data-remove
                  onClick={() => handleRemove(index, contestant.id)}
                >
                  <span className={styles.removeCircle}>
                    <CloseIcon />
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
                <CloseIcon />
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
                {preparing ? (
                  <span className={styles.remaining}>
                    Preparing {preparing.done} of {preparing.total}…
                  </span>
                ) : isFull ? (
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
                  <Button disabled={isPreparing} onClick={openFilePicker}>
                    <PlusIcon />
                    Add images
                  </Button>
                )}
                <Button
                  variant="primary"
                  disabled={!isFull || isPreparing}
                  onClick={onStart}
                >
                  Start Tournament
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Constant while a batch runs (no announcement per image); the count
          is announced once it finishes. Skipped files are announced by the
          notice above (role="status"). */}
      <span className={styles.visuallyHidden} aria-live="polite">
        {preparing
          ? `Preparing ${preparing.total} ${preparing.total === 1 ? 'image' : 'images'}…`
          : `${count} of ${size} images added`}
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
          void handleFiles(files)
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
