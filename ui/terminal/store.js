/* Persisted workspace data is separate from each window's navigation state. */
window.HermesStore = (() => {
  const key = 'hermes-terminal-v2';
  const baseline = `import { sessionStore } from './session-store';\n\nexport async function restoreSession() {\n  const cached = sessionStore.read();\n  if (!cached) return null;\n\n  const response = await fetch('/api/session', {\n    headers: { Authorization: cached.token },\n  });\n\n  return response.json();\n}\n`;
  const patched = `import { sessionStore } from './session-store';\n\nexport async function restoreSession() {\n  const cached = sessionStore.read();\n  if (!cached) return null;\n\n  const response = await fetch('/api/session', {\n    headers: { Authorization: cached.token },\n  });\n\n  if (response.status === 401) {\n    sessionStore.clear();\n    return null;\n  }\n\n  if (!response.ok) {\n    throw new Error('Unable to restore session');\n  }\n\n  return response.json();\n}\n`;
  const initial = {
    version: 2, user: {name: 'Alex Chen', email: 'alex@example.com', signedIn: true},
    tasks: [
      {id:'t1',title:'完成个人工作台产品方案',project:'个人工作台',minutes:90,priority:'high',done:false},
      {id:'t2',title:'修复登录状态过期问题',project:'Hermes App',minutes:45,priority:'high',done:false},
      {id:'t3',title:'整理本周设计灵感',project:'设计探索',minutes:30,priority:'normal',done:false},
      {id:'t4',title:'阅读《深度工作》第三章',project:'个人成长',minutes:30,priority:'normal',done:false},
      {id:'t5',title:'回顾本周项目进展',project:'个人工作台',minutes:20,priority:'normal',done:true},
      {id:'t6',title:'整理任务收件箱',project:'个人成长',minutes:15,priority:'normal',done:true}
    ],
    modules: [
      {id:'google-tasks',name:'Google Tasks',desc:'把 Google 待办带入你的工作台。',icon:'list-todo',color:'blue',type:'连接器',installed:true,status:'待授权'},
      {id:'github',name:'GitHub',desc:'从问题、代码到变更审阅，连接开发工作。',icon:'github',color:'black',type:'MCP',installed:true,status:'待授权'},
      {id:'gmail',name:'Gmail',desc:'把邮件中的行动项，变成下一步。',icon:'mail',color:'red',type:'连接器',installed:false,status:'未连接'},
      {id:'health',name:'健康数据',desc:'睡眠、活动和个人状态，保留自己的节奏。',icon:'heart-pulse',color:'rose',type:'模块',installed:true,status:'待授权'},
      {id:'notion',name:'Notion',desc:'连接笔记与知识，保留资料的来源。',icon:'notebook',color:'black',type:'MCP',installed:false,status:'未连接'},
      {id:'review',name:'代码审查',desc:'检查代码变更，整理问题和修复建议。',icon:'git-pull-request',color:'orange',type:'Skill',installed:true,status:'本地示例'},
      {id:'weekly',name:'每周回顾',desc:'回顾完成的事情，规划下一周的重点。',icon:'calendar-check',color:'green',type:'Skill',installed:false,status:'未添加'},
      {id:'browser',name:'浏览器工作区',desc:'围绕任务收集链接，关联资料与笔记。',icon:'globe',color:'blue',type:'模块',installed:false,status:'未添加'}
    ],
    note: '# 个人工作台 / 产品方案\n\n## 我们正在解决什么\n\n让工作和生活里的信息、工具与 AI，在一个地方协作。\n\n## 第一阶段\n\n- 建立统一的账户与工作空间\n- 连接任务、日历和个人资料\n- 让用户确认 AI 的执行计划\n- 在不同设备上继续同一个任务\n\n## 设计原则\n\n以任务为中心。能力可扩展。所有执行都有来源和记录。\n',
    code: baseline, codeApplied:false, planApproved:false,
    calendar:[], customNotes:[], devices:[], quiet:true,
    executions:[{id:'r1',title:'修复登录状态过期问题',detail:'Hermes App · src/auth/session.ts',status:'waiting',kind:'code',time:'11:18'}, {id:'r2',title:'整理每周项目回顾',detail:'个人工作台 · 项目回顾.md',status:'complete',kind:'note',time:'10:42'}]
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  function load() {
    try {const parsed=JSON.parse(localStorage.getItem(key));if(parsed?.version===2)return {...clone(initial),...parsed};}catch{}
    const data=clone(initial);
    try {
      const tasks=JSON.parse(localStorage.getItem('hermes-ui-tasks-v1'));
      if(Array.isArray(tasks)&&tasks.every(t=>typeof t.id==='string'&&typeof t.title==='string'))data.tasks=tasks;
      const notes=JSON.parse(localStorage.getItem('hermes-ui-notes-v1'));
      if(Array.isArray(notes)&&notes.length&&typeof notes[0].body==='string'){data.note=notes[0].body;data.customNotes=notes;}
    }catch{}
    return data;
  }
  let data=load();
  return {
    get data(){return data;}, baseline, patched, key,
    save(){try{localStorage.setItem(key,JSON.stringify(data));return true;}catch{return false;}},
    reload(){data=load();},
    reset(){data=clone(initial);this.save();}
  };
})();
