(() => {
  const API = (window.JJ_CONFIG?.API_BASE || "http://localhost:3000").replace(/\/$/, "");
  const socket = io(API, { transports: ["websocket", "polling"], reconnection: true });
  const bots = new Map();
  const $ = id => document.getElementById(id);
  const setConnection = (ok) => {
    $("connection").textContent = ok ? "● Backend connected" : "● Backend offline";
    $("connection").className = "pill " + (ok ? "online" : "offline");
  };
  function randomName() {
    const a = ["Amber","Brisk","Cobalt","Daring","Echo","Frost","Golden","Jolly","Lunar","Misty","Nova","Pixel","Quiet","Ruby","Sunny","Turbo"];
    const b = ["Badger","Bee","Birch","Comet","Fox","Golem","Koala","Moth","Otter","Panda","Raven","Slime","Tiger","Wolf"];
    return a[Math.floor(Math.random()*a.length)] + b[Math.floor(Math.random()*b.length)] + Math.floor(10+Math.random()*90);
  }
  $("username").value = randomName();
  $("randomize").onclick = () => $("username").value = randomName();

  function addLog(card, message) {
    const log = card.querySelector(".log");
    const line = document.createElement("div");
    line.textContent = message;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  }
  function updateStats(card, data) {
    card.querySelector(".position").textContent = data.position ? `${data.position.x}, ${data.position.y}, ${data.position.z}` : "—";
    card.querySelector(".health").textContent = data.health ?? "—";
    card.querySelector(".food").textContent = data.food ?? "—";
  }
  function createCard(data) {
    if (bots.has(data.botId)) return bots.get(data.botId);
    const card = $("bot-template").content.firstElementChild.cloneNode(true);
    card.querySelector(".bot-name").textContent = data.username;
    card.querySelector(".bot-server").textContent = data.server;
    card.querySelector(".avatar").textContent = data.username.slice(0,1).toUpperCase();
    card.querySelector(".status").textContent = "CONNECTING";
    card.querySelectorAll("[data-action]").forEach(btn => btn.onclick = () => socket.emit("bot:control", {botId:data.botId, action:btn.dataset.action}));
    card.querySelector(".chat-form").onsubmit = e => {
      e.preventDefault();
      const input = card.querySelector(".chat-input");
      const message = input.value.trim();
      if (message) { socket.emit("bot:chat", {botId:data.botId, message}); input.value = ""; }
    };
    card.querySelector(".disconnect").onclick = () => socket.emit("bot:disconnect", {botId:data.botId});
    $("bots").prepend(card);
    bots.set(data.botId, card);
    renderCount();
    return card;
  }
  function renderCount() {
    $("bot-count").textContent = bots.size;
    $("empty").style.display = bots.size ? "none" : "block";
  }
  $("create-form").onsubmit = e => {
    e.preventDefault();
    if ($("auth").value !== "offline") return;
    socket.emit("bot:create", {
      server: $("server").value.trim(),
      username: $("username").value.trim() || randomName(),
      auth: $("auth").value
    });
  };
  socket.on("connect", () => { setConnection(true); socket.emit("session:sync"); });
  socket.on("disconnect", () => setConnection(false));
  socket.on("bot:created", data => { const card = createCard(data); addLog(card, "Bot session created."); });
  socket.on("bot:status", data => {
    const card = bots.get(data.botId) || createCard(data);
    const status = card.querySelector(".status");
    status.textContent = data.status.toUpperCase();
    status.className = "status " + (data.status === "connected" ? "connected" : "");
    if (data.stats) updateStats(card, data.stats);
    if (data.message) addLog(card, data.message);
  });
  socket.on("bot:error", data => alert(data.message || "Bot error"));
  socket.on("bot:removed", data => {
    const card = bots.get(data.botId);
    if (card) card.remove();
    bots.delete(data.botId); renderCount();
  });
  socket.on("session:state", list => list.forEach(createCard));
  socket.on("bot:log", data => { const card=bots.get(data.botId); if(card) addLog(card,data.message); });
})();
