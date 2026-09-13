const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const { createRoom, getRoom, currentPosition, roomPublicState, removeEmptyRoomsInterval } = require('./rooms');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.get('/health', (req, res) => res.json({ ok: true }));

// If the client has been built (npm run build), serve it so the whole app
// is reachable through this one server/port — simplest to share or tunnel.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/health|\/socket\.io).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function extractYoutubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function canControl(room, socketId) {
  return room.controlMode === 'everyone' || socketId === room.hostId;
}

io.on('connection', (socket) => {
  socket.data.roomId = null;

  socket.on('create-room', ({ name, color }, ack) => {
    const room = createRoom(socket.id, name || 'Host', color || '#ff6b81');
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    ack?.({ ok: true, state: roomPublicState(room) });
  });

  socket.on('join-room', ({ roomId, name, color }, ack) => {
    const room = getRoom((roomId || '').toUpperCase());
    if (!room) return ack?.({ ok: false, error: 'Room not found. Check the link and try again.' });

    room.participants.set(socket.id, {
      id: socket.id,
      name: name || 'Guest',
      color: color || '#4f9dff',
      status: 'watching',
      connected: true,
    });
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;

    ack?.({ ok: true, state: roomPublicState(room) });
    socket.to(room.roomId).emit('participant-joined', { participant: room.participants.get(socket.id) });
    io.to(room.roomId).emit('participants-update', Array.from(room.participants.values()));
  });

  socket.on('set-video', ({ url }, ack) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return ack?.({ ok: false, error: 'Room not found.' });
    if (!canControl(room, socket.id)) return ack?.({ ok: false, error: "You don't have permission to change the video." });
    const videoId = extractYoutubeId(url);
    if (!videoId) {
      return ack?.({ ok: false, error: "That doesn't look like a YouTube link. Only YouTube is supported right now." });
    }
    room.video = { provider: 'youtube', videoId, url };
    room.playback = { isPlaying: false, position: 0, updatedAt: Date.now() };
    io.to(room.roomId).emit('video-changed', { video: room.video, playback: { isPlaying: false, position: 0, serverTime: Date.now() } });
    ack?.({ ok: true });
  });

  // Used by the browser extension: marks the room as watching something that
  // can't be embedded (Netflix, Disney+, etc). No videoId — the extension on
  // each person's own machine syncs the actual <video> element directly.
  socket.on('set-external-source', ({ label, position = 0, isPlaying = false }, ack) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return ack?.({ ok: false, error: 'Room not found.' });
    if (!canControl(room, socket.id)) return ack?.({ ok: false, error: "You don't have permission to change the video." });
    room.video = { provider: 'external', label: label || 'External' };
    room.playback = { isPlaying, position, updatedAt: Date.now() };
    io.to(room.roomId).emit('video-changed', {
      video: room.video,
      playback: { isPlaying, position, serverTime: Date.now() },
    });
    ack?.({ ok: true });
  });

  function broadcastPlayback(room) {
    io.to(room.roomId).emit('playback-update', {
      isPlaying: room.playback.isPlaying,
      position: currentPosition(room),
      serverTime: Date.now(),
    });
  }

  socket.on('playback-play', ({ position }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || !canControl(room, socket.id)) return;
    room.playback = { isPlaying: true, position: position ?? currentPosition(room), updatedAt: Date.now() };
    broadcastPlayback(room);
  });

  socket.on('playback-pause', ({ position }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || !canControl(room, socket.id)) return;
    room.playback = { isPlaying: false, position: position ?? currentPosition(room), updatedAt: Date.now() };
    broadcastPlayback(room);
  });

  socket.on('playback-seek', ({ position }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || !canControl(room, socket.id)) return;
    room.playback = { ...room.playback, position, updatedAt: Date.now() };
    broadcastPlayback(room);
  });

  socket.on('set-status', ({ status }) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (!p) return;
    p.status = status;
    io.to(room.roomId).emit('participants-update', Array.from(room.participants.values()));
  });

  socket.on('set-control-mode', ({ mode }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || socket.id !== room.hostId) return;
    room.controlMode = mode === 'host' ? 'host' : 'everyone';
    io.to(room.roomId).emit('control-mode-changed', { controlMode: room.controlMode });
  });

  socket.on('transfer-host', ({ targetId }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || socket.id !== room.hostId) return;
    if (!room.participants.has(targetId)) return;
    room.hostId = targetId;
    io.to(room.roomId).emit('host-changed', { hostId: room.hostId });
  });

  socket.on('chat-message', ({ text }) => {
    const room = getRoom(socket.data.roomId);
    if (!room || !text?.trim()) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: socket.id,
      name: sender.name,
      color: sender.color,
      text: text.slice(0, 500),
      ts: Date.now(),
      videoPosition: Math.round(currentPosition(room)),
    };
    room.chat.push(message);
    if (room.chat.length > 200) room.chat.shift();
    io.to(room.roomId).emit('chat-message', message);
  });

  socket.on('reaction', ({ emoji }) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const sender = room.participants.get(socket.id);
    if (!sender) return;
    io.to(room.roomId).emit('reaction', { emoji, senderId: socket.id, name: sender.name });
  });

  socket.on('sync-request', (_data, ack) => {
    const room = getRoom(socket.data.roomId);
    if (!room) return ack?.({ ok: false });
    ack?.({ ok: true, state: roomPublicState(room) });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomId);
    if (!room) return;
    const p = room.participants.get(socket.id);
    if (p) {
      p.connected = false;
      p.status = 'disconnected';
    }
    io.to(room.roomId).emit('participants-update', Array.from(room.participants.values()));

    if (socket.id === room.hostId) {
      const nextHost = Array.from(room.participants.values()).find((x) => x.connected);
      if (nextHost) {
        room.hostId = nextHost.id;
        io.to(room.roomId).emit('host-changed', { hostId: room.hostId });
      }
    }

    setTimeout(() => {
      if (room.participants.get(socket.id)?.connected === false) {
        room.participants.delete(socket.id);
        io.to(room.roomId).emit('participants-update', Array.from(room.participants.values()));
      }
    }, 30000);
  });

  socket.on('rejoin', ({ roomId, name, color }, ack) => {
    const room = getRoom((roomId || '').toUpperCase());
    if (!room) return ack?.({ ok: false, error: 'Room no longer exists.' });
    room.participants.set(socket.id, {
      id: socket.id,
      name: name || 'Guest',
      color: color || '#4f9dff',
      status: 'watching',
      connected: true,
    });
    socket.join(room.roomId);
    socket.data.roomId = room.roomId;
    ack?.({ ok: true, state: roomPublicState(room) });
    io.to(room.roomId).emit('participants-update', Array.from(room.participants.values()));
  });
});

removeEmptyRoomsInterval();

server.listen(PORT, () => {
  console.log(`Watch Together server listening on http://0.0.0.0:${PORT}`);
});
