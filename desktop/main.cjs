const {app,BrowserWindow,Menu,ipcMain,dialog,shell,session}=require('electron');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const customData=app.commandLine.getSwitchValue('user-data-dir');
if(customData&&require('node:path').isAbsolute(customData))app.setPath('userData',customData);
const setupURL=pathToFileURL(join(__dirname,'setup.html')).href;
let origin,setupWindow;
app.setAppUserModelId('site.hermes.workbench');
function validOrigin(value){const url=new URL(value);if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Use HTTPS, or HTTP on localhost.');return url.origin;}
function preferences(){return join(app.getPath('userData'),'server.json');}
function createWorkspace(){
  const win=new BrowserWindow({width:1440,height:980,minWidth:360,minHeight:600,show:false,icon:join(__dirname,'icon.ico'),backgroundColor:'#202124',title:'Hermes Workbench',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,partition:'persist:hermes-workspace'}});
  win.once('ready-to-show',()=>win.show());
  win.webContents.on('will-prevent-unload',event=>{const answer=dialog.showMessageBoxSync(win,{type:'question',message:'Discard unsaved changes? / 放弃未保存的修改？',buttons:['Cancel / 取消','Discard / 放弃'],defaultId:0,cancelId:0});if(answer===1)event.preventDefault();});
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  win.webContents.on('will-redirect',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>{
    try{const target=new URL(url);if(target.origin===origin)createWorkspace();else if(['https:','http:'].includes(target.protocol)&&!target.username&&!target.password)void dialog.showMessageBox(win,{type:'question',message:'Open external link? / 打开外部链接？',detail:target.href,buttons:['Cancel / 取消','Open / 打开'],defaultId:0,cancelId:0}).then(({response})=>{if(response===1)void shell.openExternal(target.href);});}catch{}
    return {action:'deny'};
  });
  win.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{if(isMainFrame&&code!==-3){win.show();void dialog.showMessageBox(win,{type:'error',message:'Workspace unavailable / 工作台服务暂不可用',detail:'Start your workspace server or choose another server from the File menu. / 请启动工作台服务，或在文件菜单更换服务器。',buttons:['OK']});}});
  void win.loadURL(origin);
  return win;
}
function setup(){
  if(setupWindow&&!setupWindow.isDestroyed()){setupWindow.focus();return;}
  setupWindow=new BrowserWindow({width:560,height:440,resizable:false,title:'Hermes · Server',webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  setupWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));setupWindow.webContents.on('will-navigate',event=>event.preventDefault());
  void setupWindow.loadURL(setupURL);
}
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{const win=BrowserWindow.getAllWindows()[0];if(win){if(win.isMinimized())win.restore();win.focus();}});
  app.whenReady().then(()=>{
    try{origin=validOrigin(JSON.parse(readFileSync(preferences(),'utf8')).origin);}catch{}
    const partition=session.fromPartition('persist:hermes-workspace');
    partition.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    partition.setPermissionCheckHandler(()=>false);
    ipcMain.handle('workspace:initial',event=>{if(event.senderFrame.url!==setupURL)throw new Error('Forbidden');return origin||'http://127.0.0.1:4317';});
    ipcMain.handle('workspace:connect',async(event,value)=>{
      if(event.senderFrame.url!==setupURL)throw new Error('Forbidden');
      try{const next=validOrigin(value);origin=next;mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(preferences(),JSON.stringify({origin}),{mode:0o600});
        for(const win of BrowserWindow.getAllWindows())if(win!==setupWindow)win.close();createWorkspace();setupWindow.close();return {ok:true};
      }catch{return {ok:false};}
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'File / 文件',submenu:[{label:'New window / 新建窗口',accelerator:'CmdOrCtrl+Shift+N',click:()=>origin?createWorkspace():setup()},{label:'Workspace server / 工作台服务器',click:setup},{type:'separator'},{role:'quit'}]},{label:'Edit / 编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View / 视图',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
    if(origin)createWorkspace();else setup();
  });
  app.on('window-all-closed',()=>app.quit());
}
