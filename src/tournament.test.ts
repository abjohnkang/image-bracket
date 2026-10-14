import { describe, expect, it } from 'vitest'
import {
  TOURNAMENT_SIZES,
  getBracket,
  getRoundName,
  initialState,
  isReadyToStart,
  shuffle,
  tournamentReducer,
  type AppAction,
  type AppState,
  type Contestant,
  type TournamentSize,
} from './tournament'

// --- helpers ---------------------------------------------------------------

function contestant(id: string): Contestant {
  return { id, url: `blob:${id}` }
}

function contestants(ids: string): Contestant[] {
  return [...ids].map(contestant)
}

function ids(list: Contestant[] | null): string {
  return (list ?? []).map((c) => c.id).join('')
}

function apply(state: AppState, ...actions: AppAction[]): AppState {
  return actions.reduce(tournamentReducer, state)
}

function asSetup(state: AppState) {
  if (state.phase !== 'setup') throw new Error(`expected setup, got ${state.phase}`)
  return state
}

function asTournament(state: AppState) {
  if (state.phase !== 'tournament') {
    throw new Error(`expected tournament, got ${state.phase}`)
  }
  return state
}

function setupWith(size: TournamentSize, uploaded: Contestant[]) {
  return asSetup(
    apply(
      initialState,
      { type: 'setSize', size },
      { type: 'addContestants', contestants: uploaded },
    ),
  )
}

function pick(state: AppState, winnerIds: string): AppState {
  return apply(
    state,
    ...[...winnerIds].map((id): AppAction => ({ type: 'pickWinner', id })),
  )
}

function bracket(state: AppState) {
  const { order, picks } = asTournament(state)
  return getBracket(order, picks)
}

// Mulberry32: a tiny seeded random number generator for repeatable shuffles.
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The 8-player example used throughout: A–H uploaded, shuffled to CFAHEBGD.
const UPLOADED = contestants('ABCDEFGH')
const ORDER = [...'CFAHEBGD'].map((id) => UPLOADED.find((c) => c.id === id)!)

function fullSetup() {
  return setupWith(8, UPLOADED)
}

function started() {
  return apply(fullSetup(), { type: 'start', order: ORDER })
}

// Quarterfinals C>F, H>A, E>B, D>G; semifinals C>H, E>D; final E>C.
const FULL_RUN = 'CHEDCEE'

// --- 1. tournament size / setup ---------------------------------------------

describe('tournament size', () => {
  it('starts on the size selection screen', () => {
    expect(initialState).toEqual({ phase: 'chooseSize' })
  })

  it.each(TOURNAMENT_SIZES)('selecting %i opens an empty setup', (size) => {
    expect(apply(initialState, { type: 'setSize', size })).toEqual({
      phase: 'setup',
      size,
      contestants: [],
    })
  })

  it('rejects a size that is not one of the allowed sizes', () => {
    const size = 7 as TournamentSize
    expect(tournamentReducer(initialState, { type: 'setSize', size })).toBe(
      initialState,
    )
  })

  it('changes size immediately when nothing is uploaded', () => {
    const state = apply(initialState, { type: 'setSize', size: 8 })
    expect(apply(state, { type: 'setSize', size: 16 })).toEqual({
      phase: 'setup',
      size: 16,
      contestants: [],
    })
  })

  it('clears uploaded contestants when the size changes', () => {
    const state = setupWith(8, contestants('ABC'))
    expect(apply(state, { type: 'setSize', size: 4 })).toEqual({
      phase: 'setup',
      size: 4,
      contestants: [],
    })
  })

  it('keeps uploads when the same size is selected again', () => {
    const state = setupWith(8, contestants('ABC'))
    expect(apply(state, { type: 'setSize', size: 8 })).toBe(state)
  })

  it('cannot change size during a tournament', () => {
    const state = started()
    expect(apply(state, { type: 'setSize', size: 4 })).toBe(state)
  })
})

