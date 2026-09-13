const REACTION_SET = ['❤️', '😂', '😭', '😱', '😮', '🔥', '👏', '💀', '🥰']

export function ReactionBar({ onReact }) {
  return (
    <div className="reaction-bar">
      {REACTION_SET.map((emoji) => (
        <button key={emoji} className="reaction-btn" onClick={() => onReact(emoji)}>
          {emoji}
        </button>
      ))}
    </div>
  )
}

export function FloatingReactions({ items }) {
  return (
    <div className="floating-reactions">
      {items.map((item) => (
        <span
          key={item.id}
          className="floating-emoji"
          style={{ left: `${item.left}%`, animationDuration: `${item.duration}s` }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  )
}
