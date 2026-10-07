// ---------------------------------------------------------------------------
// ChatApp frontend: personal chat, group chat, media sharing and AI helpers.
// ---------------------------------------------------------------------------
const token = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !currentUser) {
  location.href = "login.html";
}

document.getElementById("me").textContent = `Logged in as ${currentUser.name}`;

const socket = io(CHAT_SOCKET_BASE, { auth: { token } });

const API = {
  users: `${CHAT_API_BASE}/api/users`,
  messages: `${CHAT_API_BASE}/api/messages`,
  groups: `${CHAT_API_BASE}/api/groups`,
  upload: `${CHAT_API_BASE}/api/upload`,
  ai: `${CHAT_API_BASE}/api/ai`
};

const textInput = document.getElementById("text");
const suggestionsBox = document.getElementById("suggestions");
const quickRepliesBox = document.getElementById("quickReplies");
const toneSelect = document.getElementById("tone");
const messagesBox = document.getElementById("messages");
const roomBar = document.getElementById("roomBar");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const micBtn = document.getElementById("micBtn");
const deleteDialog = document.getElementById("deleteDialog");
const deleteDialogError = document.getElementById("deleteDialogError");
const deleteForEveryoneButton = document.getElementById("deleteForEveryone");
const deleteForMeButton = document.getElementById("deleteForMe");
let selectedMessageToDelete = null;

// --- state ---
let mode = "personal"; // "personal" | "group"
let currentRoom = null;
let loadedRoom = null;
let receiverUser = null; // email of the other person (personal chat)
let currentGroupId = null;
let lastIncomingText = "";
const renderedIds = new Set();

// --- AI tuning (keeps the OpenRouter quota safe from fast typing) ---
const SUGGEST_DEBOUNCE_MS = 600;
const SUGGEST_COOLDOWN_MS = 1500;
const MIN_SUGGEST_LENGTH = 3;
const AI_BACKOFF_MS = 10000;

let suggestTimer = null;
let suggestRetryTimer = null;
let suggestController = null;
let lastSuggestText = "";
let lastSuggestAt = 0;
let suggestBackoffUntil = 0;
let replyController = null;
let lastReplyKey = "";
let replyBackoffUntil = 0;

// Deterministic room id - same helper as the backend. Used for display and for
// the join_room call; the server recomputes and verifies it.
function createRoomId(emailA, emailB) {
  return [emailA.toLowerCase(), emailB.toLowerCase()].sort().join("_");
}

function isCurrentConversationMessage(message, roomId = currentRoom) {
  if (!message || message.roomId !== roomId) return false;

  const groupId = message.groupId && (message.groupId._id || message.groupId);
  if (mode === "group") {
    return Boolean(currentGroupId) &&
      String(groupId) === String(currentGroupId) &&
      !message.receiverId;
  }

  return !groupId && Boolean(message.receiverId);
}

// --- tabs ---
function switchTab(tab) {
  if (mode !== tab) {
    if (mode === "group") {
      document.getElementById("groupSelect").value = "";
    }

    currentRoom = null;
    loadedRoom = null;
    receiverUser = null;
    currentGroupId = null;
    messagesBox.replaceChildren();
    renderedIds.clear();
    roomBar.textContent = "";
    roomBar.classList.add("hidden");
    resetAiState();
  }

  mode = tab;
  document.getElementById("tabPersonal").classList.toggle("active", tab === "personal");
  document.getElementById("tabGroup").classList.toggle("active", tab === "group");
  document.getElementById("personalPanel").classList.toggle("hidden", tab !== "personal");
  document.getElementById("groupPanel").classList.toggle("hidden", tab !== "group");
}

