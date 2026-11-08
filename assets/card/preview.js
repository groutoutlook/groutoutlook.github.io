"use strict";
const modes = {
  animate:{file:"card.animated.html",title:"Animated card",download:"card.animated.html",label:"Export HTML"},
  wasm:{file:"wasm.html",title:"Interactive demo",download:"card.wasm",label:"Export WASM"},
  html:{file:"card.html",title:"HTML card",download:"card.html",label:"Export HTML"},
  svg:{file:"card.svg",title:"SVG card",image:true,download:"card.svg",label:"Export SVG"},
  png:{file:"card.png",title:"PNG card",image:true,download:"card.png",label:"Export PNG"},
  "animated-svg":{file:"card.animated.svg",title:"Animated SVG card",image:true,download:"card.animated.svg",label:"Export SVG"},
  lottie:{file:"lottie.html",title:"Lottie card",download:"card.lottie.json",label:"Export JSON"},
  gif:{file:"card.gif",title:"GIF card",image:true,download:"card.gif",label:"Export GIF"},
};
const frame=document.querySelector("#frame"), imageView=document.querySelector("#image-view"), picture=document.querySelector("#image"), message=document.querySelector("#message");
let pngAvailable=false, current, gifLoading, gifPercent=0;
function showGif() {
  imageView.hidden=true;
  message.hidden=false;
  message.textContent=`GIF · ${gifPercent}%`;
  if (gifLoading) return;
  gifLoading=cardGif.prepare(percent=>{gifPercent=percent;if(current===modes.gif)message.textContent=`GIF · ${percent}%`;})
    .then(()=>{
      if(current!==modes.gif)return;
      imageView.hidden=false;
      if(picture.getAttribute("src")!==modes.gif.file)picture.src=modes.gif.file;
      else if(picture.complete && picture.naturalWidth)message.hidden=true;
    })
    .catch(error=>{if(current===modes.gif){message.hidden=false;message.textContent=error.message;}})
    .finally(()=>{gifLoading=null;});
}
function showMode() {
  const key=location.hash.slice(1), mode=modes[key] || modes.animate;
  current=mode;
  for(const link of document.querySelectorAll("[data-mode]")) {
    if(modes[link.dataset.mode]===mode) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  }
  const unavailable=mode===modes.png && !pngAvailable;
  frame.hidden=Boolean(mode.image);
  imageView.hidden=!mode.image || unavailable;
  message.hidden=!unavailable;
  message.textContent=unavailable?"PNG unavailable. Export SVG instead.":"";
  if(mode.image && !unavailable) {
    if(mode===modes.gif) showGif();
    else if(picture.getAttribute("src")!==mode.file) picture.src=mode.file;
    picture.alt=mode.title;
  }
  if(!mode.image) {
    const source=mode.file+(mode===modes.wasm || mode===modes.lottie?"?embed=1":"");
    if(frame.getAttribute("src")!==source)frame.src=source;
    frame.title=mode.title;
  }
  const open=document.querySelector("#open-view"), download=document.querySelector("#download");
  open.href=mode.file;open.hidden=unavailable;
  download.href=unavailable?"card.svg":mode.download;
  download.textContent=unavailable?"Export SVG":mode.label;
  document.title="Card — "+mode.title;
}
picture.addEventListener("load",()=>{if(current===modes.gif)message.hidden=true;});
picture.addEventListener("error",()=>{imageView.hidden=true;message.hidden=false;message.textContent="Preview unavailable. Restart the viewer to regenerate it.";});
window.addEventListener("hashchange",showMode);
fetch("card.png",{method:"HEAD"}).then(response=>{pngAvailable=response.ok;}).catch(()=>{pngAvailable=false;}).finally(showMode);
showMode();
