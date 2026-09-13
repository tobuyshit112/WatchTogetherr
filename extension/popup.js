chrome.runtime.sendMessage({ type: 'wt:getState' }, (res) => {
  const el = document.getElementById('status');
  if (!el) return;
  if (res?.state) {
    el.textContent = `In room ${res.state.roomId} with ${res.state.participants.length} ${res.state.participants.length === 1 ? 'person' : 'people'}.`;
  } else if (res?.connected) {
    el.textContent = 'Connected — not in a room yet.';
  } else {
    el.textContent = 'Not connected yet — open Netflix to get started.';
  }
});
