/* =========================================================
   CONFIG
   ========================================================= */

// Paste your deployed Google Apps Script Web App URL here.
// This is safe to be public — it no longer holds any secrets;
// the passphrase and passwords are checked on the server now.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrN5rk3t0g4mcz3D-1gBdmfoWvohFzJf3IN6paWCz9Amh6AVJRGM9ZelFHQrYLtc4B/exec";

/* ========================================================= */

const POLL_INTERVAL_MS = 4000;

let currentUser = null;
let sessionToken = null;
let lastMessageId = 0;
let pollTimer = null;
let isFetching = false; // prevents overlapping fetches from double-rendering a message
let renderedIds = new Set(); // tracks every message id already on screen, so nothing renders twice

const el = (id) => document.getElementById(id);

/* ---------- Lock screen (checked server-side now) ---------- */

el('lockSubmit').addEventListener('click', tryUnlock);
el('lockPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryUnlock();
});

async function tryUnlock() {
  const passphrase = el('lockPassword').value;
  if (!passphrase) return;

  el('lockSubmit').disabled = true;
  el('lockError').textContent = '';

  try {
    const url = `${APPS_SCRIPT_URL}?action=unlock&passphrase=${encodeURIComponent(passphrase)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'success') {
      el('lockScreen').classList.add('d-none');
      el('loginScreen').classList.remove('d-none');
    } else {
      el('lockError').textContent = "that's not it — try again";
      el('lockPassword').value = '';
    }
  } catch (err) {
    el('lockError').textContent = 'could not reach the server — check the setup';
  } finally {
    el('lockSubmit').disabled = false;
  }
}

/* ---------- User select / login ---------- */

document.querySelectorAll('.user-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.user-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    el('usernameField').value = btn.dataset.user;
  });
});

el('loginSubmit').addEventListener('click', tryLogin);
el('userPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tryLogin();
});

async function tryLogin() {
  const username = el('usernameField').value;
  const password = el('userPassword').value;
  if (!password) return;

  el('loginSubmit').disabled = true;
  el('loginError').textContent = '';

  try {
    const url = `${APPS_SCRIPT_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'success') {
      currentUser = data.user;
      sessionToken = data.token;
      enterChat();
    } else {
      el('loginError').textContent = data.message || 'wrong password';
    }
  } catch (err) {
    el('loginError').textContent = 'could not reach the server — check the setup';
  } finally {
    el('loginSubmit').disabled = false;
  }
}

/* ---------- Chat screen ---------- */

function enterChat() {
  el('loginScreen').classList.add('d-none');
  el('chatScreen').classList.remove('d-none');
  el('meLabel').textContent = currentUser;
  el('statusDot').classList.add('online');
  loadMessages(true);
  pollTimer = setInterval(() => loadMessages(false), POLL_INTERVAL_MS);
}

el('logoutBtn').addEventListener('click', () => {
  clearInterval(pollTimer);
  currentUser = null;
  sessionToken = null;
  lastMessageId = 0;
  renderedIds = new Set();
  el('messageList').innerHTML = '';
  el('chatScreen').classList.add('d-none');
  el('loginScreen').classList.remove('d-none');
  el('userPassword').value = '';
});

/* ---------- Sending messages ----------
   The message appears the instant you hit send (optimistic render),
   marked as "sending". Once the server confirms it, we swap in the
   real message id and mark it sent. That id gets added to
   renderedIds, so when the next poll fetches it back from the sheet,
   it's recognized as already-shown and skipped — no duplicate. */

