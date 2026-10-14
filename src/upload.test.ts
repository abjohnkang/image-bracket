import { describe, expect, it } from 'vitest'
import {
  ACCEPT_ATTRIBUTE,
  NO_SKIPS,
  describeUpload,
  processBatch,
  sortFiles,
  type SkippedCounts,
} from './upload'

function file(name: string, type = ''): File {
  return new File(['x'], name, { type })
}

function names(files: File[]): string[] {
  return files.map((f) => f.name)
}

function skips(counts: Partial<SkippedCounts>): SkippedCounts {
  return { ...NO_SKIPS, ...counts }
}

const FULL = { bracketFull: true }
const NOT_FULL = { bracketFull: false }

// --- sorting files ------------------------------------------------------------

describe('sortFiles: supported formats', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['photo.gif', 'image/gif'],
    ['photo.avif', 'image/avif'],
  ])('accepts %s (%s)', (name, type) => {
    expect(sortFiles([file(name, type)])).toEqual({
      candidates: [expect.objectContaining({ name })],
      heic: 0,
      unsupported: 0,
    })
  })

  it('ignores letter case in the reported type', () => {
    expect(sortFiles([file('a.jpg', 'IMAGE/JPEG')]).candidates).toHaveLength(1)
  })
})

describe('sortFiles: files reported without a type', () => {
  it.each(['a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.gif', 'a.avif', 'A.JPG'])(
    'accepts %s by its extension',
    (name) => {
      expect(names(sortFiles([file(name)]).candidates)).toEqual([name])
    },
  )

  it.each(['notes.txt', 'drawing.svg', 'scan.bmp', 'README', 'folder'])(
    'skips %s as unsupported',
    (name) => {
      expect(sortFiles([file(name)])).toEqual({
        candidates: [],
        heic: 0,
        unsupported: 1,
      })
    },
  )
})

describe('sortFiles: the reported type wins over the extension', () => {
  it('skips a .jpg name whose type is unsupported', () => {
    expect(sortFiles([file('photo.jpg', 'image/bmp')]).unsupported).toBe(1)
  })

  it('accepts an odd name whose type is supported', () => {
    expect(sortFiles([file('photo.txt', 'image/png')]).candidates).toHaveLength(1)
  })
})

describe('sortFiles: HEIC and HEIF', () => {
  it.each([
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
  ])('skips type %s', (type) => {
    expect(sortFiles([file('IMG_0001.jpg', type)]).heic).toBe(1)
  })

  it.each(['IMG_0001.heic', 'IMG_0001.HEIC', 'IMG_0001.heif'])(
    'skips %s by extension when there is no type',
    (name) => {
      expect(sortFiles([file(name)]).heic).toBe(1)
    },
  )

  it('checks the HEIC extension before trusting a generic type', () => {
    const result = sortFiles([file('IMG_0001.heic', 'application/octet-stream')])
    expect(result).toEqual({ candidates: [], heic: 1, unsupported: 0 })
  })
})

describe('sortFiles: other unsupported files', () => {
  it.each([
    ['drawing.svg', 'image/svg+xml'],
    ['scan.bmp', 'image/bmp'],
    ['doc.pdf', 'application/pdf'],
    ['notes.txt', 'text/plain'],
    ['clip.mp4', 'video/mp4'],
  ])('skips %s (%s)', (name, type) => {
    expect(sortFiles([file(name, type)])).toEqual({
      candidates: [],
      heic: 0,
      unsupported: 1,
    })
  })
})

describe('sortFiles: mixed batches', () => {
  it('keeps supported files in their original order', () => {
    const result = sortFiles([
      file('a.svg', 'image/svg+xml'),
      file('b.jpg', 'image/jpeg'),
      file('c.heic', 'image/heic'),
      file('d.png', 'image/png'),
      file('e.txt', 'text/plain'),
      file('f.webp', 'image/webp'),
    ])
    expect(names(result.candidates)).toEqual(['b.jpg', 'd.png', 'f.webp'])
    expect(result.heic).toBe(1)
    expect(result.unsupported).toBe(2)
  })

  it('returns nothing for an empty batch', () => {
    expect(sortFiles([])).toEqual({ candidates: [], heic: 0, unsupported: 0 })
  })
})

