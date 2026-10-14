// Module-level so ids stay unique for the whole page lifetime, even when the
// setup screen unmounts during a tournament and mounts again after Quit.
let nextContestantId = 1

export function createContestantId(): string {
  return `c${nextContestantId++}`
}
