// Shared by the match and winner screens so their shortcuts can't drift.

// Ctrl+Z on Windows/Linux, Cmd+Z on macOS. Shift (redo) and Alt are excluded.
export function isUndoShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'z'
  )
}

// True when the user is typing somewhere, so global shortcuts stay out of it.
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  )
}