describe('ACCEPT_ATTRIBUTE', () => {
  it('lists the supported types and nothing unsupported', () => {
    const accepted = ACCEPT_ATTRIBUTE.split(',')
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
      expect(accepted).toContain(type)
    }
    for (const type of ['image/heic', 'image/heif', 'image/svg+xml', 'image/bmp', 'image/*']) {
      expect(accepted).not.toContain(type)
    }
  })
})

// --- processing a batch ------------------------------------------------------

// A fake preview step: each file name can be given a delay (ms) and can be
// marked to fail. Records what was started and the peak concurrency.
function fakePrepare(
  options: { delays?: Record<string, number>; failing?: string[] } = {},
) {
  const started: string[] = []
  let active = 0
  let peak = 0
  const prepare = async (input: File) => {
    started.push(input.name)
    active++
    peak = Math.max(peak, active)
    await new Promise((resolve) =>
      setTimeout(resolve, options.delays?.[input.name] ?? 1),
    )
    active--
    if (options.failing?.includes(input.name)) throw new Error('cannot decode')
    return `prepared:${input.name}`
  }
  return { prepare, started, peak: () => peak }
}

function files(...fileNames: string[]): File[] {
  return fileNames.map((n) => file(n, 'image/jpeg'))
}

async function run(
  fileNames: string[],
  freeSlots: number,
  fake = fakePrepare(),
  signal?: AbortSignal,
) {
  const committed: string[] = []
  const discarded: string[] = []
  const counts = await processBatch({
    files: files(...fileNames),
    freeSlots,
    prepare: fake.prepare,
    commit: (item) => committed.push(item),
    discard: (item) => discarded.push(item),
    signal,
  })
  return { counts, committed, discarded, started: fake.started }
}

describe('processBatch: slots', () => {
  it('fills the free slots and counts the rest as extra without decoding them', async () => {
    const result = await run(['1', '2', '3', '4', '5'], 2)
    expect(result.committed).toEqual(['prepared:1', 'prepared:2'])
    expect(result.started).toEqual(['1', '2'])
    expect(result.counts).toEqual({ added: 2, extra: 3, unreadable: 0 })
  })

  it('matches the 14 / 16 example: 8 selected, 2 added, 6 extra', async () => {
    const result = await run(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 16 - 14)
    expect(result.counts).toEqual({ added: 2, extra: 6, unreadable: 0 })
    expect(result.started).toHaveLength(2)
  })

  it('decodes nothing when there are no free slots', async () => {
    const result = await run(['1', '2', '3'], 0)
    expect(result.started).toEqual([])
    expect(result.counts).toEqual({ added: 0, extra: 3, unreadable: 0 })
  })

  it('treats a negative slot count as zero', async () => {
    const result = await run(['1'], -3)
    expect(result.counts).toEqual({ added: 0, extra: 1, unreadable: 0 })
  })

  it('handles an empty batch', async () => {
    const result = await run([], 4)
    expect(result.counts).toEqual({ added: 0, extra: 0, unreadable: 0 })
  })
})

