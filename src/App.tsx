import { useReducer } from 'react'
import SizeSelectScreen from './screens/SizeSelectScreen'
import { initialState, tournamentReducer } from './tournament'

function App() {
  const [state, dispatch] = useReducer(tournamentReducer, initialState)

  switch (state.phase) {
    case 'chooseSize':
      return (
        <SizeSelectScreen
          onSelect={(size) => dispatch({ type: 'setSize', size })}
        />
      )

    // Temporary placeholders until the setup and match screens exist.
    case 'setup':
      return <p>Setup: {state.size} images. Upload screen coming next.</p>

    case 'tournament':
      return <p>Tournament in progress.</p>
  }
}

export default App
