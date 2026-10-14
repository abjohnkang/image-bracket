import { useEffect, useRef } from 'react'

// Revokes object URLs once they are no longer in use. `urls` is every image
// URL currently held in app state; any URL that drops out of it is released
// after the render that removed its <img>. Anything still tracked is
// released if the app unmounts.
export function useObjectUrlCleanup(urls: readonly string[]) {
  const tracked = useRef<Set<string>>(new Set())

  useEffect(() => {
    const current = new Set(urls)
    for (const url of tracked.current) {
      if (!current.has(url)) URL.revokeObjectURL(url)
    }
    tracked.current = current
  }, [urls])

  useEffect(
    () => () => {
      for (const url of tracked.current) URL.revokeObjectURL(url)
      tracked.current = new Set()
    },
    [],
  )
}
