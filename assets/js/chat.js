document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("chat-root");
  if (!root) return; // not on the chat page

  var db = window.petloop.db;
  var signedOut = document.getElementById("chat-signed-out");
  var listEl = document.getElementById("chat-list");
  var mainEl = document.getElementById("chat-main");
  var noConvoEl = document.getElementById("chat-no-conversation");
  var bodyEl = document.getElementById("chat-body");

  var user = await window.petloop.getSessionUser();
  if (!user) {
    signedOut.style.display = "block";
    return;
  }
  root.style.display = "block";

  var activeConversationId = null;
  var pollTimer = null;

  function timeAgo(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h";
    return Math.floor(hrs / 24) + "d";
  }

  function otherParticipantId(conv) {
    return conv.participant_one === user.id ? conv.participant_two : conv.participant_one;
  }

  async function loadConversationList() {
    var res = await db.from("conversations")
      .select("*")
      .or("participant_one.eq." + user.id + ",participant_two.eq." + user.id)
      .order("created_at", { ascending: false });
    var conversations = res.data || [];

    if (conversations.length === 0) {
      listEl.innerHTML = '<p class="form-hint" style="padding:16px;">No conversations yet.</p>';
      return conversations;
    }

    var otherIds = conversations.map(otherParticipantId);
    var profRes = await db.from("profiles").select("id, full_name, city").in("id", otherIds);
    var profilesById = {};
    (profRes.data || []).forEach(function (p) { profilesById[p.id] = p; });

    // last message preview per conversation
    var previews = {};
    for (var i = 0; i < conversations.length; i++) {
      var conv = conversations[i];
      var msgRes = await db.from("messages").select("content, created_at, sender_id").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1);
      previews[conv.id] = (msgRes.data && msgRes.data[0]) || null;
    }

    listEl.innerHTML = conversations.map(function (conv) {
      var other = profilesById[otherParticipantId(conv)] || {};
      var preview = previews[conv.id];
      var previewText = preview ? preview.content : "Say hello!";
      return '<div class="chat-list-item' + (conv.id === activeConversationId ? " active" : "") + '" data-conversation-id="' + conv.id + '">' +
        '<div class="avatar-ring sm"><div class="avatar-inner"><span class="icon "><img src="assets/icons/users-ink.svg" alt=""></span></div></div>' +
        '<div class="grow"><h5>' + window.petloop.escapeHtml(other.full_name || "PetLoop Member") + '</h5><p>' + window.petloop.escapeHtml(previewText) + '</p></div>' +
        '</div>';
    }).join("");

    listEl.querySelectorAll(".chat-list-item").forEach(function (item) {
      item.addEventListener("click", function () {
        openConversation(item.getAttribute("data-conversation-id"), profilesById[otherParticipantId(conversations.find(function (c) { return c.id === item.getAttribute("data-conversation-id"); }))]);
      });
    });

    return conversations;
  }

  async function openConversation(conversationId, otherProfile) {
    activeConversationId = conversationId;
    listEl.querySelectorAll(".chat-list-item").forEach(function (item) {
      item.classList.toggle("active", item.getAttribute("data-conversation-id") === conversationId);
    });
    noConvoEl.style.display = "none";
    mainEl.style.display = "flex";

    if (otherProfile) {
      document.getElementById("chat-header-name").textContent = otherProfile.full_name || "PetLoop Member";
      document.getElementById("chat-header-sub").textContent = otherProfile.city || "";
    }

    await renderMessages();

    // mark incoming messages as read
    await db.from("messages").update({ read: true }).eq("conversation_id", conversationId).neq("sender_id", user.id);

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(renderMessages, 4000);
  }

  async function renderMessages() {
    if (!activeConversationId) return;
    var res = await db.from("messages").select("*").eq("conversation_id", activeConversationId).order("created_at", { ascending: true });
    var messages = res.data || [];
    bodyEl.innerHTML = messages.map(function (m) {
      var isMine = m.sender_id === user.id;
      return '<div class="msg ' + (isMine ? "out" : "in") + '">' + window.petloop.escapeHtml(m.content) + '</div>';
    }).join("");
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  document.getElementById("chat-send-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!activeConversationId) return;
    var input = document.getElementById("chat-message-input");
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    var res = await db.from("messages").insert({ conversation_id: activeConversationId, sender_id: user.id, content: text });
    if (res.error) {
      alert("Couldn't send message: " + res.error.message);
      return;
    }
    await renderMessages();
    await loadConversationList();
  });

  // ---- find-or-create a conversation with ?with=<profileId>, then open it ----
  async function findOrCreateConversationWith(otherId) {
    if (otherId === user.id) return null;
    var existing = await db.from("conversations")
      .select("*")
      .or("and(participant_one.eq." + user.id + ",participant_two.eq." + otherId + "),and(participant_one.eq." + otherId + ",participant_two.eq." + user.id + ")")
      .maybeSingle();
    if (existing.data) return existing.data;

    var created = await db.from("conversations").insert({ participant_one: user.id, participant_two: otherId }).select().single();
    if (created.error) {
      alert("Couldn't start conversation: " + created.error.message);
      return null;
    }
    return created.data;
  }

  var conversations = await loadConversationList();

  var params = new URLSearchParams(window.location.search);
  var withId = params.get("with");
  if (withId) {
    var conv = await findOrCreateConversationWith(withId);
    if (conv) {
      var profRes2 = await db.from("profiles").select("id, full_name, city").eq("id", withId).maybeSingle();
      conversations = await loadConversationList();
      await openConversation(conv.id, profRes2.data);
    }
  }
});