describe('actions in the wrong phase do nothing', () => {
  const tournamentOnly: AppAction[] = [
    { type: 'pickWinner', id: 'C' },
    { type: 'undo' },
    { type: 'quit' },
    { type: 'playAgain', order: ORDER },
    { type: 'newTournament' },
  ]
  const setupOnly: AppAction[] = [
    { type: 'addContestants', contestants: contestants('A') },
    { type: 'removeContestant', id: 'A' },
    { type: 'backToSizes' },
    { type: 'start', order: ORDER },
  ]

  it.each([...tournamentOnly, ...setupOnly])(
    'on the size screen: $type',
    (action) => {
      expect(tournamentReducer(initialState, action)).toBe(initialState)
    },
  )

  it.each(tournamentOnly)('during setup: $type', (action) => {
    const state = fullSetup()
    expect(tournamentReducer(state, action)).toBe(state)
  })

  it.each(setupOnly)('during a tournament: $type', (action) => {
    const state = started()
    expect(tournamentReducer(state, action)).toBe(state)
  })
})

// --- 2. adding / removing contestants ---------------------------------------

describe('adding contestants', () => {
  it('adds contestants in upload order across batches', () => {
    const state = apply(
      setupWith(8, contestants('AB')),
      { type: 'addContestants', contestants: contestants('CD') },
    )
    expect(ids(asSetup(state).contestants)).toBe('ABCD')
  })

  it('only fills the remaining slots and skips the rest of the batch', () => {
    // 14 / 16 uploaded, 8 more selected: accept 2, skip 6.
    const state = apply(
      setupWith(16, contestants('abcdefghijklmn')),
      { type: 'addContestants', contestants: contestants('ABCDEFGH') },
    )
    expect(ids(asSetup(state).contestants)).toBe('abcdefghijklmnAB')
  })

  it('does nothing when setup is already full', () => {
    const state = fullSetup()
    expect(
      apply(state, { type: 'addContestants', contestants: contestants('Z') }),
    ).toBe(state)
  })

  it('does nothing for an empty batch', () => {
    const state = setupWith(8, contestants('AB'))
    expect(apply(state, { type: 'addContestants', contestants: [] })).toBe(
      state,
    )
  })

  it('rejects ids that are already uploaded', () => {
    const state = apply(
      setupWith(8, contestants('AB')),
      { type: 'addContestants', contestants: contestants('BC') },
    )
    expect(ids(asSetup(state).contestants)).toBe('ABC')
  })

  it('rejects ids repeated within one batch', () => {
    const state = setupWith(8, contestants('AAB'))
    expect(ids(state.contestants)).toBe('AB')
  })

  it('does nothing when every id in the batch is a duplicate', () => {
    const state = setupWith(8, contestants('AB'))
    expect(
      apply(state, { type: 'addContestants', contestants: contestants('BA') }),
    ).toBe(state)
  })

  it('allows the same image twice when the ids differ', () => {
    const sameImage = 'blob:same-photo'
    const state = setupWith(8, [
      { id: 'first', url: sameImage },
      { id: 'second', url: sameImage },
    ])
    expect(state.contestants).toEqual([
      { id: 'first', url: sameImage },
      { id: 'second', url: sameImage },
    ])
  })
})

describe('removing contestants', () => {
  it('removes the contestant and keeps the others in order', () => {
    const state = apply(setupWith(8, contestants('ABCD')), {
      type: 'removeContestant',
      id: 'B',
    })
    expect(ids(asSetup(state).contestants)).toBe('ACD')
  })

  it('frees a slot so another contestant can be added', () => {
    const state = apply(
      fullSetup(),
      { type: 'removeContestant', id: 'A' },
      { type: 'addContestants', contestants: contestants('Z') },
    )
    expect(ids(asSetup(state).contestants)).toBe('BCDEFGHZ')
  })

  it('does nothing for an unknown id', () => {
    const state = setupWith(8, contestants('ABCD'))
    expect(apply(state, { type: 'removeContestant', id: 'Z' })).toBe(state)
  })
})

describe('going back to size selection', () => {
  it('returns to the size screen and discards uploads', () => {
    const state = apply(setupWith(8, contestants('ABC')), {
      type: 'backToSizes',
    })
    expect(state).toEqual({ phase: 'chooseSize' })
  })

  it('returns immediately from an empty setup', () => {
    const state = apply(setupWith(8, []), { type: 'backToSizes' })
    expect(state).toEqual({ phase: 'chooseSize' })
  })

  it('opens an empty setup when a size is chosen again', () => {
    const state = apply(
      fullSetup(),
      { type: 'backToSizes' },
      { type: 'setSize', size: 8 },
    )
    expect(state).toEqual({ phase: 'setup', size: 8, contestants: [] })
  })

  it('does not bring back contestants after quitting a tournament', () => {
    const state = apply(
      pick(started(), 'CHE'),
      { type: 'quit' },
      { type: 'backToSizes' },
      { type: 'setSize', size: 8 },
    )
    expect(asSetup(state).contestants).toEqual([])
  })
})

