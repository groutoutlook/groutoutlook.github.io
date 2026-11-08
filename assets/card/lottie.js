"use strict";
if (new URLSearchParams(location.search).has("embed")) document.documentElement.classList.add("embedded");
async function main() {
  const response = await fetch("card.lottie.json");
  if (!response.ok) throw new Error("Lottie JSON is unavailable. Run just wasm-stage.");
  const data = await response.json(), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelector("#timeline").max = Math.max(0, Math.ceil(data.op) - 1);
  document.querySelector("#duration").textContent = (data.meta.durationMs / 1000) + " s";
  const player = lottie.loadAnimation({container:document.querySelector("#animation"),renderer:"svg",loop:true,autoplay:true,animationData:data});
  const play = document.querySelector("#play"), timeline = document.querySelector("#timeline"), status = document.querySelector("#status");
  document.querySelector("#animation").setAttribute("aria-label",data.layers.filter(layer=>layer.ty===5 && !layer.nm.startsWith("Spotlight:")).map(layer=>layer.nm.trim()).join(". "));
  function label() { play.textContent = player.isPaused ? "Play" : "Pause"; play.setAttribute("aria-pressed",String(!player.isPaused)); }
  player.addEventListener("DOMLoaded",()=>{
    document.querySelectorAll("button").forEach(button=>button.disabled=false);
    status.hidden=true;
    status.textContent="";
    label();
  });
  player.addEventListener("data_failed",()=>{ status.hidden=false;status.textContent="Could not load the Lottie card."; });
  player.addEventListener("enterFrame",()=>{ timeline.value=Math.round(player.currentFrame); });
  play.onclick=()=>{ player.togglePause(); label(); };
  document.querySelector("#restart").onclick=()=>{ player.goToAndPlay(0,true); label(); };
  document.querySelector("#static").onclick=()=>{ player.goToAndStop(0,true); label(); };
  timeline.oninput=()=>{ player.goToAndStop(Number(timeline.value),true); label(); };
  reduced.addEventListener("change",event=>{ if(event.matches){player.goToAndStop(0,true);label();} });
  window.addEventListener("pagehide",()=>player.destroy(),{once:true});
}
main().catch(error=>{ const status=document.querySelector("#status");status.hidden=false;status.textContent=error.message; });
