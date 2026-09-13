const WEB_APP_URL = SERVER_URL; // same origin serves the web app too

const DRIFT_THRESHOLD = 1.5;
const SEEK_THRESHOLD = 1.2;
const SUPPRESS_MS = 900;
const PRESET_COLORS = ['#ff6b81', '#4f9dff', '#ffb84f', '#8a6bff', '#4fd1a5', '#ff6bd6'];

let session = { connected: false, selfId: null, state: null, identity: null };
let video = null;
let suppressUntil = 0;
let lastAppliedPlayback = null; // last remote playback we know about, for drift checks

/* ---------- shadow DOM setup ---------- */

const host = document.createElement('div');
host.id = 'watch-together-host';
const shadow = host.attachShadow({ mode: 'open' });

shadow.innerHTML = `
  <style>${CSS_TEXT()}</style>
  <div class="wt-panel" id="wt-panel">
    <div class="wt-header" id="wt-header">
      <span>❤️ Watch Together</span>
      <button class="wt-icon-btn" id="wt-collapse" title="Collapse">–</button>
    </div>
    <div class="wt-body" id="wt-body"></div>
  </div>
  <div class="wt-reactions" id="wt-reactions"></div>
`;

function mountHost() {
  if (document.body) document.body.appendChild(host);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(host));
}
mountHost();

const panelEl = shadow.getElementById('wt-panel');
const bodyEl = shadow.getElementById('wt-body');
const reactionsEl = shadow.getElementById('wt-reactions');

shadow.getElementById('wt-collapse').addEventListener('click', () => {
  panelEl.classList.toggle('wt-collapsed');
});

function CSS_TEXT() {
  return `
  :host { all: initial; }
  .wt-panel {
    position: fixed; bottom: 20px; right: 20px; width: 300px; max-height: 70vh;
    background: rgba(15,16,22,0.92); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px; color: #e9e9f0; font: 13px/1.4 system-ui, sans-serif;
    z-index: 2147483000; display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5); backdrop-filter: blur(10px);
  }
  .wt-panel.wt-collapsed .wt-body { display: none; }
  .wt-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px; font-weight: 600; cursor: default;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .wt-icon-btn {
    background: rgba(255,255,255,0.08); border: none; color: #fff; width: 22px; height: 22px;
    border-radius: 6px; cursor: pointer; font-size: 14px; line-height: 1;
  }
  .wt-body { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .wt-field-label { font-size: 11px; color: #9a9aac; margin-bottom: 4px; display:block; }
  .wt-input {
    width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: #fff; outline: none;
  }
  .wt-color-row { display: flex; gap: 6px; margin-top: 4px; }
  .wt-color-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding:0; }
  .wt-color-dot.selected { border-color: #fff; }
  .wt-btn {
    padding: 9px; border-radius: 8px; border: none; background: linear-gradient(135deg,#ff6b81,#ff9472);
    color: #1a0d0f; font-weight: 700; cursor: pointer; font-size: 13px;
  }
  .wt-btn-secondary {
    padding: 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.06); color: #fff; cursor: pointer; font-size: 12px;
  }
  .wt-divider { text-align: center; color: #9a9aac; font-size: 11px; margin: 2px 0; }
  .wt-error { color: #ff5c5c; font-size: 12px; margin: 0; }
  .wt-participants { display: flex; flex-wrap: wrap; gap: 6px; }
  .wt-chip {
    display: flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px;
    background: rgba(255,255,255,0.06); font-size: 11px;
  }
  .wt-dot { width: 8px; height: 8px; border-radius: 50%; }
  .wt-reactions-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .wt-reactions-row button { background: none; border: none; font-size: 17px; cursor: pointer; padding: 3px; }
  .wt-chat-list { max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  .wt-chat-msg .wt-name { font-weight: 600; font-size: 11px; }
  .wt-chat-msg .wt-text { font-size: 12px; }
  .wt-chat-row { display: flex; gap: 6px; }
  .wt-hint { font-size: 11px; color: #9a9aac; margin: 0; }
  .wt-room-code { font-weight: 700; letter-spacing: 1px; }
  select.wt-input { -webkit-appearance: none; }
  .wt-reactions {
    position: fixed; inset: 0; pointer-events: none; z-index: 2147483001; overflow: hidden;
  }
  .wt-floating-emoji {
    position: absolute; bottom: 10%; font-size: 32px; animation: wt-float-up 2.4s ease-out forwards;
  }
  @keyframes wt-float-up {
    0% { transform: translateY(0) scale(0.8); opacity: 0; }
    15% { opacity: 1; }
    100% { transform: translateY(-220px) scale(1.1); opacity: 0; }
  }
  `;
}

