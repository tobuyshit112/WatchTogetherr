import { io } from 'socket.io-client'

// Same-origin connection: works in dev (Vite proxies /socket.io to the
// backend) and in production (Express serves the built client itself),
// so there's only ever one URL to share or tunnel.
export const socket = io({ autoConnect: true })

export function getStoredIdentity() {
  const name = localStorage.getItem('wt_name') || ''
  const color = localStorage.getItem('wt_color') || PRESET_COLORS[0]
  return { name, color }
}

export function saveIdentity(name, color) {
  localStorage.setItem('wt_name', name)
  localStorage.setItem('wt_color', color)
}

export const PRESET_COLORS = ['#ff6b81', '#4f9dff', '#ffb84f', '#8a6bff', '#4fd1a5', '#ff6bd6']
