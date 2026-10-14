export const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']

// For <input accept>. Listing exact types also makes iPhones convert HEIC
// photos to JPEG when they are picked through the file browser.
export const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_TYPES,
  ...ACCEPTED_EXTENSIONS,
].join(',')

const HEIC_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]
const HEIC_EXTENSIONS = ['.heic', '.heif']

export interface SkippedCounts {
  extra: number // supported, but not needed to fill the bracket
  heic: number
  unsupported: number
  unreadable: number // supported, but could not be decoded
}

export const NO_SKIPS: SkippedCounts = {
  extra: 0,
  heic: 0,
  unsupported: 0,
  unreadable: 0,
}

export interface SortedFiles {
  candidates: File[] // supported files, in their original order
  heic: number
  unsupported: number
}

// The structured result of one upload batch. The notice text is derived from
// this plus the current bracket state, so it never goes stale.
export interface UploadResult {
  added: number
  skipped: SkippedCounts
}

export interface UploadNotice {
  message: string
  detail: string | null
}

type FileKind = 'supported' | 'heic' | 'unsupported'

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

function classifyFile(file: File): FileKind {
  const type = file.type.toLowerCase()
  const extension = getExtension(file.name)

  if (HEIC_TYPES.includes(type) || HEIC_EXTENSIONS.includes(extension)) {
    return 'heic'
  }
  // A reported type always wins; the extension is only a fallback for
  // files the system reports without one.
  if (type) {
    return (ACCEPTED_TYPES as readonly string[]).includes(type)
      ? 'supported'
      : 'unsupported'
  }
  return ACCEPTED_EXTENSIONS.includes(extension) ? 'supported' : 'unsupported'
}

// Splits one upload batch into supported candidates (in their original order)
// and counts of HEIC and unsupported files. Slots are handled by processBatch,
// because a candidate that fails to decode frees its slot for the next one.
export function sortFiles(files: readonly File[]): SortedFiles {
  const sorted: SortedFiles = { candidates: [], heic: 0, unsupported: 0 }
  for (const file of files) {
    const kind = classifyFile(file)
    if (kind === 'heic') sorted.heic++
    else if (kind === 'unsupported') sorted.unsupported++
    else sorted.candidates.push(file)
  }
  return sorted
}

export interface BatchOptions<T> {
  files: readonly File[]
  freeSlots: number
  prepare: (file: File) => Promise<T> // rejects if the file can't be decoded
  commit: (item: T) => void // called in original file order
  discard: (item: T) => void // releases a prepared item that won't be used
  signal?: AbortSignal
  concurrency?: number
}

export interface BatchCounts {
  added: number
  extra: number // never prepared: the bracket was already covered
  unreadable: number
}

// Prepares files with limited concurrency and commits the successful ones in
// their original order. A file is only started while it could still be needed
// (committed + waiting + in flight < free slots), so extras are never decoded
// and a failure lets the next file take its place. After an abort nothing is
// committed and every prepared item is discarded.
export function processBatch<T>({
  files,
  freeSlots,
  prepare,
  commit,
  discard,
  signal,
  concurrency = 2,
}: BatchOptions<T>): Promise<BatchCounts> {
  const slots = Math.max(0, freeSlots)

  return new Promise((resolve) => {
    // Finished but not yet committed, by file index; null means it failed.
    const settled = new Map<number, { item: T } | null>()
    let started = 0
    let inFlight = 0
    let nextToCommit = 0
    let added = 0
    let unreadable = 0
    let finished = false

    const isAborted = () => signal?.aborted === true
    const waiting = () =>
      [...settled.values()].filter((result) => result !== null).length
    const canStart = () =>
      started < files.length && added + waiting() + inFlight < slots

    function commitInOrder() {
      while (settled.has(nextToCommit)) {
        const result = settled.get(nextToCommit)
        settled.delete(nextToCommit)
        nextToCommit++
        if (result) {
          commit(result.item)
          added++
        } else {
          unreadable++
        }
      }
    }

    function finishIfDone() {
      if (finished || inFlight > 0) return
      if (!isAborted() && canStart()) return
      finished = true
      signal?.removeEventListener('abort', handleAbort)
      resolve({ added, extra: files.length - started, unreadable })
    }

    function settle(index: number, result: { item: T } | null) {
      inFlight--
      if (isAborted()) {
        if (result) discard(result.item)
      } else {
        settled.set(index, result)
        commitInOrder()
      }
      startMore()
    }

    function startMore() {
      while (!isAborted() && inFlight < concurrency && canStart()) {
        const index = started++
        inFlight++
        Promise.resolve()
          .then(() => prepare(files[index]))
          .then(
            (item) => settle(index, { item }),
            () => settle(index, null),
          )
      }
      finishIfDone()
    }

    function handleAbort() {
      for (const result of settled.values()) {
        if (result) discard(result.item)
      }
      settled.clear()
      finishIfDone()
    }

    signal?.addEventListener('abort', handleAbort)
    startMore()
  })
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

// Builds the short upload notice, or null when nothing was skipped.
// `bracketFull` is the bracket's state now, not when the batch ran.
export function describeUpload(
  { added, skipped }: UploadResult,
  { bracketFull }: { bracketFull: boolean },
): UploadNotice | null {
  const { extra, heic, unsupported, unreadable } = skipped
  const total = extra + heic + unsupported + unreadable
  if (total === 0) return null

  // `label` is used in the multi-reason list, `sentence` when it is alone.
  const reasons = [
    {
      count: extra,
      label: 'extra',
      sentence: plural(extra, 'extra file', 'extra files'),
    },
    {
      count: heic,
      label: 'HEIC',
      sentence: plural(heic, 'HEIC file', 'HEIC files'),
    },
    {
      count: unsupported,
      label: 'unsupported',
      sentence: plural(unsupported, 'unsupported file', 'unsupported files'),
    },
    {
      count: unreadable,
      label: 'unreadable',
      sentence: plural(
        unreadable,
        "file that couldn't be opened",
        "files that couldn't be opened",
      ),
    },
  ].filter((reason) => reason.count > 0)

  const skippedText =
    reasons.length === 1
      ? `Skipped ${reasons[0].sentence}.`
      : `Skipped ${total} files: ${joinList(
          reasons.map((reason) => `${reason.count} ${reason.label}`),
        )}.`

  const addedText =
    added > 0
      ? `Added ${plural(added, 'image', 'images')}. `
      : 'No images added. '

  const details: string[] = []
  if (extra > 0 && bracketFull) details.push('Your bracket is full.')
  if (heic > 0) details.push("HEIC isn't supported yet.")

  return {
    message: addedText + skippedText,
    detail: details.length > 0 ? details.join(' ') : null,
  }
}