/* ---------- identity ---------- */

function loadIdentity(cb) {
  chrome.storage.local.get(['wt_identity'], (data) => cb(data.wt_identity || { name: '', color: PRESET_COLORS[0] }));
}
function saveIdentity(name, color) {
  chrome.storage.local.set({ wt_identity: { name, color } });
}

/* ---------- rendering ---------- */

function render() {
  if (!session.state) {
    renderSetupView();
  } else {
    renderRoomView();
  }
}

function renderSetupView() {
  loadIdentity((identity) => {
    bodyEl.innerHTML = `
      <div>
        <span class="wt-field-label">Your name</span>
        <input class="wt-input" id="wt-name" placeholder="e.g. Sarah" maxlength="20" value="${identity.name || ''}" />
        <span class="wt-field-label" style="margin-top:8px;">Your colour</span>
        <div class="wt-color-row" id="wt-colors"></div>
      </div>
      <p class="wt-error" id="wt-error" style="display:none;"></p>
      <button class="wt-btn" id="wt-create">▶ Create Room</button>
      <div class="wt-divider">or</div>
      <span class="wt-field-label">Room code</span>
      <div class="wt-chat-row">
        <input class="wt-input" id="wt-code" placeholder="ABCD12" />
        <button class="wt-btn-secondary" id="wt-join">Join</button>
      </div>
      <p class="wt-hint">Both of you need this extension installed and your own Netflix login.</p>
    `;
    let selectedColor = identity.color || PRESET_COLORS[0];
    const colorsEl = shadow.getElementById('wt-colors');
    colorsEl.innerHTML = PRESET_COLORS.map(
      (c) => `<button type="button" class="wt-color-dot${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`
    ).join('');
    colorsEl.querySelectorAll('.wt-color-dot').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedColor = btn.dataset.color;
        colorsEl.querySelectorAll('.wt-color-dot').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });

    const nameInput = shadow.getElementById('wt-name');
    const errorEl = shadow.getElementById('wt-error');

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }

    shadow.getElementById('wt-create').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return showError('Enter your name first.');
      saveIdentity(name, selectedColor);
      chrome.runtime.sendMessage({ type: 'wt:createRoom', name, color: selectedColor }, (res) => {
        if (!res?.ok) return showError('Could not create a room. Try again.');
        session.selfId = res.selfId;
        session.state = res.state;
        render();
        maybeSyncCurrentVideo();
      });
    });

    shadow.getElementById('wt-join').addEventListener('click', () => {
      const name = nameInput.value.trim();
      const code = shadow.getElementById('wt-code').value.trim();
      if (!name) return showError('Enter your name first.');
      if (!code) return showError('Enter the room code.');
      saveIdentity(name, selectedColor);
      chrome.runtime.sendMessage({ type: 'wt:joinRoom', roomId: code, name, color: selectedColor }, (res) => {
        if (!res?.ok) return showError(res?.error || 'Could not join that room.');
        session.selfId = res.selfId;
        session.state = res.state;
        render();
      });
    });
  });
}

