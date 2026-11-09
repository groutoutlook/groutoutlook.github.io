"use strict";
if (new URLSearchParams(location.search).has("embed")) document.documentElement.classList.add("embedded");
async function main() {
  const phone=matchMedia("(max-width: 640px)");
  const reduced=matchMedia("(prefers-reduced-motion: reduce)");
  let player, generation=0;
  const play = document.querySelector("#play"), timeline = document.querySelector("#timeline"), status = document.querySelector("#status");
  function label() { play.textContent = player.isPaused ? "Play" : "Pause"; play.setAttribute("aria-pressed",String(!player.isPaused)); }
  async function load() {
    const request=++generation;
    const response=await fetch(phone.matches?"card.portrait.lottie.json":"card.lottie.json");
    if (!response.ok) throw new Error("Lottie JSON is unavailable. Run just wasm-stage.");
    const data=await response.json();
    if(request!==generation)return;
    const paused=player?player.isPaused:false, progress=player?player.currentFrame/player.totalFrames:0;
    document.querySelectorAll("button").forEach(button=>button.disabled=true);
    if(player)player.destroy();
    timeline.max=Math.max(0,Math.ceil(data.op)-1);
    document.querySelector("#duration").textContent=(data.meta.durationMs/1000)+" s";
    const container=document.querySelector("#animation");
    container.setAttribute("aria-label",data.layers.filter(layer=>layer.ty===5 && !layer.nm.startsWith("Spotlight:")).map(layer=>layer.nm.trim()).join(". "));
    player=lottie.loadAnimation({container,renderer:"svg",loop:true,autoplay:!paused,animationData:data});
    player.addEventListener("DOMLoaded",()=>{
      if(paused)player.goToAndStop(progress*player.totalFrames,true);
      else player.goToAndPlay(progress*player.totalFrames,true);
      document.querySelectorAll("button").forEach(button=>button.disabled=false);
      status.hidden=true; status.textContent=""; label();
    });
    player.addEventListener("data_failed",()=>{status.hidden=false;status.textContent="Could not load the Lottie card.";});
    player.addEventListener("enterFrame",()=>{timeline.value=Math.round(player.currentFrame);});
  }
  play.onclick=()=>{ player.togglePause(); label(); };
  document.querySelector("#restart").onclick=()=>{ player.goToAndPlay(0,true); label(); };
  document.querySelector("#static").onclick=()=>{ player.goToAndStop(0,true); label(); };
  timeline.oninput=()=>{ player.goToAndStop(Number(timeline.value),true); label(); };
  reduced.addEventListener("change",event=>{if(event.matches && player){player.goToAndStop(0,true);label();}});
  window.addEventListener("pagehide",()=>{generation++;if(player)player.destroy();},{once:true});
  phone.addEventListener("change",()=>load().catch(fail));
  await load();
}
function fail(error) {const status=document.querySelector("#status");status.hidden=false;status.textContent=error.message;}
main().catch(fail);
