import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { socket, getStoredIdentity, saveIdentity, PRESET_COLORS } from '../socket.js'
import VideoPlayer from '../components/VideoPlayer.jsx'
import Chat from '../components/Chat.jsx'
import Participants from '../components/Participants.jsx'
import { ReactionBar, FloatingReactions } from '../components/Reactions.jsx'

export default function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)

  const [identity, setIdentity] = useState(getStoredIdentity())
  const [nameDraft, setNameDraft] = useState(identity.name)
  const [colorDraft, setColorDraft] = useState(identity.color)
  const [selfId, setSelfId] = useState(socket.id)
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [floating, setFloating] = useState([])
  const [copied, setCopied] = useState(false)

  const join = useCallback(
    (name, color) => {
      socket.emit('join-room', { roomId, name, color }, (res) => {
        if (!res?.ok) {
          setError(res?.error || 'Could not join this room.')
          return
        }
        setError('')
        setState(res.state)
      })
    },
    [roomId]
  )

  useEffect(() => {
    function onConnect() {
      setSelfId(socket.id)
      if (identity.name) join(identity.name, identity.color)
    }
    socket.on('connect', onConnect)
    if (socket.connected) onConnect()

    const onParticipants = (participants) => setState((s) => (s ? { ...s, participants } : s))
    const onChat = (msg) => setState((s) => (s ? { ...s, chat: [...s.chat, msg] } : s))
    const onReaction = ({ emoji }) => {
      const id = `${Date.now()}-${Math.random()}`
      setFloating((f) => [...f, { id, emoji, left: 10 + Math.random() * 70, duration: 2 + Math.random() }])
      setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 3000)
    }
    const onVideoChanged = ({ video, playback }) => setState((s) => (s ? { ...s, video, playback } : s))
    const onPlaybackUpdate = (playback) => setState((s) => (s ? { ...s, playback } : s))
    const onControlMode = ({ controlMode }) => setState((s) => (s ? { ...s, controlMode } : s))
    const onHostChanged = ({ hostId }) => setState((s) => (s ? { ...s, hostId } : s))

    socket.on('participants-update', onParticipants)
    socket.on('chat-message', onChat)
    socket.on('reaction', onReaction)
    socket.on('video-changed', onVideoChanged)
    socket.on('playback-update', onPlaybackUpdate)
    socket.on('control-mode-changed', onControlMode)
    socket.on('host-changed', onHostChanged)

    return () => {
      socket.off('connect', onConnect)
      socket.off('participants-update', onParticipants)
      socket.off('chat-message', onChat)
      socket.off('reaction', onReaction)
      socket.off('video-changed', onVideoChanged)
      socket.off('playback-update', onPlaybackUpdate)
      socket.off('control-mode-changed', onControlMode)
      socket.off('host-changed', onHostChanged)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, identity.name])

  function submitIdentity(e) {
    e.preventDefault()
    if (!nameDraft.trim()) return
    saveIdentity(nameDraft.trim(), colorDraft)
    const next = { name: nameDraft.trim(), color: colorDraft }
    setIdentity(next)
    join(next.name, next.color)
  }

  function loadVideo(e) {
    e.preventDefault()
    if (!videoUrl.trim()) return
    socket.emit('set-video', { url: videoUrl.trim() })
    setVideoUrl('')
  }

  function copyInvite() {
    navigator.clipboard?.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!identity.name) {
    return (
      <div className="page-center">
        <div className="glass-card home-card">
          <h1>Join the watch party</h1>
          <p className="subtitle">Room code: <strong>{roomId}</strong></p>
          <form onSubmit={submitIdentity}>
            <label className="field-label">Your name</label>
            <input className="text-input" value={nameDraft} maxLength={20} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
            <label className="field-label">Your colour</label>
            <div className="color-row">
              {PRESET_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`color-dot ${c === colorDraft ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColorDraft(c)}
                />
              ))}
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="primary-btn" type="submit">Join Room</button>
          </form>
        </div>
      </div>
    )
  }

  if (error && !state) {
    return (
      <div className="page-center">
        <div className="glass-card home-card">
          <h1>Hmm…</h1>
          <p className="error-text">{error}</p>
          <button className="primary-btn" onClick={() => navigate('/')}>Go home</button>
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="page-center">
        <p className="subtitle">Connecting…</p>
      </div>
    )
  }

  const isHost = state.hostId === selfId
  const canControl = state.controlMode === 'everyone' || isHost
  const isCouple = state.participants.length <= 2

  return (
    <div className="room-layout">
      <div className="room-topbar">
        <button className="icon-btn" onClick={() => navigate('/')}>←</button>
        <div className="room-title">{isCouple ? '❤️' : '👥'} Room {roomId}</div>
        <button className="secondary-btn" onClick={copyInvite}>{copied ? 'Copied!' : 'Invite'}</button>
      </div>

      <Participants participants={state.participants} hostId={state.hostId} selfId={selfId} isCouple={isCouple} />

      <div className="room-main">
        <div className="video-column">
          <div className="video-stage">
            <VideoPlayer
              ref={videoRef}
              videoId={state.video?.videoId}
              remoteState={state.playback}
              onLocalPlay={(position) => canControl && socket.emit('playback-play', { position })}
              onLocalPause={(position) => canControl && socket.emit('playback-pause', { position })}
              onStatusChange={(status) => socket.emit('set-status', { status })}
            />
            <FloatingReactions items={floating} />
          </div>

          <ReactionBar onReact={(emoji) => socket.emit('reaction', { emoji })} />

          <form className="video-url-row" onSubmit={loadVideo}>
            <input
              className="text-input"
              placeholder="Paste a YouTube link…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              disabled={!canControl}
            />
            <button className="secondary-btn" type="submit" disabled={!canControl}>Load</button>
          </form>

          {isHost && (
            <div className="host-controls">
              <span>Who can control playback?</span>
              <select
                value={state.controlMode}
                onChange={(e) => socket.emit('set-control-mode', { mode: e.target.value })}
              >
                <option value="everyone">Everyone</option>
                <option value="host">Host only</option>
              </select>
            </div>
          )}
        </div>

        <Chat
          messages={state.chat}
          selfId={selfId}
          onSend={(text) => socket.emit('chat-message', { text })}
          onJumpTo={(position) => {
            if (!canControl) return
            videoRef.current?.seekTo(position)
            socket.emit('playback-seek', { position })
          }}
        />
      </div>
    </div>
  )
}
