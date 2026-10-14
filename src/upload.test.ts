import { describe, expect, it } from 'vitest'
import {
  ACCEPT_ATTRIBUTE,
  NO_SKIPS,
  describeUpload,
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

// --- sorting files ------------------------------------------------------------

describe('sortFiles: supported formats', () => {
  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.png', 'image/png'],
    ['photo.webp', 'image/webp'],
    ['photo.gif', 'image/gif'],
    ['photo.avif', 'image/avif'],
  ])('accepts %s (%s)', (name, type) => {
    const result = sortFiles([file(name, type)], 4)
    expect(names(result.accepted)).toEqual([name])
    expect(result.skipped).toEqual(NO_SKIPS)
  })

  it('ignores letter case in the reported type', () => {
    expect(sortFiles([file('a.jpg', 'IMAGE/JPEG')], 4).accepted).toHaveLength(1)
  })
})

describe('sortFiles: files reported without a type', () => {
  it.each(['a.jpg', 'a.jpeg', 'a.png', 'a.webp', 'a.gif', 'a.avif', 'A.JPG'])(
    'accepts %s by its extension',
    (name) => {
      expect(names(sortFiles([file(name)], 4).accepted)).toEqual([name])
    },
  )

  it.each(['notes.txt', 'drawing.svg', 'scan.bmp', 'README', 'folder'])(
    'skips %s as unsupported',
    (name) => {
      const result = sortFiles([file(name)], 4)
      expect(result.accepted).toEqual([])
      expect(result.skipped).toEqual(skips({ unsupported: 1 }))
    },
  )
})

describe('sortFiles: the reported type wins over the extension', () => {
  it('skips a .jpg name whose type is unsupported', () => {
    const result = sortFiles([file('photo.jpg', 'image/bmp')], 4)
    expect(result.skipped).toEqual(skips({ unsupported: 1 }))
  })

  it('accepts an odd name whose type is supported', () => {
    expect(sortFiles([file('photo.txt', 'image/png')], 4).accepted).toHaveLength(
      1,
    )
  })
})

describe('sortFiles: HEIC and HEIF', () => {
  it.each([
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
  ])('skips type %s', (type) => {
    const result = sortFiles([file('IMG_0001.jpg', type)], 4)
    expect(result.skipped).toEqual(skips({ heic: 1 }))
  })

  it.each(['IMG_0001.heic', 'IMG_0001.HEIC', 'IMG_0001.heif'])(
    'skips %s by extension when there is no type',
    (name) => {
      expect(sortFiles([file(name)], 4).skipped).toEqual(skips({ heic: 1 }))
    },
  )

  it('checks the HEIC extension before trusting a generic type', () => {
    const result = sortFiles(
      [file('IMG_0001.heic', 'application/octet-stream')],
      4,
    )
    expect(result.skipped).toEqual(skips({ heic: 1 }))
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
    const result = sortFiles([file(name, type)], 4)
    expect(result.accepted).toEqual([])
    expect(result.skipped).toEqual(skips({ unsupported: 1 }))
  })
})