// --- 3. starting a tournament -----------------------------------------------

describe('starting a tournament', () => {
  it('cannot start with fewer contestants than the size', () => {
    const state = setupWith(8, contestants('ABCDEFG'))
    const order = [...state.contestants]
    expect(apply(state, { type: 'start', order })).toBe(state)
  })

  it('cannot start with no contestants', () => {
    const state = setupWith(8, [])
    expect(apply(state, { type: 'start', order: [] })).toBe(state)
  })

  it('starts with a valid shuffled order', () => {
    expect(started()).toEqual({
      phase: 'tournament',
      size: 8,
      contestants: UPLOADED,
      order: ORDER,
      picks: [],
    })
  })

  it('keeps contestants in upload order alongside the shuffled order', () => {
    const state = asTournament(started())
    expect(ids(state.contestants)).toBe('ABCDEFGH')
    expect(ids(state.order)).toBe('CFAHEBGD')
  })

  it('uses the uploaded contestant objects even if the order holds copies', () => {
    const copies = ORDER.map((c) => ({ id: c.id, url: 'blob:something-else' }))
    const state = asTournament(
      apply(fullSetup(), { type: 'start', order: copies }),
    )
    expect(state.order).toEqual(ORDER)
  })

  const invalidOrders: [string, Contestant[]][] = [
    ['too short (a contestant is missing)', ORDER.slice(0, 7)],
    ['too long', [...ORDER, contestant('Z')]],
    ['a duplicate id in place of a missing contestant', [...ORDER.slice(0, 7), ORDER[0]]],
    ['an unknown id', [...ORDER.slice(0, 7), contestant('Z')]],
    ['empty', []],
  ]

  it.each(invalidOrders)('rejects an order that is %s', (_, order) => {
    const state = fullSetup()
    expect(apply(state, { type: 'start', order })).toBe(state)
  })
})

// --- 4. match progression ---------------------------------------------------

describe('match progression', () => {
  it('pairs the shuffled order two at a time', () => {
    let state = started()
    const pairs: string[] = []
    for (const winner of 'CHED') {
      pairs.push(ids(bracket(state).match))
      state = pick(state, winner)
    }
    expect(pairs).toEqual(['CF', 'AH', 'EB', 'GD'])
  })

  it('records a winner from the current match', () => {
    const state = asTournament(pick(started(), 'F'))
    expect(state.picks).toEqual(['F'])
    expect(ids(bracket(state).winners)).toBe('F')
  })

  it.each([
    ['in a later match', 'A'],
    ['unknown', 'Z'],
    ['empty', ''],
  ])('ignores a winner id that is %s', (_, id) => {
    const state = started()
    expect(apply(state, { type: 'pickWinner', id })).toBe(state)
  })

  it('ignores a contestant that was already eliminated', () => {
    const state = pick(started(), 'C') // F is out
    expect(apply(state, { type: 'pickWinner', id: 'F' })).toBe(state)
  })

  it('ignores a winner from the previous match (double click)', () => {
    const state = pick(started(), 'C') // now A vs H
    expect(apply(state, { type: 'pickWinner', id: 'C' })).toBe(state)
  })

  it('advances a completed round of winners to the next round', () => {
    const view = bracket(pick(started(), 'CHED'))
    expect(ids(view.round)).toBe('CHED')
    expect(view.winners).toEqual([])
    expect(ids(view.match)).toBe('CH')
  })

  it('pairs winners of neighbouring matches in the next round', () => {
    const state = pick(started(), 'CHEDC')
    expect(ids(bracket(state).match)).toBe('ED')
    expect(ids(bracket(pick(state, 'E')).match)).toBe('CE')
  })

  it('crowns the final winner as champion', () => {
    const state = pick(started(), FULL_RUN)
    const view = bracket(state)
    expect(view.champion?.id).toBe('E')
    expect(view.match).toBeNull()
    expect(ids(view.round)).toBe('CE')
    expect(asTournament(state).picks).toHaveLength(7)
  })

  it('has no champion before the final is decided', () => {
    expect(bracket(pick(started(), 'CHEDCE')).champion).toBeNull()
  })

  it('ignores picks once there is a champion', () => {
    const state = pick(started(), FULL_RUN)
    expect(apply(state, { type: 'pickWinner', id: 'C' })).toBe(state)
    expect(apply(state, { type: 'pickWinner', id: 'E' })).toBe(state)
  })

  it('getBracket stops replaying at a pick that does not fit', () => {
    const view = getBracket(ORDER, ['C', 'Z', 'H'])
    expect(ids(view.winners)).toBe('C')
    expect(ids(view.match)).toBe('AH')
  })
})

