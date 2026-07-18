/* ---------------------------- chatbot ---------------------------- */

let chatBusy = false; // blocks a new send while a reply is still coming in

qs("#chat-fab").onclick = () => {
  const panel = qs("#chat-panel");
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) qs("#chat-input").focus();
};

function scrollChatToBottom() {
  const body = qs("#chat-body");
  body.scrollTop = body.scrollHeight;
}

function addChatMsg(text, who) {
  const el = document.createElement("div");
  el.className = `chat-msg ${who}`;
  el.textContent = text;
  qs("#chat-body").appendChild(el);
  scrollChatToBottom();
  return el;
}

function showChatTyping() {
  const el = document.createElement("div");
  el.className = "chat-msg bot chat-typing";
  el.id = "chat-typing-indicator";
  el.innerHTML = `<span>.</span><span>.</span><span>.</span>`;
  qs("#chat-body").appendChild(el);
  scrollChatToBottom();
}

function hideChatTyping() {
  qs("#chat-typing-indicator")?.remove();
}

function setChatBusy(busy) {
  chatBusy = busy;
  qs("#chat-send").disabled = busy;
  qs("#chat-input").disabled = busy;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addMovieCard(m) {
  const poster =
    m.poster ||
    m.poster_url ||
    (m.poster_path
      ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
      : "https://placehold.co/300x450?text=No+Poster");

  const card = document.createElement("div");
  card.className = "chat-mini-card";

  card.innerHTML = `
    <img
      class="chat-mini-poster"
      src="${poster}"
      alt="${escapeHtml(m.title)}"
      loading="lazy"
      onerror="this.src='https://placehold.co/300x450?text=No+Poster'">

    <div class="chat-mini-title">
      ${escapeHtml(m.title)}
    </div>

    ${
      m.rating
        ? `<div class="chat-mini-rating">★ ${m.rating}</div>`
        : ""
    }
  `;

  card.onclick = () => openMovieModal(m.id);

  qs("#chat-body").appendChild(card);
  scrollChatToBottom();
}

// reveals up to 8 results one at a time, with a short pause between each
async function revealResultsOneByOne(results) {
  const top8 = results.slice(0, 10);
  for (const m of top8) {
    addMovieCard(m);
    await sleep(250);
  }
}

async function sendChat() {
  if (chatBusy) return; // ignore sends while a previous one is still running

  const input = qs("#chat-input");
  const msg = input.value.trim();
  if (!msg) return;

  addChatMsg(msg, "user");
  input.value = "";

  setChatBusy(true);
  showChatTyping();

  try {
    const r = await api("/api/chatbot", {
      method: "POST",
      body: { message: msg },
    });
    hideChatTyping();

    const results = r.results ?? [];
    if (!results.length) {
      addChatMsg(
        `I couldn't find a match for "${r.basis ?? msg}" — try describing a mood, genre, or a movie you liked.`,
        "bot",
      );
    } else {
      addChatMsg(`Based on ${r.basis ?? msg}, here's what I found:`, "bot");
      await revealResultsOneByOne(results);
    }
  } catch (e) {
    hideChatTyping();
    addChatMsg(
      "Hmm, I couldn't reach the recommendation engine. Try again in a moment.",
      "bot",
    );
  } finally {
    setChatBusy(false);
    input.focus();
  }
}

qs("#chat-send").onclick = sendChat;

qs("#chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    sendChat();
  }
});