function renderRoomView() {
  const s = session.state;
  const isHost = s.hostId === session.selfId;
  const isCouple = s.participants.length <= 2;

  bodyEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span>${isCouple ? '❤️' : '👥'} Room <span class="wt-room-code">${s.roomId}</span></span>
      <button class="wt-btn-secondary" id="wt-invite">Invite</button>
    </div>
    <div class="wt-participants" id="wt-participants"></div>
    <button class="wt-btn-secondary" id="wt-sync">📡 Sync this video</button>
    <div class="wt-reactions-row" id="wt-reaction-row"></div>
    ${isHost ? `
      <div>
        <span class="wt-field-label">Who can control playback?</span>
        <select class="wt-input" id="wt-control-mode">
          <option value="everyone" ${s.controlMode === 'everyone' ? 'selected' : ''}>Everyone</option>
          <option value="host" ${s.controlMode === 'host' ? 'selected' : ''}>Host only</option>
        </select>
      </div>` : ''}
    <div class="wt-chat-list" id="wt-chat-list"></div>
    <div class="wt-chat-row">
      <input class="wt-input" id="wt-chat-input" placeholder="Say something…" maxlength="500" />
      <button class="wt-btn-secondary" id="wt-chat-send">Send</button>
    </div>
    <p class="wt-hint">Not synced with a video yet? Play the show, then hit "Sync this video".</p>
  `;

  updateParticipants();
  updateChatList();

  shadow.getElementById('wt-invite').addEventListener('click', () => {
    navigator.clipboard?.writeText(`${WEB_APP_URL}/room/${s.roomId}`);
    const btn = shadow.getElementById('wt-invite');
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = 'Invite'), 1500);
  });

  shadow.getElementById('wt-sync').addEventListener('click', () => {
    syncCurrentVideo();
  });

  const reactionRow = shadow.getElementById('wt-reaction-row');
  ['❤️', '😂', '😭', '😱', '😮', '🔥', '👏', '💀', '🥰'].forEach((emoji) => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'wt:reaction', emoji }));
    reactionRow.appendChild(btn);
  });

  const controlModeSelect = shadow.getElementById('wt-control-mode');
  if (controlModeSelect) {
    controlModeSelect.addEventListener('change', (e) => {
      chrome.runtime.sendMessage({ type: 'wt:setControlMode', mode: e.target.value });
    });
  }

  const chatInput = shadow.getElementById('wt-chat-input');
  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    chrome.runtime.sendMessage({ type: 'wt:chatMessage', text });
    chatInput.value = '';
  }
  shadow.getElementById('wt-chat-send').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

function updateParticipants() {
  if (!session.state) return;
  const el = shadow.getElementById('wt-participants');
  if (!el) return;
  el.innerHTML = session.state.participants
    .map(
      (p) => `
      <span class="wt-chip">
        <span class="wt-dot" style="background:${p.color}"></span>
        ${p.name}${p.id === session.selfId ? ' (you)' : ''}${p.id === session.state.hostId ? ' 👑' : ''}
      </span>`
    )
    .join('');
}

function updateChatList() {
  if (!session.state) return;
  const el = shadow.getElementById('wt-chat-list');
  if (!el) return;
  el.innerHTML = session.state.chat
    .slice(-30)
    .map(
      (m) => `<div class="wt-chat-msg"><span class="wt-name" style="color:${m.color}">${escapeHtml(m.name)}</span> <span class="wt-text">${escapeHtml(m.text)}</span></div>`
    )
    .join('');
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function spawnFloatingReaction(emoji) {
  const span = document.createElement('span');
  span.className = 'wt-floating-emoji';
  span.textContent = emoji;
  span.style.left = `${10 + Math.random() * 70}%`;
  reactionsEl.appendChild(span);
  setTimeout(() => span.remove(), 2500);
}

/* ---------- video sync ---------- */

function findVideo() {
  return document.querySelector('video');
}

function attachVideoListeners(v) {
  v.addEventListener('play', onLocalPlay);
  v.addEventListener('pause', onLocalPause);
  v.addEventListener('waiting', () => chrome.runtime.sendMessage({ type: 'wt:setStatus', status: 'buffering' }));
  v.addEventListener('playing', () => chrome.runtime.sendMessage({ type: 'wt:setStatus', status: 'watching' }));
}

function onLocalPlay() {
  if (Date.now() < suppressUntil || !session.state) return;
  chrome.runtime.sendMessage({ type: 'wt:playbackPlay', position: video.currentTime });
}
function onLocalPause() {
  if (Date.now() < suppressUntil || !session.state) return;
  chrome.runtime.sendMessage({ type: 'wt:playbackPause', position: video.currentTime });
}

function syncCurrentVideo() {
  if (!video) return;
  chrome.runtime.sendMessage({
    type: 'wt:setExternalSource',
    label: 'Netflix',
    position: video.currentTime || 0,
    isPlaying: !video.paused,
  });
}

function maybeSyncCurrentVideo() {
  // Only auto-sync right when a brand new room is created and a video is already playing.
  if (video && session.state && !session.state.video) syncCurrentVideo();
}

function applyPlayback(playback) {
  lastAppliedPlayback = playback;
  if (!video || !playback) return;
  const expected = playback.isPlaying ? playback.position + (Date.now() - playback.serverTime) / 1000 : playback.position;
  if (Math.abs(video.currentTime - expected) > SEEK_THRESHOLD) {
    video.currentTime = Math.max(expected, 0);
  }
  suppressUntil = Date.now() + SUPPRESS_MS;
  if (playback.isPlaying) video.play?.().catch(() => {});
  else video.pause?.();
}

// Poll for the video element (Netflix swaps it out between titles/episodes)
// and correct small drift while everyone should be playing.
setInterval(() => {
  const found = findVideo();
  if (found && found !== video) {
    video = found;
    attachVideoListeners(video);
  }
  if (!video || !lastAppliedPlayback?.isPlaying) return;
  if (Date.now() < suppressUntil) return;
  const expected = lastAppliedPlayback.position + (Date.now() - lastAppliedPlayback.serverTime) / 1000;
  if (Math.abs(video.currentTime - expected) > DRIFT_THRESHOLD) {
    suppressUntil = Date.now() + SUPPRESS_MS;
    video.currentTime = expected;
  }
}, 1500);

/* ---------- messages from background ---------- */

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case 'wt:roomState':
      session.selfId = msg.selfId;
      session.state = msg.state;
      render();
      break;
    case 'wt:participantsUpdate':
      if (session.state) session.state.participants = msg.participants;
      updateParticipants();
      break;
    case 'wt:chatMessage':
      if (session.state) session.state.chat = [...session.state.chat, msg.message];
      updateChatList();
      break;
    case 'wt:reaction':
      spawnFloatingReaction(msg.payload.emoji);
      break;
    case 'wt:videoChanged':
      if (session.state) {
        session.state.video = msg.video;
        session.state.playback = msg.playback;
      }
      applyPlayback(msg.playback);
      break;
    case 'wt:playbackUpdate':
      if (session.state) session.state.playback = msg.playback;
      applyPlayback(msg.playback);
      break;
    case 'wt:controlModeChanged':
      if (session.state) session.state.controlMode = msg.controlMode;
      render();
      break;
    case 'wt:hostChanged':
      if (session.state) session.state.hostId = msg.hostId;
      render();
      break;
    case 'wt:connectionStatus':
      session.connected = msg.connected;
      if (msg.selfId) session.selfId = msg.selfId;
      break;
  }
});

/* ---------- boot ---------- */

chrome.runtime.sendMessage({ type: 'wt:getState' }, (res) => {
  if (res?.ok && res.state) {
    session.selfId = res.selfId;
    session.state = res.state;
    lastAppliedPlayback = res.state.playback;
  }
  video = findVideo();
  if (video) attachVideoListeners(video);
  render();
});