// --- personal chat ---
async function startChat() {
  const email = document.getElementById("receiver").value.trim().toLowerCase();
  const msg = document.getElementById("personalMsg");

  msg.textContent = "";

  if (!email) {
    msg.textContent = "Enter the other user's email";
    return;
  }

  // Validate the email on the BACKEND before joining any room.
  const res = await fetch(`${API.users}/check?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  if (!data.success) {
    msg.textContent = data.message || "User not found";
    return;
  }

  switchTab("personal");
  msg.textContent = `Chatting with ${data.user.name}`;
  receiverUser = data.user.email;
  currentGroupId = null;

  currentRoom = createRoomId(currentUser.email, receiverUser);
  socket.emit("join_room", { roomId: currentRoom, receiverEmail: receiverUser });

  showRoom(`Personal room: ${currentRoom}`);
  resetAiState();
  await loadMessages();
}

function showRoom(text) {
  roomBar.textContent = text;
  roomBar.classList.remove("hidden");
}

async function loadMessages() {
  const roomId = currentRoom;
  if (!roomId) return;
  loadedRoom = null;
  messagesBox.replaceChildren();
  renderedIds.clear();

  const res = await fetch(`${API.messages}/${encodeURIComponent(roomId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok || roomId !== currentRoom) return;

  const data = await res.json();
  messagesBox.innerHTML = "";
  renderedIds.clear();
  (data.messages || []).forEach(addMessage);
  loadedRoom = roomId;
  scrollToBottom();
}

async function pollMessages() {
  const roomId = currentRoom;
  if (!roomId || loadedRoom !== roomId) return;

  try {
    const res = await fetch(`${API.messages}/${encodeURIComponent(roomId)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok || roomId !== currentRoom) return;

    const data = await res.json();
    const roomMessages = data.messages || [];
    reconcileMessages(roomMessages);
    roomMessages.forEach((message) => {
      const isNew = message._id && !renderedIds.has(String(message._id));
      addMessage(message);

      const sender = message.senderId || {};
      const senderId = sender._id || sender;
      if (isNew && String(senderId) !== String(currentUser.id) && (message.messageType || "text") === "text") {
        lastIncomingText = message.text;
        requestSmartReplies(message.text);
      }
    });
  } catch {
  }
}

function scrollToBottom() {
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

function reconcileMessages(messages) {
  const visibleIds = new Set(
    messages.filter(isCurrentConversationMessage).map((message) => String(message._id))
  );

  messagesBox.querySelectorAll("[data-message-id]").forEach((element) => {
    if (!visibleIds.has(element.dataset.messageId)) {
      renderedIds.delete(element.dataset.messageId);
      element.remove();
    }
  });
}

// Render a text or media message (images, videos, files).
function addMessage(message) {
  if (!isCurrentConversationMessage(message)) return;

  // Guard against showing the same message twice (socket broadcast + local echo).
  if (message._id) {
    if (renderedIds.has(String(message._id))) {
      const existing = messagesBox.querySelector(
        `[data-message-id="${CSS.escape(String(message._id))}"]`
      );
      if (message.deletedForEveryone && existing?.dataset.deletedForEveryone !== "true") {
        existing.dataset.deletedForEveryone = "true";
        renderDeletedMessage(existing);
      }
      return;
    }
    renderedIds.add(String(message._id));
  }

  const sender = message.senderId || {};
  const senderId = sender._id || sender;
  const senderName = sender.name || "User";

  const div = document.createElement("div");
  div.className = String(senderId) === String(currentUser.id) ? "message mine" : "message";
  div.dataset.messageId = String(message._id || "");
  div.dataset.senderId = String(senderId);
  div.dataset.deletedForEveryone = String(Boolean(message.deletedForEveryone));

  if (message.deletedForEveryone) {
    renderDeletedMessage(div);
    messagesBox.appendChild(div);
    scrollToBottom();
    return;
  }

  if (message._id) {
    const actions = document.createElement("div");
    actions.className = "message-actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "message-delete-button";
    deleteButton.textContent = "⋮";
    deleteButton.title = "Delete message";
    deleteButton.setAttribute("aria-label", "Delete message");
    deleteButton.addEventListener("click", () => showDeleteDialog(message));
    actions.appendChild(deleteButton);
    div.appendChild(actions);
  }

  const who = document.createElement("div");
  who.className = "msg-author";
  who.textContent = senderName;
  div.appendChild(who);

  renderBody(div, message);
  messagesBox.appendChild(div);
  scrollToBottom();
}

function renderDeletedMessage(element) {
  element.classList.add("deleted-message");
  element.replaceChildren();

  const text = document.createElement("div");
  text.className = "msg-text";
  text.textContent = element.dataset.senderId === String(currentUser.id)
    ? "You deleted this message"
    : "This message was deleted";
  element.appendChild(text);
}

function renderBody(container, message) {
  const type = message.messageType || "text";

  if (type === "text") {
    const p = document.createElement("div");
    p.className = "msg-text";
    p.textContent = message.text;
    container.appendChild(p);
    return;
  }

  if (type === "image") {
    const img = document.createElement("img");
    img.className = "msg-media";
    img.src = message.mediaUrl;
    img.alt = message.mediaName || "image";
    container.appendChild(img);
    addMediaLink(container, message, "Open");
    return;
  }

  if (type === "video") {
    const video = document.createElement("video");
    video.className = "msg-media";
    video.src = message.mediaUrl;
    video.controls = true;
    container.appendChild(video);
    return;
  }

  if (type === "audio") {
    const audio = document.createElement("audio");
    audio.className = "msg-audio";
    audio.src = message.mediaUrl;
    audio.controls = true;
    audio.preload = "metadata";
    container.appendChild(audio);
    return;
  }

  // pdf / document / other file
  addMediaLink(container, message, message.mediaName || "Download file");
}

function addMediaLink(container, message, label) {
  const a = document.createElement("a");
  a.className = "msg-file";
  a.href = message.mediaUrl;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = label;
  container.appendChild(a);
}

function showDeleteDialog(message) {
  selectedMessageToDelete = message;
  const sender = message.senderId || {};
  const senderId = sender._id || sender;
  const canDeleteForEveryone = String(senderId) === String(currentUser.id);
  deleteForEveryoneButton.classList.toggle("hidden", !canDeleteForEveryone);
  deleteDialogError.textContent = "";
  deleteDialog.showModal();
}

async function deleteSelectedMessage(scope) {
  if (!selectedMessageToDelete || !currentRoom) return;

  const message = selectedMessageToDelete;
  const roomId = currentRoom;
  const buttons = [deleteForEveryoneButton, deleteForMeButton, document.getElementById("cancelDelete")];
  buttons.forEach((button) => { button.disabled = true; });
  deleteDialogError.textContent = "";

  try {
    const res = await fetch(
      `${API.messages}/${encodeURIComponent(roomId)}/${encodeURIComponent(message._id)}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ scope })
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Message could not be deleted");

    if (scope === "everyone") {
      selectedMessageToDelete.deletedForEveryone = true;
      const element = messagesBox.querySelector(
        `[data-message-id="${CSS.escape(String(message._id))}"]`
      );
      if (element) {
        element.dataset.deletedForEveryone = "true";
        renderDeletedMessage(element);
      }
    } else {
      removeMessageElement(message._id);
    }
    deleteDialog.close();
  } catch (error) {
    deleteDialogError.textContent = error.message;
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function removeMessageElement(messageId) {
  const id = String(messageId);
  messagesBox.querySelector(`[data-message-id="${CSS.escape(id)}"]`)?.remove();
  renderedIds.delete(id);
}

deleteForEveryoneButton.addEventListener("click", () => deleteSelectedMessage("everyone"));
deleteForMeButton.addEventListener("click", () => deleteSelectedMessage("me"));
document.getElementById("cancelDelete").addEventListener("click", () => deleteDialog.close());
deleteDialog.addEventListener("close", () => {
  selectedMessageToDelete = null;
  deleteDialogError.textContent = "";
});

async function sendMessage() {
  const value = textInput.value.trim();
  if (!value) return;

  if (
    !currentRoom ||
    (mode === "group" && (!currentGroupId || currentRoom !== `group_${currentGroupId}`)) ||
    (mode === "personal" && (!receiverUser || currentRoom !== createRoomId(currentUser.email, receiverUser)))
  ) return;

  const roomId = currentRoom;
  const body = mode === "group"
    ? { groupId: currentGroupId, text: value }
    : { receiverEmail: receiverUser, text: value };
  const messageElement = document.getElementById(mode === "group" ? "groupMsg" : "personalMsg");

  try {
    const res = await fetch(`${API.messages}/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Message could not be sent");

    if (roomId === currentRoom) addMessage(data.message);
    textInput.value = "";
    if (messageElement) messageElement.textContent = "";
    resetAiState();
  } catch (error) {
    if (messageElement) messageElement.textContent = error.message;
  }
}

// --- media sharing (uploaded to AWS S3 through the backend) ---
async function uploadMedia() {
  const input = document.getElementById("fileInput");
  const status = document.getElementById("uploadStatus");
  const file = input.files && input.files[0];

  if (!file) {
    status.textContent = "Choose a file first";
    return;
  }

  if (mode === "group" && !currentGroupId) {
    status.textContent = "Open a group first";
    return;
  }
  if (mode === "personal" && !receiverUser) {
    status.textContent = "Start a personal chat first";
    return;
  }

  const form = new FormData();
  form.append("file", file);

  if (mode === "group") {
    form.append("roomType", "group");
    form.append("groupId", currentGroupId);
  } else {
    form.append("roomType", "personal");
    form.append("receiverEmail", receiverUser);
  }

  const btn = document.getElementById("uploadBtn");
  btn.disabled = true;
  status.textContent = `Uploading ${file.name}...`;

  try {
    const res = await fetch(API.upload, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });

    const data = await res.json();

    if (!res.ok) {
      // If the upload fails we never send a socket media message.
      status.textContent = data.message || "Upload failed";
      return;
    }

    // The backend already broadcast this to the room; we also add it locally
    // so the sender sees it instantly.
    addMessage(data.data);
    status.textContent = "Sent";
    input.value = "";
  } catch (error) {
    status.textContent = "Upload error: " + error.message;
  } finally {
    btn.disabled = false;
    setTimeout(() => { status.textContent = ""; }, 3000);
  }
}

// --- group chat ---
async function loadMembers() {
  const res = await fetch(API.users, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;

  const data = await res.json();
  const select = document.getElementById("memberSelect");
  select.innerHTML = "";

  (data.users || []).forEach((user) => {
    const option = document.createElement("option");
    option.value = user.email;
    option.textContent = `${user.name} (${user.email})`;
    select.appendChild(option);
  });
}

async function loadGroups() {
  const res = await fetch(API.groups, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return;

  const data = await res.json();
  const select = document.getElementById("groupSelect");
  select.innerHTML = '<option value="">My groups...</option>';

  (data.groups || []).forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = `${group.name} (${group.members.length} members)`;
    select.appendChild(option);
  });
}

async function createGroup() {
  const name = document.getElementById("groupName").value.trim();
  const msg = document.getElementById("groupMsg");
  const select = document.getElementById("memberSelect");
  const memberEmails = Array.from(select.selectedOptions).map((o) => o.value);

  msg.textContent = "";

  if (!name) {
    msg.textContent = "Enter a group name";
    return;
  }
  if (!memberEmails.length) {
    msg.textContent = "Select at least one member";
    return;
  }

  const res = await fetch(API.groups, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, memberEmails })
  });

  const data = await res.json();

  if (!data.success) {
    msg.textContent = data.message || "Could not create group";
    return;
  }

  msg.textContent = `Group "${data.group.name}" created`;
  document.getElementById("groupName").value = "";
  Array.from(select.options).forEach((o) => { o.selected = false; });

  await loadGroups();
  joinGroup(data.group.id);
}

function openGroup(groupId) {
  if (groupId) joinGroup(groupId);
}

function joinGroup(groupId) {
  switchTab("group");
  currentGroupId = groupId;
  currentRoom = `group_${groupId}`;
  receiverUser = null;
  socket.emit("join_group", { groupId });
  resetAiState();
  loadMessages();
}

// --- AI: tone ---
if (toneSelect) {
  toneSelect.value = localStorage.getItem("tone") || "casual";
  toneSelect.addEventListener("change", () => {
    localStorage.setItem("tone", toneSelect.value);
    lastSuggestText = "";
    clearSuggestions();
    if (lastIncomingText) requestSmartReplies(lastIncomingText);
  });
}
const currentTone = () => (toneSelect ? toneSelect.value : undefined);

function clearSuggestions() {
  if (suggestionsBox) suggestionsBox.innerHTML = "";
}

function renderSuggestions(list) {
  clearSuggestions();
  if (!Array.isArray(list) || !list.length) return;

  list.forEach((suggestion) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip suggestion-chip";
    chip.textContent = suggestion;

    chip.addEventListener("click", () => {
      const current = textInput.value.trim();
      textInput.value = current ? `${current} ${suggestion}` : suggestion;
      textInput.focus();
      clearSuggestions();
      requestSuggestions();
    });

    suggestionsBox.appendChild(chip);
  });
}

async function requestSuggestions() {
  const text = textInput.value.trim();

  if (!currentRoom || text.length < MIN_SUGGEST_LENGTH) {
    clearSuggestions();
    return;
  }
  if (text === lastSuggestText) return;

  const now = Date.now();
  if (now < suggestBackoffUntil || now - lastSuggestAt < SUGGEST_COOLDOWN_MS) {
    clearTimeout(suggestRetryTimer);
    suggestRetryTimer = setTimeout(requestSuggestions, SUGGEST_COOLDOWN_MS);
    return;
  }

  if (suggestController) suggestController.abort();
  suggestController = new AbortController();
  lastSuggestText = text;
  lastSuggestAt = Date.now();

  try {
    const res = await fetch(`${API.ai}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text, roomId: currentRoom, style: currentTone() }),
      signal: suggestController.signal
    });

    if (res.status === 429) {
      suggestBackoffUntil = Date.now() + AI_BACKOFF_MS;
      clearSuggestions();
      return;
    }

    const data = await res.json();
    renderSuggestions(data.suggestions);
  } catch (error) {
    if (error.name !== "AbortError") {
      lastSuggestText = "";
      clearSuggestions();
    }
  }
}

