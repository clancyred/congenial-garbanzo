import './App.css'

function App() {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 8 }}>Fishbowl</h1>
      <p style={{ marginTop: 0, opacity: 0.9 }}>
        PWA scaffold is set up. Next step is implementing the full game per{' '}
        <a href="/FISHBOWL_SPEC.md" target="_blank" rel="noreferrer">
          FISHBOWL_SPEC.md
        </a>
        .
      </p>

      <div className="card">
        <p style={{ marginTop: 0 }}>
          When you’re ready, install on iPad: Safari → Share → Add to Home Screen.
        </p>
        <p style={{ marginBottom: 0, opacity: 0.85 }}>
          Note: GitHub Pages serves under a sub-path; this build uses relative asset paths for compatibility.
        </p>
      </div>
    </div>
  )
}

export default App
