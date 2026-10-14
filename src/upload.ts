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
  extra: number // supported, but the bracket was already full
  heic: number
  unsupported: number
  unreadable: number // accepted, but the preview failed to load
}

export const NO_SKIPS: SkippedCounts = {
  extra: 0,
  heic: 0,
  unsupported: 0,
  unreadable: 0,
}

export interface SortedFiles {
  accepted: File[]
  skipped: SkippedCounts
}

// `added` is null when the notice is not about a specific upload batch.
export interface UploadResult {
  added: number | null
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

// Splits one upload batch into the files to add (in their original order, up
// to the free slots) and counts of everything skipped.
export function sortFiles(files: readonly File[], freeSlots: number): SortedFiles {
  const accepted: File[] = []
  const skipped = { ...NO_SKIPS }

  for (const file of files) {
    const kind = classifyFile(file)
    if (kind === 'heic') skipped.heic++
    else if (kind === 'unsupported') skipped.unsupported++
    else if (accepted.length < freeSlots) accepted.push(file)
    else skipped.extra++
  }

  return { accepted, skipped }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function joinList(items: string[]): string {
  if (items.length <= 2) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

// Builds the short upload notice, or null when nothing was skipped.
export function describeUpload({
  added,
  skipped,
}: UploadResult): UploadNotice | null {
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
    added === null
      ? ''
      : added > 0
        ? `Added ${plural(added, 'image', 'images')}. `
        : 'No images added. '

  const details: string[] = []
  if (extra > 0) details.push('Your bracket is full.')
  if (heic > 0) details.push("HEIC isn't supported yet.")

  return {
    message: addedText + skippedText,
    detail: details.length > 0 ? details.join(' ') : null,
  }
}