// --- AI: smart replies ---
function clearQuickReplies() {
  if (quickRepliesBox) quickRepliesBox.innerHTML = "";
}

function renderQuickReplies(list) {
  clearQuickReplies();
  if (!Array.isArray(list) || !list.length) return;

  list.forEach((reply) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip quick-reply";
    chip.textContent = reply;

    chip.addEventListener("click", () => {
      textInput.value = reply;
      clearQuickReplies();
      sendMessage();
    });

    quickRepliesBox.appendChild(chip);
  });
}

async function requestSmartReplies(lastMessage) {
  const text = String(lastMessage || "").trim();
  if (!currentRoom || !text) return;
  if (Date.now() < replyBackoffUntil) return;

  const key = `${currentRoom}|${currentTone()}|${text}`;
  if (key === lastReplyKey) return;

  if (replyController) replyController.abort();
  replyController = new AbortController();
  lastReplyKey = key;

  try {
    const res = await fetch(`${API.ai}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId: currentRoom, lastMessage: text, style: currentTone() }),
      signal: replyController.signal
    });

    if (res.status === 429) {
      replyBackoffUntil = Date.now() + AI_BACKOFF_MS;
      clearQuickReplies();
      return;
    }

    const data = await res.json();
    renderQuickReplies(data.replies);
  } catch (error) {
    if (error.name !== "AbortError") {
      lastReplyKey = "";
      clearQuickReplies();
    }
  }
}

// Reset all AI request state (used when the room changes or a message is sent).
function resetAiState() {
  clearTimeout(suggestTimer);
  clearTimeout(suggestRetryTimer);
  if (suggestController) suggestController.abort();
  if (replyController) replyController.abort();

  lastSuggestText = "";
  lastSuggestAt = 0;
  lastReplyKey = "";

  clearSuggestions();
  clearQuickReplies();
}

// --- socket events ---
socket.on("room_joined", async ({ roomId, roomType, groupId }) => {
  if (roomId !== currentRoom) return;

  if (roomType === "group") {
    if (mode !== "group" || String(groupId) !== String(currentGroupId)) return;
    currentGroupId = groupId;
    const option = Array.from(document.getElementById("groupSelect").options)
      .find((o) => o.value === groupId);
    const label = option ? option.textContent.replace(/\s*\(\d+ members\)$/, "") : "Group";
    showRoom(`Group: ${label} (${roomId})`);
  } else if (roomType !== "personal" || mode !== "personal") {
    return;
  }

  await loadMessages();
});

socket.on("new_message", (message) => {
  if (message.roomId !== currentRoom) return;

  addMessage(message);

  const sender = message.senderId || {};
  const senderId = sender._id || sender;
  const isText = (message.messageType || "text") === "text";

  if (String(senderId) !== String(currentUser.id) && isText) {
    lastIncomingText = message.text;
    requestSmartReplies(message.text);
  }
});

socket.on("message_deleted", ({ roomId, messageId, scope, userId }) => {
  if (roomId !== currentRoom) return;
  if (scope === "me" && String(userId) !== String(currentUser.id)) return;
  if (scope === "everyone") {
    const element = messagesBox.querySelector(
      `[data-message-id="${CSS.escape(String(messageId))}"]`
    );
    if (element) {
      element.dataset.deletedForEveryone = "true";
      renderDeletedMessage(element);
    }
  } else {
    removeMessageElement(messageId);
  }
});

socket.on("chat_error", (error) => {
  const target = mode === "group" ? "groupMsg" : "personalMsg";
  const el = document.getElementById(target);
  if (el) el.textContent = error.message;
  else alert(error.message);
});

setInterval(pollMessages, 2000);

// --- form + typing ---
document.getElementById("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage();
});

textInput.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  clearTimeout(suggestRetryTimer);
  suggestTimer = setTimeout(requestSuggestions, SUGGEST_DEBOUNCE_MS);
});

// --- WhatsApp-style emoji picker ---
const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😎","🤩","🤔","😐","😑","😶","🙄","😏","😣","😥","😮","🤐","😯","😪","😫","🥱","😴","🤗","🤭","🤫","🤥","😌","😛","😜","🤪","😝","🤤","🤢","🤮","😷","🤒","🤕","🥳","😡","😠","😱","😢","😭","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💯","👍","👎","👏","🙏","🔥","🎉","💯","✨","✅","❌","😂","🤣","❤️"
];

if (emojiBtn && emojiPicker) {
  EMOJIS.forEach((emoji) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-item";
    b.textContent = emoji;
    b.title = emoji;
    b.addEventListener("click", () => {
      const start = textInput.selectionStart ?? textInput.value.length;
      const end = textInput.selectionEnd ?? textInput.value.length;
      textInput.value = textInput.value.slice(0, start) + emoji + textInput.value.slice(end);
      textInput.focus();
      const pos = start + emoji.length;
      textInput.setSelectionRange(pos, pos);
      requestSuggestions();
    });
    emojiPicker.appendChild(b);
  });

  emojiBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    emojiPicker.classList.toggle("hidden");
  });

  document.addEventListener("click", (event) => {
    if (!emojiPicker.contains(event.target) && event.target !== emojiBtn) {
      emojiPicker.classList.add("hidden");
    }
  });
}

// --- Real microphone voice messages using MediaRecorder + existing S3 upload API ---
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartedAt = 0;
let recordingTimer = null;

function setMicState(recording) {
  if (!micBtn) return;
  micBtn.classList.toggle("recording", recording);
  micBtn.textContent = recording ? "⏹" : "🎤";
  micBtn.title = recording ? "Stop recording" : "Record voice message";
  micBtn.setAttribute("aria-label", recording ? "Stop recording" : "Record voice message");
}

function updateRecordingLabel() {
  if (!micBtn || !mediaRecorder) return;
  const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
  micBtn.textContent = `⏹ ${seconds}s`;
}

async function startVoiceRecording() {
  if (mode === "group" && !currentGroupId) {
    alert("Open a group first");
    return;
  }
  if (mode === "personal" && !receiverUser) {
    alert("Start a personal chat first");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    alert("Voice recording is not supported by this browser.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((x) => MediaRecorder.isTypeSupported(x));
    mediaRecorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      clearInterval(recordingTimer);
      const type = mediaRecorder.mimeType || "audio/webm";
      const blob = new Blob(recordedChunks, { type });
      mediaRecorder = null;
      setMicState(false);
      if (blob.size) await uploadVoice(blob, type);
    };
    mediaRecorder.start(250);
    recordingStartedAt = Date.now();
    setMicState(true);
    clearInterval(recordingTimer);
    recordingTimer = setInterval(updateRecordingLabel, 250);
  } catch (error) {
    mediaRecorder = null;
    setMicState(false);
    alert(error.name === "NotAllowedError" ? "Microphone permission was denied." : "Could not access microphone.");
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

async function uploadVoice(blob, mimeType) {
  const status = document.getElementById("uploadStatus");
  const extension = mimeType.includes("ogg") ? "ogg" : "webm";
  const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
  const form = new FormData();
  form.append("file", file);
  if (mode === "group") {
    form.append("roomType", "group");
    form.append("groupId", currentGroupId);
  } else {
    form.append("roomType", "personal");
    form.append("receiverEmail", receiverUser);
  }

  if (micBtn) micBtn.disabled = true;
  if (status) status.textContent = "Uploading voice message...";
  try {
    const res = await fetch(API.upload, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Voice upload failed");
    addMessage(data.data);
    if (status) status.textContent = "Voice message sent";
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    if (micBtn) micBtn.disabled = false;
    setTimeout(() => { if (status) status.textContent = ""; }, 2500);
  }
}

if (micBtn) micBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") stopVoiceRecording();
  else startVoiceRecording();
});

function logout() {
  localStorage.clear();
  location.href = "login.html";
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-theme", isDark);

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    toggle.textContent = isDark ? "☀" : "☾";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    toggle.setAttribute("aria-pressed", String(isDark));
  }
}

function toggleTheme() {
  const nextTheme = document.body.classList.contains("dark-theme") ? "light" : "dark";
  localStorage.setItem("chatTheme", nextTheme);
  applyTheme(nextTheme);
}

// --- init ---
applyTheme(localStorage.getItem("chatTheme") || "light");
loadMembers();
loadGroups();