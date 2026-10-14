import { useEffect, type RefObject } from 'react'

// When a screen appears, move focus to its heading so keyboard users keep
// their place and screen readers announce the new screen. Only runs when
// focus was lost (the previously focused control belonged to the old screen),
// so it never steals focus from something the user is on. The heading needs
// tabIndex={-1} and no visible outline for :focus.
export function useFocusOnEnter(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const active = document.activeElement
    if (active && active !== document.body) return
    ref.current?.focus({ preventScroll: true })
  }, [ref])
}
