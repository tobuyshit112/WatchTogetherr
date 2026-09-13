import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'

let ytApiPromise = null
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

const DRIFT_THRESHOLD = 1.5 // seconds of drift before we silently correct
const SEEK_THRESHOLD = 1.2 // seconds of difference before an incoming state applies a hard seek
const SUPPRESS_MS = 900 // how long to ignore local state-change echoes after we apply a remote/programmatic change

const VideoPlayer = forwardRef(function VideoPlayer(
  { videoId, remoteState, onLocalPlay, onLocalPause, onStatusChange },
  ref
) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const suppressUntilRef = useRef(0)
  const remoteStateRef = useRef(remoteState)
  const readyRef = useRef(false)
  const [errorMsg, setErrorMsg] = useState('')

  remoteStateRef.current = remoteState

  const applyRemoteState = useCallback((state, { forceSeek = false } = {}) => {
    const player = playerRef.current
    if (!player || !readyRef.current || !state) return
    const expected = state.isPlaying ? state.position + (Date.now() - state.serverTime) / 1000 : state.position
    const current = player.getCurrentTime?.() ?? 0
    if (forceSeek || Math.abs(current - expected) > SEEK_THRESHOLD) {
      player.seekTo(Math.max(expected, 0), true)
    }
    suppressUntilRef.current = Date.now() + SUPPRESS_MS
    if (state.isPlaying) player.playVideo()
    else player.pauseVideo()
  }, [])

  useImperativeHandle(ref, () => ({
    seekTo: (t) => {
      suppressUntilRef.current = Date.now() + SUPPRESS_MS
      playerRef.current?.seekTo(t, true)
    },
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
  }))

  useEffect(() => {
    let cancelled = false
    if (!videoId) return
    setErrorMsg('')
    loadYouTubeApi().then((YT) => {
      if (cancelled) return
      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
      }
      readyRef.current = false
      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            readyRef.current = true
            // Only force a seek/pause if we're joining mid-video. A freshly
            // loaded video should sit at its normal thumbnail + play button —
            // calling pauseVideo() on an unstarted player blanks it out.
            const state = remoteStateRef.current
            if (state && (state.isPlaying || state.position > 1)) {
              applyRemoteState(state, { forceSeek: true })
            }
          },
          onStateChange: (e) => {
            const YTState = window.YT.PlayerState
            if (Date.now() < suppressUntilRef.current) return
            if (e.data === YTState.PLAYING) {
              onStatusChange?.('watching')
              onLocalPlay?.(playerRef.current.getCurrentTime())
            } else if (e.data === YTState.PAUSED) {
              onStatusChange?.('paused')
              onLocalPause?.(playerRef.current.getCurrentTime())
            } else if (e.data === YTState.BUFFERING) {
              onStatusChange?.('buffering')
            }
          },
          onError: (e) => {
            const messages = {
              2: 'That YouTube link looks invalid.',
              5: "This video can't be played in an embedded player.",
              100: 'This video was removed or made private.',
              101: "The owner of this video has disabled it from playing on other sites — try a different link.",
              150: "The owner of this video has disabled it from playing on other sites — try a different link.",
            }
            setErrorMsg(messages[e.data] || "This video can't be loaded.")
          },
        },
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  useEffect(() => {
    applyRemoteState(remoteState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteState?.position, remoteState?.isPlaying, remoteState?.serverTime])

  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current
      const state = remoteStateRef.current
      if (!player || !readyRef.current || !state?.isPlaying) return
      if (Date.now() < suppressUntilRef.current) return
      const expected = state.position + (Date.now() - state.serverTime) / 1000
      const current = player.getCurrentTime?.() ?? 0
      if (Math.abs(current - expected) > DRIFT_THRESHOLD) {
        suppressUntilRef.current = Date.now() + SUPPRESS_MS
        player.seekTo(expected, true)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => () => playerRef.current?.destroy?.(), [])

  return (
    <div className="video-wrap">
      <div ref={containerRef} className="video-frame" />
      {!videoId && (
        <div className="video-placeholder">
          <p>Paste a YouTube link below to start watching together</p>
        </div>
      )}
      {videoId && errorMsg && (
        <div className="video-placeholder video-error">
          <p>{errorMsg}</p>
        </div>
      )}
    </div>
  )
})

export default VideoPlayer