// --- 5. undo ----------------------------------------------------------------

describe('undo', () => {
  it('removes the most recent pick', () => {
    const state = apply(pick(started(), 'CHE'), { type: 'undo' })
    expect(asTournament(state).picks).toEqual(['C', 'H'])
  })

  it('returns to the previous match within a round', () => {
    const view = bracket(apply(pick(started(), 'CH'), { type: 'undo' }))
    expect(ids(view.winners)).toBe('C')
    expect(ids(view.match)).toBe('AH')
  })

  it('crosses back over a round boundary', () => {
    const inSemifinals = pick(started(), 'CHED')
    expect(ids(bracket(inSemifinals).match)).toBe('CH')

    const view = bracket(apply(inSemifinals, { type: 'undo' }))
    expect(ids(view.round)).toBe('CFAHEBGD')
    expect(ids(view.winners)).toBe('CHE')
    expect(ids(view.match)).toBe('GD')
  })

  it('goes from the champion back to the final', () => {
    const view = bracket(apply(pick(started(), FULL_RUN), { type: 'undo' }))
    expect(view.champion).toBeNull()
    expect(ids(view.match)).toBe('CE')
  })

  it('lets a different winner be picked after undoing', () => {
    const state = pick(apply(pick(started(), FULL_RUN), { type: 'undo' }), 'C')
    expect(bracket(state).champion?.id).toBe('C')
  })

  it('can undo all the way back to the first match', () => {
    const undoAll = Array.from({ length: 7 }, (): AppAction => ({ type: 'undo' }))
    const state = apply(pick(started(), FULL_RUN), ...undoAll)
    expect(state).toEqual(started())
  })

  it('does nothing when there are no picks', () => {
    const state = started()
    expect(apply(state, { type: 'undo' })).toBe(state)
  })
})

// --- 6. quit ----------------------------------------------------------------

describe('quit', () => {
  it('returns to setup with the same size and uploads, dropping progress', () => {
    const state = apply(pick(started(), 'CHE'), { type: 'quit' })
    expect(state).toEqual({ phase: 'setup', size: 8, contestants: UPLOADED })
    expect(state).not.toHaveProperty('order')
    expect(state).not.toHaveProperty('picks')
  })

  it('restores contestants in upload order, not shuffled order', () => {
    const state = asSetup(apply(started(), { type: 'quit' }))
    expect(ids(state.contestants)).toBe('ABCDEFGH')
  })

  it('works before any pick is made', () => {
    expect(apply(started(), { type: 'quit' })).toEqual(fullSetup())
  })

  it('leaves setup ready to start again immediately', () => {
    const state = apply(pick(started(), 'CHE'), { type: 'quit' })
    expect(isReadyToStart(state)).toBe(true)
  })

  it('does nothing once there is a champion', () => {
    const state = pick(started(), FULL_RUN)
    expect(apply(state, { type: 'quit' })).toBe(state)
  })
})

// --- 7. winner actions ------------------------------------------------------

