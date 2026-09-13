import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { socket, getStoredIdentity, saveIdentity, PRESET_COLORS } from '../socket.js'

export default function Home() {
  const stored = getStoredIdentity()
  const [name, setName] = useState(stored.name)
  const [color, setColor] = useState(stored.color)
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  function startWatching() {
    if (!name.trim()) return setError('Enter your name first.')
    saveIdentity(name.trim(), color)
    setBusy(true)
    socket.emit('create-room', { name: name.trim(), color }, (res) => {
      setBusy(false)
      if (!res?.ok) return setError('Could not create a room. Try again.')
      navigate(`/room/${res.state.roomId}`, { state: { isHost: true } })
    })
  }

  function joinWithCode() {
    if (!name.trim()) return setError('Enter your name first.')
    if (!joinCode.trim()) return setError('Enter the room code your partner sent you.')
    saveIdentity(name.trim(), color)
    navigate(`/room/${joinCode.trim().toUpperCase()}`)
  }

  return (
    <div className="page-center">
      <div className="glass-card home-card">
        <div className="brand">
          <span className="brand-heart">❤</span>
          <h1>Watch Together</h1>
        </div>
        <p className="subtitle">Your private virtual couch. Paste a YouTube link, share the room, watch it at the same moment.</p>

        <label className="field-label">Your name</label>
        <input
          className="text-input"
          placeholder="e.g. Sarah"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="field-label">Your colour</label>
        <div className="color-row">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={`color-dot ${c === color ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Choose colour ${c}`}
            />
          ))}
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="primary-btn" disabled={busy} onClick={startWatching}>
          {busy ? 'Creating room…' : '▶ Start Watching'}
        </button>

        <div className="divider"><span>or</span></div>

        <label className="field-label">Have a room code?</label>
        <div className="join-row">
          <input
            className="text-input"
            placeholder="ABCD12"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button className="secondary-btn" onClick={joinWithCode}>Join</button>
        </div>
      </div>
    </div>
  )
}
