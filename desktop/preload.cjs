const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "codeplan",
  Object.freeze({
    desktopPreferences: () => ipcRenderer.invoke("desktop-preferences"),
    setCloseAction: (action) => ipcRenderer.invoke("set-close-action", action),
    readDrafts: () => ipcRenderer.invoke("read-drafts"),
    writeDrafts: (value) => ipcRenderer.invoke("write-drafts", value),
    connection: () => ipcRenderer.invoke("connection"),
    chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
    openBackupDirectory: () => ipcRenderer.invoke("open-backup-directory"),
    openExternal: (url) => ipcRenderer.invoke("open-external", url),
    testNotification: () => ipcRenderer.invoke("test-notification"),
  }),
);
