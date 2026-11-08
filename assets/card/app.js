"use strict";

const gifLink = document.querySelector('.app-actions a[href="card.gif"]');
const exportMenu = document.querySelector(".app-actions details");
const exportLabel = exportMenu.querySelector("summary");
const exportStatus = document.querySelector("#export-status");
let exporting = false;
gifLink.addEventListener("click", async event => {
  event.preventDefault();
  if (exporting) return;
  exporting = true;
  gifLink.setAttribute("aria-disabled","true");
  exportStatus.hidden = true;
  try {
    await cardGif.prepare(percent => {
      gifLink.textContent = `GIF · ${percent}%`;
      exportLabel.textContent = `Export · ${percent}%`;
    });
    const download = document.createElement("a");
    download.href = gifLink.href;
    download.download = "card.gif";
    document.body.append(download);
    download.click();
    download.remove();
    exportMenu.open = false;
  } catch (error) {
    exportStatus.textContent = error.message;
    exportStatus.hidden = false;
  } finally {
    exporting = false;
    gifLink.removeAttribute("aria-disabled");
    gifLink.textContent = "GIF";
    exportLabel.textContent = "Export";
  }
});
document.addEventListener("keydown",event => { if(event.key === "Escape") exportMenu.open = false; });
