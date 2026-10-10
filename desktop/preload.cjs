const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("notebookDesktop", {
  load: () => ipcRenderer.invoke("notebook:load"),
  export: (state) => ipcRenderer.invoke("notebook:export", state),
  save: (state) => ipcRenderer.invoke("notebook:save", state),
  backup: (reason) => ipcRenderer.invoke("notebook:backup", reason),
  location: () => ipcRenderer.invoke("notebook:location"),
  openDataFolder: () => ipcRenderer.invoke("notebook:openDataFolder"),
  openLink: (url) => ipcRenderer.invoke("notebook:openLink", url),
  onClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("notebook:requestClose", listener);
    ipcRenderer.send("notebook:ready");
    return () => ipcRenderer.removeListener("notebook:requestClose", listener);
  },
  closeReady: () => ipcRenderer.send("notebook:closeReady"),
});
