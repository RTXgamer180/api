(() => {
  const API = (window.JJ_CONFIG?.API_BASE || "http://localhost:3000").replace(/\/$/, "");
  const socket = io(API, { transports: ["websocket", "polling"], reconnection: true });
  const bots = new Map();
  const $ = id => document.getElementById(id);
  const setConnection = ok => {
    $("connection").textContent = ok ? "● Backend connected" : "● Backend offline";
    $("connection").className = "pill " + (ok ? "online" : "offline");
  };
  function randomName() {
    const a=["Amber","Brisk","Cobalt","Daring","Echo","Frost","Golden","Jolly","Lunar","Misty","Nova","Pixel","Quiet","Ruby","Sunny","Turbo"];
    const b=["Badger","Bee","Birch","Comet","Fox","Golem","Koala","Moth","Otter","Panda","Raven","Slime","Tiger","Wolf"];
    return a[Math.floor(Math.random()*a.length)]+b[Math.floor(Math.random()*b.length)]+Math.floor(10+Math.random()*90);
  }
  $("username").value=randomName();
  $("randomize").onclick=()=>$("username").value=randomName();
  function addLog(card,msg){const line=document.createElement("div");line.textContent=msg;const log=card.querySelector(".log");log.appendChild(line);log.scrollTop=log.scrollHeight;}
  function updateStats(card,d){card.querySelector(".position").textContent=d.position?`${d.position.x}, ${d.position.y}, ${d.position.z}`:"—";card.querySelector(".health").textContent=d.health??"—";card.querySelector(".food").textContent=d.food??"—";}
  function renderCount(){$("bot-count").textContent=bots.size;$("empty").style.display=bots.size?"none":"block";}
  function createCard(d){
    if(bots.has(d.botId))return bots.get(d.botId);
    const card=$("bot-template").content.firstElementChild.cloneNode(true);
    card.querySelector(".bot-name").textContent=d.username;card.querySelector(".bot-server").textContent=d.server;card.querySelector(".avatar").textContent=d.username.slice(0,1).toUpperCase();
    card.querySelectorAll("[data-action]").forEach(btn=>btn.onclick=()=>socket.emit("bot:control",{botId:d.botId,action:btn.dataset.action}));
    card.querySelector(".chat-form").onsubmit=e=>{e.preventDefault();const input=card.querySelector(".chat-input");const message=input.value.trim();if(message){socket.emit("bot:chat",{botId:d.botId,message});input.value="";}};
    card.querySelector(".disconnect").onclick=()=>socket.emit("bot:disconnect",{botId:d.botId});
    $("bots").prepend(card);bots.set(d.botId,card);renderCount();return card;
  }
  $("create-form").onsubmit=e=>{e.preventDefault();socket.emit("bot:create",{server:$("server").value.trim(),username:$("username").value.trim()||randomName(),auth:$("auth").value});};
  socket.on("connect",()=>{setConnection(true);socket.emit("session:sync");});
  socket.on("disconnect",()=>setConnection(false));
  socket.on("bot:created",d=>addLog(createCard(d),"Bot session created."));
  socket.on("bot:status",d=>{const c=bots.get(d.botId)||createCard(d);const s=c.querySelector(".status");s.textContent=d.status.toUpperCase();s.className="status "+(d.status==="connected"?"connected":"");if(d.stats)updateStats(c,d.stats);if(d.message)addLog(c,d.message);});
  socket.on("bot:error",d=>alert(d.message||"Bot error"));
  socket.on("bot:removed",d=>{const c=bots.get(d.botId);if(c)c.remove();bots.delete(d.botId);renderCount();});
  socket.on("session:state",list=>list.forEach(createCard));
  socket.on("bot:log",d=>{const c=bots.get(d.botId);if(c)addLog(c,d.message);});
})();