el('composerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = el('messageInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  const tempId = 'temp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const row = appendMessage(
    { id: tempId, sender: currentUser, message: text, timestamp: new Date() },
    'sending'
  );

  try {
    const url = `${APPS_SCRIPT_URL}?action=send&token=${encodeURIComponent(sessionToken)}&message=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'error') {
      handleSessionError(data.message);
      return;
    }

    renderedIds.add(data.id);
    lastMessageId = Math.max(lastMessageId, data.id);
    row.dataset.id = data.id;
    row.classList.remove('sending');
  } catch (err) {
    row.classList.remove('sending');
    row.classList.add('failed');
  } finally {
    input.focus();
  }
});

async function loadMessages(isInitialLoad) {
  if (isFetching) return; // prevents an overlapping poll from rendering the same message twice
  isFetching = true;

  try {
    const url = `${APPS_SCRIPT_URL}?action=fetch&token=${encodeURIComponent(sessionToken)}&since=${lastMessageId}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'error') {
      handleSessionError(data.message);
      return;
    }

    if (isInitialLoad) {
      el('messageList').innerHTML = '';
      renderedIds = new Set();
    }

    if (isInitialLoad && data.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'msg-empty';
      empty.textContent = 'no messages yet — say hi';
      el('messageList').appendChild(empty);
    }

    data.messages.forEach((m) => {
      if (renderedIds.has(m.id)) return; // already on screen (e.g. our own optimistic message)
      const emptyState = el('messageList').querySelector('.msg-empty');
      if (emptyState) emptyState.remove();
      appendMessage(m);
      renderedIds.add(m.id);
      lastMessageId = Math.max(lastMessageId, m.id);
    });

    updateLastSeen(data.otherUser, data.otherLastSeen);
    el('statusDot').classList.add('online');
  } catch (err) {
    el('statusDot').classList.remove('online');
  } finally {
    isFetching = false;
  }
}

// If the session token expired or is invalid, kick back to login
// rather than silently failing.
function handleSessionError(message) {
  clearInterval(pollTimer);
  currentUser = null;
  sessionToken = null;
  el('chatScreen').classList.add('d-none');
  el('loginScreen').classList.remove('d-none');
  el('loginError').textContent = message || 'please log in again';
}

function appendMessage(m, status) {
  const row = document.createElement('div');
  row.className = `msg-row ${m.sender === currentUser ? 'mine' : 'theirs'}`;
  row.dataset.id = m.id;
  if (status) row.classList.add(status);

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = m.message;

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const time = new Date(m.timestamp);
  meta.textContent = isNaN(time) ? '' : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  row.appendChild(bubble);
  row.appendChild(meta);
  el('messageList').appendChild(row);
  el('messageList').scrollTop = el('messageList').scrollHeight;
  return row;
}

/* ---------- Last seen ---------- */

function updateLastSeen(otherUser, otherLastSeen) {
  const label = el('lastSeenLabel');
  if (!label) return;

  if (!otherUser) {
    label.textContent = '';
    return;
  }

  if (!otherLastSeen) {
    label.textContent = `${otherUser} hasn't logged in yet`;
    return;
  }

  const time = new Date(otherLastSeen);
  const formatted = isNaN(time)
    ? ''
    : time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  label.textContent = `${otherUser} last seen at ${formatted}`;
}

/* ---------- Change password ---------- */

el('settingsBtn').addEventListener('click', () => {
  el('oldPasswordField').value = '';
  el('newPasswordField').value = '';
  el('passwordError').textContent = '';
  el('passwordModal').classList.remove('d-none');
});

el('cancelPasswordBtn').addEventListener('click', () => {
  el('passwordModal').classList.add('d-none');
});

el('savePasswordBtn').addEventListener('click', async () => {
  const oldPassword = el('oldPasswordField').value;
  const newPassword = el('newPasswordField').value;
  el('passwordError').textContent = '';

  if (!oldPassword || !newPassword) {
    el('passwordError').textContent = 'fill in both fields';
    return;
  }

  el('savePasswordBtn').disabled = true;

  try {
    const url = `${APPS_SCRIPT_URL}?action=changePassword&token=${encodeURIComponent(sessionToken)}&oldPassword=${encodeURIComponent(oldPassword)}&newPassword=${encodeURIComponent(newPassword)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'success') {
      el('passwordModal').classList.add('d-none');
    } else {
      el('passwordError').textContent = data.message || 'could not change password';
    }
  } catch (err) {
    el('passwordError').textContent = 'could not reach the server';
  } finally {
    el('savePasswordBtn').disabled = false;
  }
});