describe('processBatch: failures', () => {
  it('lets the next file take the slot of a file that fails to decode', async () => {
    const fake = fakePrepare({ failing: ['bad'] })
    const result = await run(['bad', 'b', 'c', 'd'], 2, fake)
    expect(result.committed).toEqual(['prepared:b', 'prepared:c'])
    expect(result.counts).toEqual({ added: 2, extra: 1, unreadable: 1 })
    expect(result.started).toEqual(['bad', 'b', 'c'])
  })

  it('drops a failed file from the middle without changing the order', async () => {
    const fake = fakePrepare({ failing: ['bad'] })
    const result = await run(['a', 'bad', 'c', 'd'], 3, fake)
    expect(result.committed).toEqual(['prepared:a', 'prepared:c', 'prepared:d'])
    expect(result.counts.unreadable).toBe(1)
  })

  it('reports every file as unreadable when all fail', async () => {
    const fake = fakePrepare({ failing: ['1', '2', '3'] })
    const result = await run(['1', '2', '3'], 4, fake)
    expect(result.committed).toEqual([])
    expect(result.counts).toEqual({ added: 0, extra: 0, unreadable: 3 })
  })

  it('treats a preparer that throws synchronously as a failed file', async () => {
    const committed: string[] = []
    const counts = await processBatch({
      files: files('a', 'b'),
      freeSlots: 2,
      prepare: (input) => {
        if (input.name === 'a') throw new Error('boom')
        return Promise.resolve(input.name)
      },
      commit: (item) => committed.push(item),
      discard: () => {},
    })
    expect(committed).toEqual(['b'])
    expect(counts).toEqual({ added: 1, extra: 0, unreadable: 1 })
  })
})

describe('processBatch: ordering and concurrency', () => {
  it('commits in file order even when later files finish first', async () => {
    const fake = fakePrepare({ delays: { a: 40, b: 5, c: 5, d: 5 } })
    const result = await run(['a', 'b', 'c', 'd'], 4, fake)
    expect(result.committed).toEqual([
      'prepared:a',
      'prepared:b',
      'prepared:c',
      'prepared:d',
    ])
  })

  it('never prepares more than two files at once', async () => {
    const fake = fakePrepare({ delays: { '1': 10, '2': 3, '3': 7, '4': 1 } })
    await run(['1', '2', '3', '4', '5', '6', '7', '8'], 8, fake)
    expect(fake.peak()).toBe(2)
  })

  it('accepts a different concurrency limit', async () => {
    const fake = fakePrepare()
    await processBatch({
      files: files('1', '2', '3', '4', '5'),
      freeSlots: 5,
      prepare: fake.prepare,
      commit: () => {},
      discard: () => {},
      concurrency: 1,
    })
    expect(fake.peak()).toBe(1)
  })
})

describe('processBatch: cancellation', () => {
  it('adds nothing after cancelling and releases late results', async () => {
    const controller = new AbortController()
    const fake = fakePrepare({ delays: { a: 1, b: 30 } })
    const committed: string[] = []
    const discarded: string[] = []
    const done = processBatch({
      files: files('a', 'b', 'c', 'd'),
      freeSlots: 4,
      prepare: fake.prepare,
      commit: (item) => {
        committed.push(item)
        controller.abort() // cancel right after the first image is added
      },
      discard: (item) => discarded.push(item),
      signal: controller.signal,
    })
    await done
    expect(committed).toEqual(['prepared:a'])
    // b was already in progress; it finished later and was released.
    expect(discarded).toEqual(['prepared:b'])
    // Nothing new starts after cancelling.
    expect(fake.started).toEqual(['a', 'b'])
  })

  it('releases results that were waiting for an earlier file', async () => {
    const controller = new AbortController()
    const fake = fakePrepare({ delays: { a: 40, b: 1 } })
    const discarded: string[] = []
    const committed: string[] = []
    const done = processBatch({
      files: files('a', 'b'),
      freeSlots: 2,
      prepare: fake.prepare,
      commit: (item) => committed.push(item),
      discard: (item) => discarded.push(item),
      signal: controller.signal,
    })
    // b finishes first and waits for a; cancel while it is waiting.
    await new Promise((resolve) => setTimeout(resolve, 15))
    controller.abort()
    await done
    expect(committed).toEqual([])
    expect(discarded.sort()).toEqual(['prepared:a', 'prepared:b'])
  })

  it('starts nothing when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await run(['a', 'b'], 2, fakePrepare(), controller.signal)
    expect(result.started).toEqual([])
    expect(result.committed).toEqual([])
  })
})