describe('Play Again', () => {
  const NEW_ORDER = [...'HGFEDCBA'].map(
    (id) => UPLOADED.find((c) => c.id === id)!,
  )

  it('keeps contestants and size, uses the new order and clears picks', () => {
    const state = apply(pick(started(), FULL_RUN), {
      type: 'playAgain',
      order: NEW_ORDER,
    })
    expect(state).toEqual({
      phase: 'tournament',
      size: 8,
      contestants: UPLOADED,
      order: NEW_ORDER,
      picks: [],
    })
    expect(ids(bracket(state).match)).toBe('HG')
  })

  it.each([
    ['too short', NEW_ORDER.slice(0, 7)],
    ['a duplicate id', [...NEW_ORDER.slice(0, 7), NEW_ORDER[0]]],
    ['an unknown id', [...NEW_ORDER.slice(0, 7), contestant('Z')]],
  ])('rejects an order with %s', (_, order) => {
    const state = pick(started(), FULL_RUN)
    expect(apply(state, { type: 'playAgain', order })).toBe(state)
  })

  it('does nothing while the tournament is still in progress', () => {
    const state = pick(started(), 'CHE')
    expect(apply(state, { type: 'playAgain', order: NEW_ORDER })).toBe(state)
  })

  it('does nothing after undoing away from the champion', () => {
    const state = apply(pick(started(), FULL_RUN), { type: 'undo' })
    expect(apply(state, { type: 'playAgain', order: NEW_ORDER })).toBe(state)
  })
})

describe('New Tournament', () => {
  it('returns to size selection with nothing uploaded', () => {
    const state = apply(pick(started(), FULL_RUN), { type: 'newTournament' })
    expect(state).toEqual({ phase: 'chooseSize' })
  })

  it('does nothing while the tournament is still in progress', () => {
    const state = pick(started(), 'CHE')
    expect(apply(state, { type: 'newTournament' })).toBe(state)
  })
})

// --- 8. every tournament size -----------------------------------------------

describe.each(TOURNAMENT_SIZES)('a full %i-contestant tournament', (size) => {
  it(`completes in exactly ${size - 1} picks`, () => {
    const uploaded = Array.from({ length: size }, (_, i) => contestant(`c${i}`))
    let state = apply(setupWith(size, uploaded), {
      type: 'start',
      order: shuffle(uploaded, seededRandom(size)),
    })

    const roundSizes: number[] = []
    let picks = 0
    let match = bracket(state).match
    while (match) {
      const { round } = bracket(state)
      if (roundSizes.at(-1) !== round.length) roundSizes.push(round.length)

      // Alternate between left and right so both sides get exercised.
      state = apply(state, { type: 'pickWinner', id: match[picks % 2].id })
      picks++
      match = bracket(state).match
    }

    expect(picks).toBe(size - 1)
    expect(asTournament(state).picks).toHaveLength(size - 1)
    expect(bracket(state).champion).not.toBeNull()

    // Each round halves the field: size, size/2, ..., 2.
    const expectedRounds: number[] = []
    for (let n = size; n >= 2; n /= 2) expectedRounds.push(n)
    expect(roundSizes).toEqual(expectedRounds)
  })
})

// --- 9. helpers -------------------------------------------------------------

describe('shuffle', () => {
  it('returns a new array and leaves the input untouched', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
    const result = shuffle(input)
    expect(result).not.toBe(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('contains every item exactly once', () => {
    const result = shuffle([1, 2, 3, 4, 5, 6, 7, 8], seededRandom(42))
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('gives the same result for the same random sequence', () => {
    const items = [...'ABCDEFGHIJKLMNOP']
    expect(shuffle(items, seededRandom(7))).toEqual(
      shuffle(items, seededRandom(7)),
    )
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['only'])).toEqual(['only'])
  })
})

describe('isReadyToStart', () => {
  it('is false on the size screen', () => {
    expect(isReadyToStart(initialState)).toBe(false)
  })

  it('is false while setup is missing contestants', () => {
    expect(isReadyToStart(setupWith(8, contestants('ABCDEFG')))).toBe(false)
  })

  it('is true when setup has exactly the required number', () => {
    expect(isReadyToStart(fullSetup())).toBe(true)
  })

  it('is false once the tournament has started', () => {
    expect(isReadyToStart(started())).toBe(false)
  })
})

describe('getRoundName', () => {
  it.each([
    [2, 'Final'],
    [4, 'Semifinals'],
    [8, 'Quarterfinals'],
    [16, 'Round of 16'],
    [32, 'Round of 32'],
    [64, 'Round of 64'],
    [128, 'Round of 128'],
  ])('a round of %i is called "%s"', (roundSize, name) => {
    expect(getRoundName(roundSize)).toBe(name)
  })
})