describe('sortFiles: free slots', () => {
  it('fills the free slots in order and counts the rest as extra', () => {
    const files = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'].map((n) =>
      file(n, 'image/jpeg'),
    )
    const result = sortFiles(files, 2)
    expect(names(result.accepted)).toEqual(['1.jpg', '2.jpg'])
    expect(result.skipped).toEqual(skips({ extra: 3 }))
  })

  it('matches the 14 / 16 example: 8 selected, 2 accepted, 6 skipped', () => {
    const files = Array.from({ length: 8 }, (_, i) => file(`${i}.png`, 'image/png'))
    const result = sortFiles(files, 16 - 14)
    expect(result.accepted).toHaveLength(2)
    expect(result.skipped).toEqual(skips({ extra: 6 }))
  })

  it('does not let skipped files take up slots', () => {
    const files = [
      file('a.svg', 'image/svg+xml'),
      file('b.jpg', 'image/jpeg'),
      file('c.heic', 'image/heic'),
      file('d.png', 'image/png'),
    ]
    const result = sortFiles(files, 2)
    expect(names(result.accepted)).toEqual(['b.jpg', 'd.png'])
    expect(result.skipped).toEqual(skips({ heic: 1, unsupported: 1 }))
  })

  it('still counts HEIC and unsupported files when there are no free slots', () => {
    const files = [
      file('a.jpg', 'image/jpeg'),
      file('b.heic', 'image/heic'),
      file('c.txt', 'text/plain'),
    ]
    const result = sortFiles(files, 0)
    expect(result.accepted).toEqual([])
    expect(result.skipped).toEqual(skips({ extra: 1, heic: 1, unsupported: 1 }))
  })

  it('treats a negative slot count as zero', () => {
    const result = sortFiles([file('a.jpg', 'image/jpeg')], -3)
    expect(result.accepted).toEqual([])
    expect(result.skipped).toEqual(skips({ extra: 1 }))
  })

  it('returns nothing for an empty batch', () => {
    expect(sortFiles([], 4)).toEqual({ accepted: [], skipped: NO_SKIPS })
  })

  it('never reports unreadable files (only previews can fail)', () => {
    expect(sortFiles([file('a.jpg', 'image/jpeg')], 4).skipped.unreadable).toBe(0)
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

// --- notices --------------------------------------------------------------

describe('describeUpload', () => {
  it('gives no notice when nothing was skipped', () => {
    expect(describeUpload({ added: 3, skipped: NO_SKIPS })).toBeNull()
    expect(describeUpload({ added: null, skipped: NO_SKIPS })).toBeNull()
  })

  it('explains extra files', () => {
    expect(describeUpload({ added: 2, skipped: skips({ extra: 6 }) })).toEqual({
      message: 'Added 2 images. Skipped 6 extra files.',
      detail: 'Your bracket is full.',
    })
  })

  it('uses singular words for one', () => {
    expect(describeUpload({ added: 1, skipped: skips({ extra: 1 }) })).toEqual({
      message: 'Added 1 image. Skipped 1 extra file.',
      detail: 'Your bracket is full.',
    })
  })

  it('explains HEIC files', () => {
    expect(describeUpload({ added: 3, skipped: skips({ heic: 2 }) })).toEqual({
      message: 'Added 3 images. Skipped 2 HEIC files.',
      detail: "HEIC isn't supported yet.",
    })
  })

  it('reports unsupported files without a second line', () => {
    expect(
      describeUpload({ added: 3, skipped: skips({ unsupported: 1 }) }),
    ).toEqual({
      message: 'Added 3 images. Skipped 1 unsupported file.',
      detail: null,
    })
  })

  it('reports a failed preview on its own', () => {
    expect(
      describeUpload({ added: null, skipped: skips({ unreadable: 1 }) }),
    ).toEqual({
      message: "Skipped 1 file that couldn't be opened.",
      detail: null,
    })
    expect(
      describeUpload({ added: null, skipped: skips({ unreadable: 2 }) })
        ?.message,
    ).toBe("Skipped 2 files that couldn't be opened.")
  })

  it('lists several reasons in one line', () => {
    expect(
      describeUpload({
        added: 4,
        skipped: skips({ extra: 1, heic: 2, unsupported: 1 }),
      }),
    ).toEqual({
      message:
        'Added 4 images. Skipped 4 files: 1 extra, 2 HEIC, and 1 unsupported.',
      detail: "Your bracket is full. HEIC isn't supported yet.",
    })
  })

  it('joins two reasons with "and"', () => {
    expect(
      describeUpload({ added: 1, skipped: skips({ extra: 1, heic: 2 }) })
        ?.message,
    ).toBe('Added 1 image. Skipped 3 files: 1 extra and 2 HEIC.')
  })

  it('includes failed previews in the list', () => {
    expect(
      describeUpload({ added: 3, skipped: skips({ heic: 1, unreadable: 1 }) })
        ?.message,
    ).toBe('Added 3 images. Skipped 2 files: 1 HEIC and 1 unreadable.')
  })

  it('says when no images were added', () => {
    expect(
      describeUpload({ added: 0, skipped: skips({ extra: 3 }) })?.message,
    ).toBe('No images added. Skipped 3 extra files.')
  })
})