// --- notices --------------------------------------------------------------

describe('describeUpload', () => {
  it('gives no notice when nothing was skipped', () => {
    expect(describeUpload({ added: 3, skipped: NO_SKIPS }, FULL)).toBeNull()
  })

  it('explains extra files while the bracket is full', () => {
    expect(
      describeUpload({ added: 2, skipped: skips({ extra: 6 }) }, FULL),
    ).toEqual({
      message: 'Added 2 images. Skipped 6 extra files.',
      detail: 'Your bracket is full.',
    })
  })

  it('drops "Your bracket is full." once the bracket is no longer full', () => {
    expect(
      describeUpload({ added: 2, skipped: skips({ extra: 6 }) }, NOT_FULL),
    ).toEqual({
      message: 'Added 2 images. Skipped 6 extra files.',
      detail: null,
    })
  })

  it('keeps the HEIC line when the bracket is no longer full', () => {
    expect(
      describeUpload({ added: 2, skipped: skips({ extra: 1, heic: 1 }) }, NOT_FULL)
        ?.detail,
    ).toBe("HEIC isn't supported yet.")
  })

  it('uses singular words for one', () => {
    expect(
      describeUpload({ added: 1, skipped: skips({ extra: 1 }) }, FULL),
    ).toEqual({
      message: 'Added 1 image. Skipped 1 extra file.',
      detail: 'Your bracket is full.',
    })
  })

  it('explains HEIC files', () => {
    expect(
      describeUpload({ added: 3, skipped: skips({ heic: 2 }) }, NOT_FULL),
    ).toEqual({
      message: 'Added 3 images. Skipped 2 HEIC files.',
      detail: "HEIC isn't supported yet.",
    })
  })

  it('reports unsupported files without a second line', () => {
    expect(
      describeUpload({ added: 3, skipped: skips({ unsupported: 1 }) }, NOT_FULL),
    ).toEqual({
      message: 'Added 3 images. Skipped 1 unsupported file.',
      detail: null,
    })
  })

  it('reports files that could not be opened', () => {
    expect(
      describeUpload({ added: 4, skipped: skips({ unreadable: 1 }) }, NOT_FULL),
    ).toEqual({
      message: "Added 4 images. Skipped 1 file that couldn't be opened.",
      detail: null,
    })
    expect(
      describeUpload({ added: 0, skipped: skips({ unreadable: 2 }) }, NOT_FULL)
        ?.message,
    ).toBe("No images added. Skipped 2 files that couldn't be opened.")
  })

  it('lists several reasons in one line', () => {
    expect(
      describeUpload(
        { added: 4, skipped: skips({ extra: 1, heic: 2, unsupported: 1 }) },
        FULL,
      ),
    ).toEqual({
      message:
        'Added 4 images. Skipped 4 files: 1 extra, 2 HEIC, and 1 unsupported.',
      detail: "Your bracket is full. HEIC isn't supported yet.",
    })
  })

  it('joins two reasons with "and"', () => {
    expect(
      describeUpload({ added: 1, skipped: skips({ extra: 1, heic: 2 }) }, FULL)
        ?.message,
    ).toBe('Added 1 image. Skipped 3 files: 1 extra and 2 HEIC.')
  })

  it('lists unreadable files alongside other reasons', () => {
    expect(
      describeUpload(
        { added: 3, skipped: skips({ heic: 1, unreadable: 1 }) },
        NOT_FULL,
      )?.message,
    ).toBe('Added 3 images. Skipped 2 files: 1 HEIC and 1 unreadable.')
  })

  it('says when no images were added', () => {
    expect(
      describeUpload({ added: 0, skipped: skips({ extra: 3 }) }, FULL)?.message,
    ).toBe('No images added. Skipped 3 extra files.')
  })
})
