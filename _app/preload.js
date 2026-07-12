// preload.js — 只暴露"整页截图导出"一个能力（P9 甘特 📷），保持 contextIsolation
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studio', {
  capturePage: () => ipcRenderer.invoke('page:capture'),
});
