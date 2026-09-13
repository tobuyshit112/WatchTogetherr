importScripts('vendor/socket.io.min.js', 'config.js');

let socket = null;
let activeTabId = null;
let activeRoomId = null;
let identity = null; // { name, color }
let cachedState = null;

// Service workers get killed after ~30s idle and lose all in-memory state,
// so the essentials are mirrored to storage and restored on wake.
chrome.storage.local.get(['wt_session'], (data) => {
  const saved = data.wt_session;
  if (saved) {
    activeTabId = saved.activeTabId ?? null;
    activeRoomId = saved.activeRoomId ?? null;
    identity = saved.identity ?? null;
  }
});

function persistSession() {
  chrome.storage.local.set({ wt_session: { activeTabId, activeRoomId, identity } });
}

function notifyTab(message) {
  if (activeTabId == null) return;
  chrome.tabs.sendMessage(activeTabId, message).catch(() => {});
}

function ensureSocket() {
  if (socket) return socket;
  socket = io(SERVER_URL, { transports: ['websocket'] });

  socket.on('connect', () => {
    notifyTab({ type: 'wt:connectionStatus', connected: true, selfId: socket.id });
    if (activeRoomId && identity && !cachedState) {
      socket.emit('rejoin', { roomId: activeRoomId, name: identity.name, color: identity.color }, (res) => {
        if (res?.ok) {
          cachedState = res.state;
          notifyTab({ type: 'wt:roomState', state: res.state, selfId: socket.id });
        }
      });
    }
  });

  socket.on('disconnect', () => notifyTab({ type: 'wt:connectionStatus', connected: false }));

  socket.on('participants-update', (participants) => {
    if (cachedState) cachedState.participants = participants;
    notifyTab({ type: 'wt:participantsUpdate', participants });
  });
  socket.on('chat-message', (message) => {
    if (cachedState) cachedState.chat = [...(cachedState.chat || []), message];
    notifyTab({ type: 'wt:chatMessage', message });
  });
  socket.on('reaction', (payload) => notifyTab({ type: 'wt:reaction', payload }));
  socket.on('video-changed', ({ video, playback }) => {
    if (cachedState) {
      cachedState.video = video;
      cachedState.playback = playback;
    }
    notifyTab({ type: 'wt:videoChanged', video, playback });
  });
  socket.on('playback-update', (playback) => {
    if (cachedState) cachedState.playback = playback;
    notifyTab({ type: 'wt:playbackUpdate', playback });
  });
  socket.on('control-mode-changed', ({ controlMode }) => {
    if (cachedState) cachedState.controlMode = controlMode;
    notifyTab({ type: 'wt:controlModeChanged', controlMode });
  });
  socket.on('host-changed', ({ hostId }) => {
    if (cachedState) cachedState.hostId = hostId;
    notifyTab({ type: 'wt:hostChanged', hostId });
  });

  return socket;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const s = ensureSocket();

  switch (msg.type) {
    case 'wt:createRoom': {
      activeTabId = sender.tab?.id ?? activeTabId;
      identity = { name: msg.name, color: msg.color };
      s.emit('create-room', { name: msg.name, color: msg.color }, (res) => {
        if (res?.ok) {
          activeRoomId = res.state.roomId;
          cachedState = res.state;
          persistSession();
        }
        sendResponse({ ...res, selfId: s.id });
      });
      return true;
    }
    case 'wt:joinRoom': {
      activeTabId = sender.tab?.id ?? activeTabId;
      identity = { name: msg.name, color: msg.color };
      s.emit('join-room', { roomId: msg.roomId, name: msg.name, color: msg.color }, (res) => {
        if (res?.ok) {
          activeRoomId = res.state.roomId;
          cachedState = res.state;
          persistSession();
        }
        sendResponse({ ...res, selfId: s.id });
      });
      return true;
    }
    case 'wt:setExternalSource':
      s.emit(
        'set-external-source',
        { label: msg.label, position: msg.position, isPlaying: msg.isPlaying },
        (res) => sendResponse(res)
      );
      return true;
    case 'wt:playbackPlay':
      s.emit('playback-play', { position: msg.position });
      return false;
    case 'wt:playbackPause':
      s.emit('playback-pause', { position: msg.position });
      return false;
    case 'wt:playbackSeek':
      s.emit('playback-seek', { position: msg.position });
      return false;
    case 'wt:setStatus':
      s.emit('set-status', { status: msg.status });
      return false;
    case 'wt:chatMessage':
      s.emit('chat-message', { text: msg.text });
      return false;
    case 'wt:reaction':
      s.emit('reaction', { emoji: msg.emoji });
      return false;
    case 'wt:setControlMode':
      s.emit('set-control-mode', { mode: msg.mode });
      return false;
    case 'wt:getState':
      sendResponse({ ok: true, state: cachedState, selfId: s.id, connected: s.connected, identity });
      return false;
    case 'wt:leaveRoom':
      activeRoomId = null;
      cachedState = null;
      persistSession();
      return false;
    default:
      return false;
  }
});

// Keeps the service worker checking in periodically so a dropped socket
// reconnects even if nothing else has woken the worker up recently.
chrome.alarms.create('wt-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {
  if (socket && !socket.connected) socket.connect();
});
