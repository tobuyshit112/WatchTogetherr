import { useEffect, useRef, useState } from 'react'

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export default function Chat({ messages, selfId, onSend, onJumpTo }) {
  const [text, setText] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {messages.length === 0 && <p className="chat-empty">Messages will show up here.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.senderId === selfId ? 'own' : ''}`}>
            <div className="chat-message-head">
              <span className="chat-name" style={{ color: m.color }}>{m.name}</span>
              <button className="chat-timestamp" onClick={() => onJumpTo?.(m.videoPosition)} title="Jump to this moment">
                {formatTime(m.videoPosition)}
              </button>
            </div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
      </div>
      <form className="chat-input-row" onSubmit={submit}>
        <input
          className="text-input"
          placeholder="Say something…"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="secondary-btn" type="submit">Send</button>
      </form>
    </div>
  )
}
