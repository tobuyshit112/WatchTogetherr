const { customAlphabet } = require('nanoid');
const makeRoomId = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

// In-memory room store. roomId -> room
const rooms = new Map();

function createRoom(hostSocketId, hostName, hostColor) {
  const roomId = makeRoomId();
  const room = {
    roomId,
    hostId: hostSocketId,
    controlMode: 'everyone', // 'everyone' | 'host'
    participants: new Map(),
    video: null, // { videoId, title, url }
    playback: { isPlaying: false, position: 0, updatedAt: Date.now() },
    chat: [],
    createdAt: Date.now(),
  };
  room.participants.set(hostSocketId, {
    id: hostSocketId,
    name: hostName,
    color: hostColor,
    status: 'watching',
    connected: true,
  });
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

function currentPosition(room) {
  const { isPlaying, position, updatedAt } = room.playback;
  if (!isPlaying) return position;
  return position + (Date.now() - updatedAt) / 1000;
}

function roomPublicState(room) {
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    controlMode: room.controlMode,
    video: room.video,
    playback: {
      isPlaying: room.playback.isPlaying,
      position: currentPosition(room),
      serverTime: Date.now(),
    },
    participants: Array.from(room.participants.values()),
    chat: room.chat.slice(-100),
  };
}

function removeEmptyRoomsInterval() {
  setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms) {
      const anyConnected = Array.from(room.participants.values()).some((p) => p.connected);
      if (!anyConnected && now - room.createdAt > 5 * 60 * 1000) {
        rooms.delete(id);
      }
    }
  }, 60 * 1000);
}

module.exports = { rooms, createRoom, getRoom, currentPosition, roomPublicState, removeEmptyRoomsInterval };
