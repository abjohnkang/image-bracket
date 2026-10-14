export const TOURNAMENT_SIZES = [4, 8, 16, 32, 64, 128] as const
export type TournamentSize = (typeof TOURNAMENT_SIZES)[number]

export interface Contestant {
  id: string
  url: string
}

export type AppState =
  | { phase: 'chooseSize' }
  | {
      phase: 'setup'
      size: TournamentSize
      contestants: Contestant[] // upload order, never more than size
    }
  | {
      phase: 'tournament'
      size: TournamentSize
      contestants: Contestant[] // upload order, restored on Quit
      order: Contestant[] // shuffled once at start
      picks: string[] // winner ids, oldest first
    }

export type AppAction =
  | { type: 'setSize'; size: TournamentSize }
  | { type: 'addContestants'; contestants: Contestant[] }
  | { type: 'removeContestant'; id: string }
  | { type: 'backToSizes' }
  | { type: 'start'; order: Contestant[] } // already shuffled
  | { type: 'pickWinner'; id: string }
  | { type: 'undo' }
  | { type: 'quit' }
  | { type: 'playAgain'; order: Contestant[] } // already shuffled
  | { type: 'newTournament' }

export interface BracketView {
  round: Contestant[] // contestants still alive in this round
  winners: Contestant[] // picked so far in this round
  match: [Contestant, Contestant] | null // null once there is a champion
  champion: Contestant | null
}

type SetupState = Extract<AppState, { phase: 'setup' }>

export const initialState: AppState = { phase: 'chooseSize' }

// Fisher–Yates. Returns a new array; pass `random` for a deterministic order.
export function shuffle<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]
    result[j] = temp
  }
  return result
}

export function isReadyToStart(state: AppState): state is SetupState {
  return state.phase === 'setup' && state.contestants.length === state.size
}

// Replays the picks from the shuffled order. Completed rounds are never
// stored: once a round's winners fill half the round, they become the next
// round. Replay stops at the first pick that is not in the current match, so
// a bad picks list can never produce an impossible bracket.
export function getBracket(
  order: Contestant[],
  picks: string[],
): BracketView {
  let round = order
  let winners: Contestant[] = []

  for (const id of picks) {
    const match = getMatch(round, winners)
    const winner = match?.find((contestant) => contestant.id === id)
    if (!winner) break

    winners.push(winner)
    if (winners.length > 1 && winners.length === round.length / 2) {
      round = winners
      winners = []
    }
  }

  const champion =
    round.length === 2 && winners.length === 1 ? winners[0] : null

  return {
    round,
    winners,
    match: champion ? null : getMatch(round, winners),
    champion,
  }
}

export function getRoundName(roundSize: number): string {
  if (roundSize === 2) return 'Final'
  if (roundSize === 4) return 'Semifinals'
  if (roundSize === 8) return 'Quarterfinals'
  return `Round of ${roundSize}`
}

export function tournamentReducer(
  state: AppState,
  action: AppAction,
): AppState {
  switch (action.type) {
    case 'setSize': {
      if (!isTournamentSize(action.size)) return state
      if (state.phase === 'chooseSize') {
        return { phase: 'setup', size: action.size, contestants: [] }
      }
      if (state.phase === 'setup' && state.size !== action.size) {
        // Changing size always clears the uploads; the UI confirms first.
        return { phase: 'setup', size: action.size, contestants: [] }
      }
      return state
    }

    case 'addContestants': {
      if (state.phase !== 'setup') return state

      const seenIds = new Set(state.contestants.map((c) => c.id))
      const freeSlots = state.size - state.contestants.length
      const accepted: Contestant[] = []
      for (const contestant of action.contestants) {
        if (accepted.length === freeSlots) break
        if (seenIds.has(contestant.id)) continue
        seenIds.add(contestant.id)
        accepted.push(contestant)
      }

      if (accepted.length === 0) return state
      return { ...state, contestants: [...state.contestants, ...accepted] }
    }

    case 'removeContestant': {
      if (state.phase !== 'setup') return state
      if (!state.contestants.some((c) => c.id === action.id)) return state
      return {
        ...state,
        contestants: state.contestants.filter((c) => c.id !== action.id),
      }
    }

    case 'backToSizes': {
      // Discards uploads; the UI confirms first when there are any.
      if (state.phase !== 'setup') return state
      return initialState
    }

    case 'start': {
      if (!isReadyToStart(state)) return state
      const order = resolveOrder(action.order, state.contestants)
      if (!order) return state
      return {
        phase: 'tournament',
        size: state.size,
        contestants: state.contestants,
        order,
        picks: [],
      }
    }

    case 'pickWinner': {
      if (state.phase !== 'tournament') return state
      const { match } = getBracket(state.order, state.picks)
      if (!match?.some((c) => c.id === action.id)) return state
      return { ...state, picks: [...state.picks, action.id] }
    }

    case 'undo': {
      if (state.phase !== 'tournament' || state.picks.length === 0) {
        return state
      }
      return { ...state, picks: state.picks.slice(0, -1) }
    }

    case 'quit': {
      // Only an active tournament can be quit; uploads are kept.
      if (state.phase !== 'tournament' || hasChampion(state)) return state
      return {
        phase: 'setup',
        size: state.size,
        contestants: state.contestants,
      }
    }

    case 'playAgain': {
      if (state.phase !== 'tournament' || !hasChampion(state)) return state
      const order = resolveOrder(action.order, state.contestants)
      if (!order) return state
      return { ...state, order, picks: [] }
    }

    case 'newTournament': {
      if (state.phase !== 'tournament' || !hasChampion(state)) return state
      return initialState
    }
  }
}

function isTournamentSize(size: number): size is TournamentSize {
  return (TOURNAMENT_SIZES as readonly number[]).includes(size)
}

function hasChampion(state: Extract<AppState, { phase: 'tournament' }>) {
  return getBracket(state.order, state.picks).champion !== null
}

function getMatch(
  round: Contestant[],
  winners: Contestant[],
): [Contestant, Contestant] | null {
  const index = winners.length * 2
  if (index + 1 >= round.length) return null
  return [round[index], round[index + 1]]
}

// Returns the order rebuilt from the current contestant objects, or null if
// it is not an exact permutation of them (wrong length, missing, duplicate or
// unknown ids).
function resolveOrder(
  order: Contestant[],
  contestants: Contestant[],
): Contestant[] | null {
  if (order.length !== contestants.length) return null

  const byId = new Map(contestants.map((c) => [c.id, c]))
  const seenIds = new Set<string>()
  const resolved: Contestant[] = []
  for (const { id } of order) {
    const contestant = byId.get(id)
    if (!contestant || seenIds.has(id)) return null
    seenIds.add(id)
    resolved.push(contestant)
  }
  return resolved
}
