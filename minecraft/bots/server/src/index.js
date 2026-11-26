require("dotenv").config();
const express=require("express"),http=require("http"),cors=require("cors"),helmet=require("helmet");
const {Server}=require("socket.io"),mineflayer=require("mineflayer"),crypto=require("crypto");
const PORT=Number(process.env.PORT||3000),ORIGIN=process.env.PUBLIC_ORIGIN||"http://localhost:8080";
const ALLOWED=new Set((process.env.ALLOWED_SERVERS||"127.0.0.1:25565").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean));
const MAX_BOTS=Math.max(1,Math.min(2,Number(process.env.MAX_BOTS_PER_SESSION||1)));
const TIMEOUT=Number(process.env.BOT_CONNECT_TIMEOUT_MS||20000);
const app=express();app.use(helmet({crossOriginEmbedderPolicy:false}));app.use(cors({origin:ORIGIN,methods:["GET","POST"]}));
app.get("/health",(_req,res)=>res.json({ok:true,service:"JJ Bot Control"}));
const server=http.createServer(app),io=new Server(server,{cors:{origin:ORIGIN,methods:["GET","POST"]},maxHttpBufferSize:1e5});
const sessions=new Map(),active=new Map(),validName=/^[A-Za-z0-9_]{3,16}$/;
function parseServer(value){
 if(typeof value!=="string"||value.length>255)throw Error("Invalid server address.");
 const m=value.trim().match(/^([a-zA-Z0-9.-]+):(\d{1,5})$/);if(!m)throw Error("Use host:port format.");
 const host=m[1].toLowerCase(),port=Number(m[2]),canonical=`${host}:${port}`;
 if(port<1||port>65535)throw Error("Invalid port.");
 if(!ALLOWED.has(canonical))throw Error("Server is not on this backend's permission allowlist.");
 return {host,port,canonical};
}
function publicBot(b){return {botId:b.id,username:b.username,server:b.server,status:b.status};}
function status(owner,b,state,message){b.status=state;io.to(owner).emit("bot:status",{botId:b.id,status:state,message});}
function remove(owner,id,reason="Disconnected."){const b=active.get(id);if(!b||b.owner!==owner)return;active.delete(id);try{b.client?.quit(reason.slice(0,80));}catch{}io.to(owner).emit("bot:removed",{botId:id});}
function cleanup(owner){[...active.values()].filter(b=>b.owner===owner).forEach(b=>remove(owner,b.id,"Dashboard session ended."));sessions.delete(owner);}
function owned(socket,id){const b=active.get(id);if(!b||b.owner!==socket.id)throw Error("Bot session not found.");return b;}
io.on("connection",socket=>{
 sessions.set(socket.id,{lastCreate:0});socket.join(socket.id);
 socket.on("session:sync",()=>socket.emit("session:state",[...active.values()].filter(b=>b.owner===socket.id).map(publicBot)));
 socket.on("bot:create",data=>{
  try{
   const s=sessions.get(socket.id);if(!s)throw Error("Session expired.");
   if(Date.now()-s.lastCreate<5000)throw Error("Wait a few seconds before creating another bot.");
   const count=[...active.values()].filter(b=>b.owner===socket.id).length;if(count>=MAX_BOTS)throw Error(`Limit: ${MAX_BOTS} bot per session.`);
   if(data?.auth!=="offline")throw Error("This starter supports private offline-mode Java test servers only.");
   const target=parseServer(data.server),username=String(data.username||"").trim();
   if(!validName.test(username))throw Error("Username must be 3–16 letters, numbers or underscores.");
   if([...active.values()].some(b=>b.username.toLowerCase()===username.toLowerCase()))throw Error("Username already in use.");
   s.lastCreate=Date.now();
   const b={id:crypto.randomUUID(),owner:socket.id,username,server:target.canonical,status:"connecting",client:null};active.set(b.id,b);socket.emit("bot:created",publicBot(b));
   const timer=setTimeout(()=>{if(active.has(b.id)){status(socket.id,b,"error","Connection timed out.");remove(socket.id,b.id,"Timeout.");}},TIMEOUT);
   try{
    const client=mineflayer.createBot({host:target.host,port:target.port,username,auth:"offline"});b.client=client;
    client.once("login",()=>{clearTimeout(timer);if(!active.has(b.id))return client.quit();status(socket.id,b,"connected","Connected to permitted test server.");});
    const sendStats=()=>{if(!active.has(b.id))return;const p=client.entity?.position;io.to(socket.id).emit("bot:status",{botId:b.id,status:b.status,stats:{position:p?{x:Math.round(p.x),y:Math.round(p.y),z:Math.round(p.z)}:null,health:client.health,food:client.food}});};
    client.on("spawn",sendStats);client.on("health",sendStats);
    client.on("kicked",()=>{if(active.has(b.id)){status(socket.id,b,"kicked","Server kicked the bot.");remove(socket.id,b.id,"Kicked.");}});
    client.on("error",err=>{if(active.has(b.id)){clearTimeout(timer);status(socket.id,b,"error","Connection error: "+String(err.message||err).slice(0,100));remove(socket.id,b.id,"Error.");}});
    client.on("end",()=>{clearTimeout(timer);if(active.has(b.id))remove(socket.id,b.id,"Connection ended.");});
   }catch(err){clearTimeout(timer);status(socket.id,b,"error","Could not start bot: "+String(err.message).slice(0,100));remove(socket.id,b.id,"Startup error.");}
  }catch(err){socket.emit("bot:error",{message:err.message||"Could not create bot."});}
 });
 socket.on("bot:control",({botId,action}={})=>{
  try{const b=owned(socket,botId);if(!b.client||b.status!=="connected")throw Error("Bot is not connected yet.");
   if(action==="jump"){b.client.setControlState("jump",true);setTimeout(()=>{if(active.has(botId))b.client.setControlState("jump",false);},250);}
   else if(["forward","left","right","stop"].includes(action)){["forward","back","left","right","jump","sprint"].forEach(k=>b.client.setControlState(k,false));if(action!=="stop")b.client.setControlState(action,true);}
   else throw Error("Unsupported control.");
  }catch(err){socket.emit("bot:error",{message:err.message});}
 });
 socket.on("bot:chat",({botId,message}={})=>{try{const b=owned(socket,botId);if(!b.client||b.status!=="connected")throw Error("Bot is not connected.");const msg=String(message||"").trim();if(!msg||msg.length>160)throw Error("Chat must be 1–160 characters.");b.client.chat(msg);socket.emit("bot:log",{botId,message:`${b.username}: ${msg}`});}catch(err){socket.emit("bot:error",{message:err.message});}});
 socket.on("bot:disconnect",({botId}={})=>{try{owned(socket,botId);remove(socket.id,botId,"Owner disconnected bot.");}catch(err){socket.emit("bot:error",{message:err.message});}});
 socket.on("disconnect",()=>cleanup(socket.id));
});
server.listen(PORT,()=>console.log(`JJ Bot Control listening on ${PORT}; allowlist: ${[...ALLOWED].join(", ")}`));
