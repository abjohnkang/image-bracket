import { useMemo, useReducer } from 'react'
import SetupScreen from './screens/SetupScreen'
import SizeSelectScreen from './screens/SizeSelectScreen'
import { initialState, shuffle, tournamentReducer } from './tournament'
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

    // Temporary placeholder until the match screen exists.
    case 'tournament':
      return (
        <p>
          Tournament started: {state.size} images. Match screen coming next.
        </p>
      )
  }
}

export default App
