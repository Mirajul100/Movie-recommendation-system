/* ---------------------------- chatbot ---------------------------- */
qs("#chat-fab").onclick = () => qs("#chat-panel").classList.toggle("open");
function addChatMsg(text, who) {
  const el = document.createElement("div");
  el.className = `chat-msg ${who}`;
  el.textContent = text;
  qs("#chat-body").appendChild(el);
  qs("#chat-body").scrollTop = 1e9;
}
async function sendChat() {
  const input = qs("#chat-input");
  const msg = input.value.trim();
  if (!msg) return;
  addChatMsg(msg, "user");
  input.value = "";
  try {
    const r = await api("/api/chatbot", {
      method: "POST",
      body: { message: msg },
    });
    addChatMsg(`Based on ${r.basis}, here's what I found:`, "bot");
    const wrap = document.createElement("div");
    wrap.className = "chat-results";
    r.results.slice(0, 8).forEach((m) => {
      const c = document.createElement("div");
      c.className = "chat-mini-card";
      c.innerHTML = `<div class="chat-mini-poster"></div>${escapeHtml(m.title)}`;
      c.onclick = () => openMovieModal(m.id);
      wrap.appendChild(c);
    });
    qs("#chat-body").appendChild(wrap);
    qs("#chat-body").scrollTop = 1e9;
  } catch (e) {
    addChatMsg("Hmm, I couldn't reach the recommendation engine.", "bot");
  }
}
qs("#chat-send").onclick = sendChat;
qs("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
