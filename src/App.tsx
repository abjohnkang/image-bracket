import { useMemo, useReducer } from 'react'
import MatchScreen from './screens/MatchScreen'
import SetupScreen from './screens/SetupScreen'
import SizeSelectScreen from './screens/SizeSelectScreen'
import WinnerScreen from './screens/WinnerScreen'
import {
  getBracket,
  initialState,
  shuffle,
  tournamentReducer,
} from './tournament'
import { useObjectUrlCleanup } from './useObjectUrlCleanup'

const NO_URLS: string[] = []

function App() {
  const [state, dispatch] = useReducer(tournamentReducer, initialState)

  // Every image URL the app still holds (originals and previews); anything
  // that drops out is revoked.
  const contestants = state.phase === 'chooseSize' ? null : state.contestants
  const urls = useMemo(
    () =>
      contestants
        ? contestants.flatMap((c) => [c.url, c.previewUrl])
        : NO_URLS,
    [contestants],
  )
  useObjectUrlCleanup(urls)

  switch (state.phase) {
    case 'chooseSize':
      return (
        <SizeSelectScreen
          onSelect={(size) => dispatch({ type: 'setSize', size })}
        />
      )

    case 'setup':
      return (
        <SetupScreen
          size={state.size}
          contestants={state.contestants}
          onAddContestants={(added) =>
            dispatch({ type: 'addContestants', contestants: added })
          }
          onRemove={(id) => dispatch({ type: 'removeContestant', id })}
          onStart={() =>
            dispatch({ type: 'start', order: shuffle(state.contestants) })
          }
          onBackToSizes={() => dispatch({ type: 'backToSizes' })}
        />
      )

    case 'tournament': {
      const bracket = getBracket(state.order, state.picks)
      const undo = () => dispatch({ type: 'undo' })

      if (bracket.champion) {
        return <WinnerScreen champion={bracket.champion} onUndo={undo} />
      }
      if (!bracket.match) return null // unreachable: no champion means a match

      const [left, right] = bracket.match
      return (
        <MatchScreen
          roundSize={bracket.round.length}
          matchNumber={bracket.winners.length + 1}
          matchCount={bracket.round.length / 2}
          left={left}
          right={right}
          progress={state.picks.length / (state.size - 1)}
          canUndo={state.picks.length > 0}
          onPick={(id) => dispatch({ type: 'pickWinner', id })}
          onUndo={undo}
          onQuit={() => dispatch({ type: 'quit' })}
        />
      )
    }
  }
}

export default App
