const STATUS_LABEL = {
  watching: 'Watching',
  paused: 'Paused',
  buffering: 'Buffering…',
  away: 'Away',
  disconnected: 'Disconnected',
}

export default function Participants({ participants, hostId, selfId, isCouple }) {
  return (
    <div className="participants-row">
      {participants.map((p) => (
        <div key={p.id} className={`participant-chip ${p.connected ? '' : 'offline'}`}>
          <span className="participant-dot" style={{ background: p.color }} />
          <span className="participant-name">
            {isCouple && '❤️ '}
            {p.name}
            {p.id === selfId ? ' (you)' : ''}
            {p.id === hostId ? ' 👑' : ''}
          </span>
          <span className="participant-status">{STATUS_LABEL[p.status] || p.status}</span>
        </div>
      ))}
    </div>
  )
}
