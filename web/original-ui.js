'use strict';
// Share the approved presentation, never the prototype's localStorage or simulated actions.
window.HermesStore = { data: { tasks: [], executions: [], modules: [], user: { signedIn: false } } };
window.LiveUI = (() => {
  let state, helpers;
  const e = value => window.HermesViews.esc(value);
  const i = name => window.HermesViews.icon(name);
  const title = (text, sub = '') => `<div class="page-header"><div><div class="eyebrow">${i('command')} PERSONAL, CONNECTED.</div><h1>${text}</h1></div></div>${sub ? `<p class="subtitle">${sub}</p>` : ''}`;
  const unavailable = text => `<span class="tag">${text || '尚未接入'}</span>`;
  const modules = [
    ['calendar', 'Google Calendar', '日历', 'calendar-days', 'blue'], ['tasks', 'Google Tasks', '待办', 'circle-check', 'blue'],
    ['mail', 'Gmail', '邮箱', 'mail', 'red'], ['health', '健康数据', 'HealthKit / Health Connect', 'heart-pulse', 'rose'],
    ['mcp', 'MCP 服务', 'MCP', 'plug', 'green'], ['skills', 'Hermes Skills', 'Skill', 'sparkles', 'orange']
  ];
  function workspaceCards() {
    const projects=window.HermesProjects.overview().slice(0,4);
    if(!projects.length)return `<div class="overview-project-empty">${i('folder-kanban')}<span>暂无项目</span><button class="text-button" data-page="workspace">新建项目${i('arrow-right')}</button></div>`;
    return `<div class="recent-projects">${projects.map(p=>`<button class="recent-project" data-project-open="${e(p.id)}">${i('folder-kanban')}<span><strong>${e(p.name)}</strong><small>${p.completed} / ${p.total} ${e('任务完成')}</small></span>${i('arrow-up-right')}<progress max="${Math.max(1,p.total)}" value="${p.completed}" aria-label="${e('项目完成进度')}"></progress></button>`).join('')}</div>`;
  }
  function home() {
    const { tasks } = state, pending = tasks.filter(t => !t.completed), done = tasks.length - pending.length;
    const today = helpers.localDate(new Date()), scheduled = tasks.filter(t => t.scheduledAt && helpers.localDate(new Date(t.scheduledAt)) === today).length;
    const metric = (label, glyph, value, unit, page) => `<button class="summary-item" data-page="${page}"><span>${i(glyph)}${label}</span><div class="summary-number">${value}<small>${unit}</small></div></button>`;
    const date=new Intl.DateTimeFormat(window.I18n.locale,{month:'long',day:'numeric',weekday:'long'}).format(new Date());
    return `<header class="overview-heading"><div><div class="overview-date">${i('calendar-days')}${e(date)}</div><h1>你好，${e(state.me.user.name)}</h1><p>你的工作与生活，都在这里。</p></div><button class="primary" data-action="add">${i('plus')}新建任务</button></header><section class="summary-strip" aria-label="今日概览">${metric('待办事项','circle-check',pending.length,'项','tasks')}${metric('今日安排','calendar-days',scheduled,'项','calendar')}${metric('已完成','chart-no-axes-combined',done,'项','tasks')}${metric('进行中','folder-kanban',window.HermesProjects.overview().length,'项目','workspace')}</section><section class="overview-projects"><div class="section-head"><h2>继续工作</h2><button class="text-button" data-page="workspace">所有工作空间${i('arrow-up-right')}</button></div>${workspaceCards()}</section><div class="dashboard-lower"><section class="task-section"><div class="section-head"><h2>待办事项 <small>${pending.length}</small></h2><button class="icon-button" data-action="add" aria-label="添加待办">${i('plus')}</button></div>${pending.slice(0,4).map(helpers.taskRow).join('') || helpers.empty('暂无待完成任务', done ? '完成的每一步，都已记下。' : '')}<button class="add-task" data-action="add">${i('plus')}添加一个待办</button></section><section class="schedule-section"><div class="section-head"><h2>今日时间线</h2><button class="text-button" data-page="calendar">日历${i('arrow-up-right')}</button></div>${helpers.events(today)}</section></div>`;
  }
  function healthOverview() {
    return `<section class="overview-health"><div class="section-head"><h2>${i('heart-pulse')}生活与健康</h2><button class="text-button" data-page="health">查看健康${i('arrow-up-right')}</button></div><div class="overview-health-status"><span>HealthKit / Health Connect</span><span class="tag">尚未接入</span></div><p>尚未读取健康数据，也未共享给 Hermes。</p></section>`;
  }
  function assistant() {
    if (window.HermesChat) return window.HermesChat.panel(state);
    const connected = state.hermes.connected;
    return `<aside class="assistant ${state.aiDrawer ? 'drawer' : ''}" aria-label="Hermes 助手"><div class="assistant-top"><span class="ai-mark">${i('sparkles')}</span><h2>Hermes</h2><button class="icon-button" data-action="window" aria-label="新建窗口" data-tooltip="新建窗口">${i('panels-top-left')}</button><button class="icon-button" data-action="toggle-ai" aria-label="收起助手">${i('panel-right-close')}</button></div><div class="assistant-status"><span class="dot amber"></span>${connected ? '连接凭证已保存 · 对话尚未接入' : '未连接 Agent'}</div><div class="assistant-tabs"><button data-action="assistant-chat" class="${state.aiContext ? '' : 'active'}">助理</button><button data-action="assistant-context" class="${state.aiContext ? 'active' : ''}">上下文 <small>0</small></button></div>${state.aiContext ? `<div class="assistant-run"><span class="tag">授权范围</span><h3>尚未共享数据</h3><p>工作台任务、日历和健康数据尚未发送到 Hermes。</p></div>` : `<div class="chat-date">个人助理</div><div class="ai-intro"><p>${connected ? '服务器连接已建立。' : '你的工作，从这里继续。'}</p><p>${connected ? '模型目录可在 Hermes 管理中获取；对话执行尚未接入。' : '连接自己的 Hermes 服务器，管理模型与账户。'}</p></div><div class="context-chips"><span class="context-chip">${i('shield-check')}尚未授权上下文</span></div><section class="ai-plan"><header class="ai-plan-head">${i('plug')}Hermes 连接<span class="tag">${connected ? '已配置' : '未连接'}</span></header><div class="plan-step"><span class="step-number">1</span><div><strong>${connected ? e(state.hermes.username) : '连接你的服务器'}</strong><p>${connected ? e(state.hermes.origin) : '服务器地址 · 用户名 · 密码'}</p></div></div><div class="plan-step"><span class="step-number">2</span><div><strong>模型与执行</strong><p>${state.hermes.catalog ? state.hermes.catalog.models.length + ' 条目录记录 · 未验证推理' : '尚未获取模型目录'}</p></div></div><div class="plan-bottom"><button class="primary" data-page="hermes">${i('settings-2')}${connected ? '管理 Hermes' : '连接 Hermes'}</button></div></section>`}<div class="assistant-compose"><div class="chat-input"><textarea aria-label="发送给 Hermes 的消息" placeholder="对话执行尚未接入" disabled></textarea><div class="compose-footer"><button class="icon-button" data-action="assistant-context" aria-label="查看上下文">${i('paperclip')}</button><button class="icon-button" data-action="voice-info" aria-label="语音功能">${i('mic')}</button><button class="model-label model-picker" data-page="hermes" title="管理模型">${e(state.hermes.preference?.model || state.hermes.catalog?.current?.model || '选择模型')}</button><button class="send" disabled aria-label="发送">${i('arrow-up')}</button></div></div><p class="ai-disclaimer">执行未接入 · 不生成模拟回复</p></div></aside>`;
  }
  function extraPage() {
    if(state.page==='chat')return '';
    if(state.page==='settings')return window.HermesSettings.panel();
    if(state.page==='workspace' && window.HermesDocuments) return window.HermesProjects.tabs()+(state.workspaceView==='documents'?window.HermesDocuments.panel():window.HermesProjects.panel());
    if(state.page==='runs' && window.HermesChat) return window.HermesChat.history();
    if (state.page === 'hermes') {
      const tab = state.agentTab || 'models';
      const tabs = [['models','连接与模型'],['external','外部 Agent'],['collaboration','协作'],['tools','工具权限'],['skills','Skills / MCP'],['memory','记忆与设定'],['schedules','定时任务'],['voice','语音']];
      const pane = document.createElement('template'); pane.innerHTML = helpers.page(); pane.content.querySelector('.page-head')?.remove();
      if(tab!=='models')return `${title('Hermes，按你的方式工作')}<div class="agent-tabs" role="tablist" aria-label="Hermes 管理">${tabs.map(([id,name])=>`<button role="tab" data-agent-tab="${id}" aria-selected="${id===tab}" class="${id===tab?'active':''}">${name}</button>`).join('')}</div>${window.HermesAgent.panel(tab)}`;
      const pending = {
        tools: ['工具权限尚未接入','没有授予 Hermes 读取任务、健康数据或执行代码的权限。','shield-check'],
        skills: ['尚未连接 Skills / MCP 管理','未安装或执行任何远端技能。','blocks'],
        memory: ['记忆服务尚未接入','未读取或修改远端记忆。','brain'],
        schedules: ['暂无工作台调度记录','远端定时任务尚未读取。','calendar-clock'],
        voice: ['连续语音对话尚未接入','可在任务编辑中使用浏览器语音输入。','audio-lines']
      };
      return `${title('Hermes，按你的方式工作')}<div class="agent-status"><span class="ai-mark">${i('bot')}</span><div><strong>${e(state.hermes.username || '个人 Agent')}</strong><p>${e(state.hermes.catalog?.current?.model || '尚未获取当前模型')}</p></div><span class="tag">${state.hermes.connected?'连接已配置':'未连接'}</span></div><div class="agent-tabs" role="tablist" aria-label="Hermes 管理">${tabs.map(([id,name])=>`<button role="tab" data-agent-tab="${id}" aria-selected="${id===tab}" class="${id===tab?'active':''}">${name}</button>`).join('')}</div>${tab==='models'?pane.innerHTML:helpers.empty(...pending[tab])}`;
    }
    if (state.page === 'workspace') return `${title('让想法，继续往前','工作空间')}<div class="workspace-toolbar"><div class="workspace-tabs"><button class="active">${i('code-xml')}代码</button></div><div><button class="icon-button" data-action="window" title="新建窗口" aria-label="新建窗口">${i('panels-top-left')}</button></div></div><div class="editor-shell"><aside class="file-tree"><div class="file-tree-title">我的项目</div><div class="empty-state">尚未关联仓库</div></aside><section class="live-editor"><div class="editor-head">${i('file-code-2')}工作空间<span class="tag">未连接运行环境</span></div>${helpers.empty('尚未连接文件与执行服务', '没有读取本机文件，也没有运行代码。', 'folder-git-2')}<div class="editor-foot">文件 0 · 变更 0</div></section></div><section class="terminal-panel"><div class="terminal-head">${i('terminal')}终端<span class="tag">未连接</span></div><div class="terminal-log">暂无执行输出</div></section>`;
    if (state.page === 'runs') return `${title('每一步，都有迹可循','执行中心')}<div class="runs-summary"><div><strong>0</strong><small>运行中</small></div><div><strong>0</strong><small>待确认</small></div></div>${helpers.empty('暂无执行记录','Hermes 对话与执行尚未接入。','workflow')}`;
    if (state.page === 'health') return `${title('工作之外，也是你','生活与健康')}<div class="health-stats">${[['moon','昨晚睡眠','小时'],['footprints','今日步数','步'],['heart','静息心率','次 / 分']].map(([glyph,label,unit])=>`<section class="health-stat"><span>${i(glyph)}${label}</span><strong>--<small>${unit}</small></strong><p>数据源未连接</p></section>`).join('')}</div><section class="chart-section"><div class="section-head"><h2>健康趋势</h2>${unavailable('暂无授权数据')}</div>${helpers.empty('暂无健康记录','','activity')}</section><div class="health-insight">${i('shield-check')}<div><strong>尚未授权健康数据</strong>HealthKit 与 Health Connect 尚未接入。</div></div>`;
    if (state.page === 'connections') return `${title('让信息，流动起来','连接与数据')}<div class="setting-row"><div class="setting-copy">${i('bot')}<div><strong>Hermes</strong><p>${state.hermes.connected ? e(state.hermes.origin) : '未连接'}</p></div></div><button class="secondary" data-page="hermes">${i('settings-2')}管理</button></div><div class="setting-row"><div class="setting-copy">${i('calendar-days')}<div><strong>个人待办与日历</strong><p>工作台数据库 · 同一任务记录</p></div></div><span class="tag green">已接入</span></div>${window.HermesAgent.connections()}${modules.slice(0,4).map(([,name,type,glyph])=>`<div class="setting-row"><div class="setting-copy">${i(glyph)}<div><strong>${name}</strong><p>${type}</p></div></div>${unavailable()}</div>`).join('')}`;
    if (state.page === 'modules') {
      return `${title('你的能力，不止于此','能力中心')}${window.HermesAgent.panel('skills')}`;
    }
    return helpers.page();
  }
  function render(current, functions) {
    const experience = window.HermesExperience?.capture(current);
    const chatPosition = window.HermesChat?.capture();
    const documentPosition = window.HermesDocuments?.capture();
    state = current; helpers = functions;
    const V = window.HermesViews;
    Object.assign(V.names, { agent: 'Hermes', chat:'Hermes', calendar: '日历', settings:'设置' });
    window.HermesStore.data = { tasks: current.tasks.map(t=>({...t,done:t.completed})), executions:[], modules:[], user:{ signedIn:true, name:current.me.user.name } };
    const template = document.createElement('template');
    template.innerHTML = V.shell({ page:current.page==='hermes'?'agent':current.page, menu:current.menu, aiHidden:current.aiHidden,
      renderPage:()=> current.page==='home'?home()+healthOverview():extraPage(), renderAssistant:assistant });
    const root = template.content;
    const settingsButton=document.createElement('button');settingsButton.dataset.page='settings';settingsButton.className=current.page==='settings'?'active':'';settingsButton.innerHTML=`${i('settings-2')}设置`;root.querySelector('.sidebar-bottom .nav').append(settingsButton);
    root.querySelectorAll('[data-page="agent"]').forEach(el=>el.dataset.page='hermes');
    root.querySelectorAll('[data-action="login"],[data-action="space"]').forEach(el=>{delete el.dataset.action;el.dataset.page='account';});
    root.querySelector('.sidebar-storage').innerHTML = `<span class="dot ${current.stale?'amber':''}"></span>${current.stale?'同步待重试':'工作台已连接'}`;
    root.querySelector('.profile small').textContent = '个人账户';
    root.querySelector('.profile img').alt = '';
    root.querySelector('.nav [data-page="workspace"] .badge')?.remove();
    root.querySelector('.top-actions').innerHTML = `<span class="tag">${current.stale?'同步待重试':'已连接'}</span><button class="icon-button" data-action="refresh" aria-label="同步数据" data-tooltip="同步数据">${i('refresh-cw')}</button><button class="icon-button" data-action="window" aria-label="新建窗口" data-tooltip="新建窗口">${i('panels-top-left')}</button><button class="icon-button" data-action="toggle-ai" aria-label="切换 Hermes 面板" data-tooltip="Hermes 助手">${i('panel-right')}</button>`;
    root.querySelector('.global-search').dataset.action='search-tasks';
    root.querySelector('.global-search span').textContent='搜索待办…';
    root.querySelector('.global-search kbd')?.remove();
    root.querySelector('.body-layout')?.classList.toggle('chat-expanded', Boolean(current.chatExpanded));
    if(current.page==='chat'){
      root.querySelector('.body-layout').classList.add('chat-expanded','chat-page');
      root.querySelector('.body-layout').classList.remove('ai-hidden');
      root.querySelector('.assistant')?.classList.add('drawer');
      root.querySelectorAll('.mobile-nav button').forEach(b=>b.classList.toggle('active',b.dataset.action==='toggle-ai'));
    }
    root.querySelector('#main')?.classList.toggle('overview-page', current.page==='home');
    document.querySelector('#app').replaceChildren(root);
    if (experience) window.HermesExperience.restore(experience);
    if (chatPosition) window.HermesChat.restore(chatPosition);
    if (documentPosition) window.HermesDocuments.restore(documentPosition);
    if(window.HermesChat && document.querySelector('.chat-recovery')) {
      const button=document.createElement('button');button.className='text-button danger';button.dataset.chatAction='abandon';button.textContent='结束本地跟踪';document.querySelector('.chat-recovery').append(button);
    }
    const serverInput = document.querySelector('#hermes-form input[name="origin"]');
    if (serverInput) { serverInput.placeholder = 'http://主机:端口 或 https://域名'; serverInput.title = '支持已放行的局域网 HTTP；公网使用 HTTPS'; }
    document.title = `${V.names[current.page==='hermes'?'agent':current.page]} · Hermes`;
  }
  return { render };
})();
