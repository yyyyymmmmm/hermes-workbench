const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('workspaceSetup',{initial:()=>ipcRenderer.invoke('workspace:initial'),connect:origin=>ipcRenderer.invoke('workspace:connect',origin)});
