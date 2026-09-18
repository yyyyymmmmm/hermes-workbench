'use strict';
window.workspaceSetup.initial().then(value=>document.querySelector('#origin').value=value);
document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const button=document.querySelector('button');button.disabled=true;try{const result=await window.workspaceSetup.connect(document.querySelector('#origin').value);if(!result.ok)document.querySelector('#error').textContent='请使用 HTTPS，或 localhost 的 HTTP 地址。 / Use HTTPS or localhost HTTP.';}finally{button.disabled=false;}});
