'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const brand = `<div class="brand-mark">${icon('asterisk')}</div><span>Hermes</span>`;
const state = { me: null, tasks: [], hermes: { connected: false }, devices: [], page: 'home', filter: 'all', date: localDate(new Date()), search: '', stale: false, loading: false };
state.calendarView='month';
let noticeTimer, recognition, busy = false, generation = 0;
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function localInput(iso) { const d = new Date(iso); return `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function dateText(iso, options) { return new Intl.DateTimeFormat('zh-CN', options || { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
function icons() { window.lucide?.createIcons(); }
function notify(message) { $('#notice').textContent = message; $('#notice').classList.add('visible'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('#notice').classList.remove('visible'), 5500); }
const messages = {
  PROFILE_EXISTS:'Agent 名称已存在，请重新读取列表。',PROFILE_NOT_FOUND:'Agent 已不存在或不可用，请重新选择。',PROFILE_DISABLED:'该 Agent 已暂停工作台接单。',PROFILE_IMMUTABLE:'切换 Agent 需要新建会话。',PROFILE_UNVERIFIED:'无法确认 Agent 配置已生效，请重新读取，勿重复提交。',
  CONVERSATION_CONFLICT:'会话已在其他窗口修改，请重新打开编辑。',DELEGATION_UNAVAILABLE:'服务器未启用原生 Agent 委派工具，请在工具权限中检查。',
  SKILL_SEARCH_TIMEOUT:'官方技能源搜索超时，请稍后重试；这不是空结果。',
  PROJECT_CONTEXT_LIMIT:'项目上下文超过限制，请减少授权资料或任务。',PROJECT_DOCUMENT_UNAVAILABLE:'授权文档已删除或取消关联，请新建会话重新选择资料。',ACTION_SCOPE:'任务不属于本次授权项目，已阻止执行。',PROJECT_CONVERSATION_IMMUTABLE:'请新建会话以切换项目或授权范围。',ACTION_STATE:'任务操作状态已变化，请重新查看。',
  SKILL_REVIEW_EXPIRED:'安装审查已过期，请重新预览与扫描。',SKILL_CHANGED:'技能内容或扫描结果已变化，请重新审查。',SKILL_BLOCKED:'安全扫描未通过，已阻止安装。',SKILL_EXISTS:'服务器已安装同名技能，请刷新已安装列表。',SKILL_INSTALL_UNVERIFIED:'安装结果未确认，请先检查已安装列表，不要重复安装。',
  MODEL_CONFLICT:'远端模型已被修改，请刷新目录后重新选择。',MODEL_UNVERIFIED:'模型设置结果未确认，请先获取模型核对，不要重复提交。',
  TASK_PLAN_LIMIT:'清单超过 30 项，请让 Hermes 分批整理。',TASK_PLAN_NOT_READY:'回复尚未成功完成，请稍后再试。',TASK_PLAN_IMPORTED:'部分任务已经添加，请关闭后重新核对清单。',
  PROJECT_UNAVAILABLE:'项目不存在或已归档，请刷新项目。',PROJECT_CONFLICT:'项目已在其他窗口更新。修改已保留，请刷新核对后重新编辑。',PROJECT_LIMIT:'项目数量已达上限。',RESOURCE_UNAVAILABLE:'关联内容已删除或无权访问。',
  MCP_NAME_EXISTS:'连接名称已存在，请使用其他名称或管理现有连接。',
  MCP_HTTP_UNAVAILABLE:'服务器缺少 MCP HTTP 传输支持。请管理员在 Hermes 运行环境中升级兼容的 mcp 依赖并重启相关服务，再验证连接。',
  MCP_AUTH_REQUIRED:'此服务需要账号授权，请先连接账号再验证。',MCP_CONNECTION_TIMEOUT:'连接 MCP 服务超时，请检查 NAS 到该服务的网络后重试。',MCP_OPERATION_FAILED:'MCP 服务拒绝操作，请检查服务器诊断；工作台未将此操作标记为成功。',HERMES_REJECTED:'Hermes 服务器拒绝了此操作，请核对远端配置与服务器日志。',
  MCP_FLOW_EXPIRED:'授权已过期，请重新连接账号。',MCP_FLOW_ACTIVE:'已有授权进行中，请先完成或取消。',MCP_AUTH_FORMAT:'授权链接格式不受支持，请检查网关。',MCP_TEST_FAILED:'连接验证失败，请检查授权和远端服务。',MCP_WRITE_UNVERIFIED:'远端变更未确认，请刷新核对，不要重复提交。',
  VOICE_FORMAT:'网关返回的音频格式不兼容。',
  CAPABILITY_FORMAT: '网关返回的格式不兼容，请核对网关版本。', CAPABILITY_NOT_FOUND:'远端条目已不存在，请刷新。',
  CONFIG_CONFLICT:'服务器配置已变化，草稿已保留。请记录修改后重新读取。',
  CONFIG_UNVERIFIED:'保存结果未确认，草稿已保留。请重新读取核对，勿重复提交。',
  INSTALL_UNAVAILABLE:'此条目已安装或需要额外配置，请刷新目录。',
  INSTALL_UNVERIFIED:'安装结果未确认，请重新读取目录核对，勿重复安装。',
  DOCUMENT_CONFLICT: '文档已在其他设备修改。本地内容已保留，请查看新版本或另存副本。',
  DOCUMENT_NOT_FOUND: '文档或历史版本不存在，或当前账户无权访问。',
  DOCUMENT_QUOTA: '文档存储额度已满，请导出并整理文档后重试。',
  EXECUTION_CONSENT_REQUIRED: '本会话尚未授权或授权已撤销，请确认后重新发送。',
  ATTACHMENT_TOO_LARGE: '单个附件不能超过 64 KB。', ATTACHMENTS_TOO_LARGE: '附件总大小不能超过 192 KB。',
  ATTACHMENT_NOT_FOUND: '附件不存在或当前账户无权访问。',
  RUN_ACTIVE: '请先结束或核对当前执行，再开始新的任务或切换连接。',
  RUN_NOT_FOUND: '找不到这条执行记录。', REQUEST_EXPIRED: '审批已过期或连接已断开，请刷新记录。',
  RUN_NEEDS_RECONCILIATION: '执行连接已断开，请先核对远端状态。', REMOTE_STATE_UNKNOWN: '远端状态尚未确认，请到 Hermes 服务器核对，不要重复提交。',
  CONNECTION_CHANGED: 'Hermes 连接已变更，请新建对话。',
  REGISTRATION_CONFLICT: '账号或 QQ 已注册，请更换资料或登录已有账户。',
  REGISTRATION_IP_LIMIT: '验证服务限制同一 IP 注册多个账号，请联系管理员调整注册策略。',
  REGISTRATION_INVALID: '注册资料不符合验证服务要求，请检查账号、密码和 QQ。',
  REGISTRATION_REJECTED: '验证服务未完成注册，请稍后重试或联系管理员。',
  ACCOUNT_CHANGED: '另一个窗口切换了账户，请重新打开工作台。',
  AUTH_REQUIRED: '登录已失效，请重新登录。', INVALID_CREDENTIALS: '账号或密码不正确，或账号不可用。',
  AUTH_INTEGRITY_FAILED: '验证服务响应校验失败，请检查服务端配置与系统时间。', AUTH_IDENTITY_MISMATCH: '验证服务返回的账号不匹配。',
  VERSION_CONFLICT: '这条任务已在其他窗口更新。已刷新数据，请重新打开编辑。', IDEMPOTENCY_CONFLICT: '本次请求编号已使用，请刷新后重试。',
  HERMES_AUTH_EXPIRED: 'Hermes 会话已过期或权限不足，请重新连接。工作台登录不受影响。', HERMES_UNSUPPORTED: '当前 Hermes 网关不支持这个接口。',
  HERMES_AUTH_REQUIRED: '请使用已启用账号验证的 Hermes 网关。', HERMES_PASSWORD_UNSUPPORTED: '这个网关未提供用户名和密码登录。',
  HERMES_LOGIN_UNVERIFIED: '无法确认 Hermes 登录状态，请检查网关兼容性。', HERMES_NOT_CONNECTED: '请先连接 Hermes 服务器。',
  UNSAFE_SERVER: '请填写 HTTPS 服务器根地址。局域网 HTTP 需由管理员加入允许列表。', BLOCKED_ADDRESS: '该地址受安全策略限制，请检查服务器配置。',
  INVALID_SERVER: '服务器地址格式不正确。', UNKNOWN_MODEL: '模型不在最新目录中，请重新获取。', INVALID_INPUT: '请检查输入格式与长度。',
  RATE_LIMITED: '操作过于频繁，请稍后再试。', UPSTREAM_TIMEOUT: '远端服务器响应超时，请稍后重试。', CONNECTION_BUSY: 'Hermes 正在连接或获取数据，请稍后重试。',
  DNS_FAILED: '无法解析服务器地址。', UPSTREAM_UNAVAILABLE: '暂时无法连接远端服务器。', AUTH_UNAVAILABLE: '登录验证服务暂不可用。'
};
async function api(path, { method = 'GET', body, key } = {}) {
  let response;
  try { response = await fetch(`/api${path}`, { method, credentials: 'same-origin', signal:AbortSignal.timeout(path==='/hermes/connect'?70000:25000), headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(state.me ? { 'x-csrf-token': state.me.csrf, ...(path === '/me' ? {} : { 'x-workspace-user': state.me.user.id }) } : {}), ...(key ? { 'idempotency-key': key } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('网络连接中断，请检查网络后重试。'); }
  const data = await response.json();
  if (!response.ok) {
    const code = data.error?.code;
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(code) && state.me) reset();
    const error = new Error(messages[code] || `请求未完成（${code || response.status}）`); error.code = code; throw error;
  }
  return data;
}
function reset() { generation++; window.HermesTaskPlan?.reset(); window.HermesProjects?.reset();state.workspaceView='projects'; window.HermesChat?.reset(); window.HermesDocuments?.reset(); window.HermesAgent?.reset(); recognition?.abort(); state.me = null; state.tasks = []; state.devices = []; state.hermes = { connected: false }; state.page = 'home'; state.search = ''; state.filter = 'all'; $('#editor').close(); render(); }
function login() {
  return `<main class="login"><div class="brand">${brand}</div><section class="login-form"><div class="eyebrow">YOUR PERSONAL WORKSPACE</div><h1>回到你的工作与生活</h1><p>登录 Hermes 工作台</p><form id="login-form"><label>账号<input name="username" autocomplete="username" required maxlength="100" autofocus></label><label>密码<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><label>设备名称<input name="device" value="${esc(/Mobi/.test(navigator.userAgent) ? '我的手机' : '我的电脑')}" required maxlength="80"></label><div class="form-error" role="alert"></div><button class="primary" type="submit">登录 ${icon('arrow-right')}</button></form><div class="auth-links"><button data-action="register">创建账号</button><button data-action="recover">忘记密码？</button></div></section><footer class="login-footer"><span class="secure">${icon('lock-keyhole')} 账户安全 · 私人空间</span><span>Hermes Workbench / 0.1</span></footer></main>`;
}
function registrationDialog() {
  const dialog = $('#editor');
  dialog.innerHTML = `<div class="dialog-head"><h2>创建账号</h2><button class="icon" data-action="close" title="关闭" aria-label="关闭">${icon('x')}</button></div><form id="register-form"><label>昵称<input name="name" autocomplete="nickname" required maxlength="40"></label><label>账号<input name="username" autocomplete="username" pattern="[A-Za-z0-9_]{5,11}" required minlength="5" maxlength="11" placeholder="5–11 位字母、数字或下划线"></label><label>联系 QQ<input name="qq" inputmode="numeric" pattern="[1-9][0-9]{4,11}" required maxlength="12"></label><label>密码<input name="password" type="password" autocomplete="new-password" required minlength="6" maxlength="18" placeholder="6–18 位，支持字母、数字及 . * _ -"></label><label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" required minlength="6" maxlength="18"></label><div class="form-error" role="alert"></div><div class="form-actions"><button class="secondary" type="button" data-action="close">取消</button><button class="primary" type="submit">创建账号 ${icon('arrow-right')}</button></div></form>`;
  dialog.showModal(); icons();
}
async function recoveryDialog() {
  const capabilities = await api('/auth/capabilities');
  if (capabilities.passwordRecovery) throw new Error('找回接口已变更，请更新客户端');
  const dialog = $('#editor');
  dialog.innerHTML = `<div class="dialog-head"><h2>找回密码</h2><button class="icon" data-action="close" title="关闭" aria-label="关闭">${icon('x')}</button></div><p class="recovery-notice">应用账号暂未开通自助找回。请联系账号管理员，核验身份后重置密码。</p><p class="recovery-note">请勿向他人提供旧密码或验证码。</p><div class="form-actions"><button class="primary" data-action="close">返回登录</button></div>`;
  dialog.showModal(); icons();
}
function render() {
  if (!state.me) { $('#app').innerHTML = login(); const language=document.createElement('label');language.className='login-language';language.innerHTML=`<span>语言</span><select id="display-language"><option value="zh-CN" ${I18n.locale==='zh-CN'?'selected':''}>简体中文</option><option value="en" ${I18n.locale==='en'?'selected':''}>English</option></select>`;$('.login').prepend(language);icons(); return; }
  window.LiveUI.render(state, { page, taskRow, empty, events, localDate });
  icons();
}
function taskRow(task) {
  return `<div class="task ${task.completed ? 'done' : ''}"><input type="checkbox" data-complete="${task.id}" ${task.completed ? 'checked' : ''} aria-label="${esc(task.completed ? '恢复任务' : '完成任务')}：${esc(task.title)}"><button class="copy" data-edit="${task.id}"><strong>${esc(task.title)}</strong><small>${task.scheduledAt ? dateText(task.scheduledAt) + ' · ' + task.minutes + ' 分钟' : '未安排时间'}</small></button><button class="icon" data-edit="${task.id}" title="编辑任务" aria-label="编辑任务">${icon('ellipsis')}</button>${task.sourceRunId?`<button class="icon" data-chat-run="${task.sourceRunId}" title="查看来源对话" aria-label="查看来源对话">${icon('message-square')}</button>`:''}</div>`;
}
function empty(title, subtitle = '', glyph = 'circle-check') { return `<div class="empty">${icon(glyph)}<strong>${title}</strong>${subtitle}</div>`; }
function events(date) {
  const tasks = state.tasks.filter(t => t.scheduledAt && localDate(new Date(t.scheduledAt)) === date).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return tasks.map(t => `<div class="event ${t.completed ? 'done' : ''}"><time>${dateText(t.scheduledAt, { hour: '2-digit', minute: '2-digit' })}</time><button data-edit="${t.id}"><strong>${esc(t.title)}</strong><small>${t.minutes} 分钟 · ${t.completed ? '已完成' : '待完成'}</small></button></div>`).join('') || empty('这一天，留有余地', '暂无已安排任务', 'calendar-days');
}
function head(title, subtitle, action = true) { return `<div class="page-head"><div><div class="eyebrow">${esc(new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()))}</div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action ? `<button class="primary" data-action="add">${icon('plus')} 新建任务</button>` : ''}</div>`; }
function calendarPage(){
  const view=state.calendarView,anchor=new Date(`${state.date}T12:00:00`),start=new Date(anchor),today=localDate(new Date());
  if(view==='month')start.setDate(1);
  if(view!=='day')start.setDate(start.getDate()-(start.getDay()+6)%7);
  const locale=I18n.locale,fmt=(date,options)=>new Intl.DateTimeFormat(locale,options).format(date);
  const days=Array.from({length:view==='month'?42:7},(_,index)=>{const d=new Date(start);d.setDate(d.getDate()+index);return d;});
  const grouped=new Map();
  for(const task of state.tasks){if(!task.scheduledAt)continue;const key=localDate(new Date(task.scheduledAt));if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(task);}
  for(const tasks of grouped.values())tasks.sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt));
  const title=view==='week'?`${fmt(days[0],{month:'short',day:'numeric'})} – ${fmt(days[6],{year:'numeric',month:'short',day:'numeric'})}`:fmt(anchor,{year:'numeric',month:'long'});
  return `${head('日历','')}<div class="toolbar calendar-toolbar"><div class="tabs" aria-label="日历视图">${[['day','日程'],['week','周'],['month','月']].map(([id,label])=>`<button data-calendar-view="${id}" class="${view===id?'active':''}" aria-pressed="${view===id}">${label}</button>`).join('')}</div><div class="date-nav"><button class="icon" data-day="-1" title="上一时段" aria-label="上一时段">${icon('chevron-left')}</button><input id="calendar-date" type="date" aria-label="日历日期" value="${state.date}"><button class="icon" data-day="1" title="下一时段" aria-label="下一时段">${icon('chevron-right')}</button><button class="secondary" data-action="today">今天</button></div></div><h2 class="calendar-period">${esc(title)}</h2>${view==='day'?`<div class="settings">${events(state.date)}</div>`:`<div class="calendar-scroll"><div class="calendar-grid ${view}">${days.slice(0,7).map(d=>`<div class="calendar-weekday">${esc(fmt(d,{weekday:'short'}))}</div>`).join('')}${days.map(d=>{
    const key=localDate(d),tasks=grouped.get(key)||[];
    return `<section class="calendar-cell ${d.getMonth()!==anchor.getMonth()?'outside':''} ${key===today?'is-today':''}"><header><button data-calendar-date="${key}" aria-label="${esc(fmt(d,{dateStyle:'full'}))}" ${key===today?'aria-current="date"':''}>${d.getDate()}</button><button class="icon calendar-add" data-calendar-add="${key}" aria-label="新建任务" title="新建任务">${icon('plus')}</button></header><div class="calendar-cell-events">${tasks.slice(0,view==='month'?3:100).map(t=>`<button class="calendar-task ${t.completed?'done':''}" data-edit="${t.id}" title="${esc(t.title)}"><time>${esc(fmt(new Date(t.scheduledAt),{hour:'2-digit',minute:'2-digit'}))}</time><span>${esc(t.title)}</span>${t.completed?icon('check'):''}</button>`).join('')}${tasks.length>(view==='month'?3:100)?`<button class="calendar-more" data-calendar-date="${key}">+${tasks.length-(view==='month'?3:100)}</button>`:''}</div></section>`;
  }).join('')}</div></div>`}`;
}
function page() {
  if (state.page === 'hermes') return hermesPage();
  if (state.page === 'account') return accountPage();
  const done = state.tasks.filter(t => t.completed).length;
  if (state.page === 'home') return `${head('今天，也从容一点', `${esc(state.me.user.name)}，欢迎回来。`)}<div class="summary"><div><span>${icon('circle-check')} 待完成</span><strong>${state.tasks.length - done}<small>项任务</small></strong></div><div><span>${icon('calendar-days')} 今日安排</span><strong>${state.tasks.filter(t => t.scheduledAt && localDate(new Date(t.scheduledAt)) === localDate(new Date())).length}<small>项</small></strong></div><div><span>${icon('chart-no-axes-combined')} 已完成</span><strong class="achievement">${done}<small>/ ${state.tasks.length}</small></strong></div></div><div class="work-grid"><section><div class="section-title"><h2>接下来要做的</h2><button class="icon" data-page="tasks" title="全部待办" aria-label="全部待办">${icon('arrow-up-right')}</button></div>${state.tasks.filter(t => !t.completed).slice(0, 6).map(taskRow).join('') || empty('没有待完成事项', done ? '今天的努力，已经记下。' : '从一件重要的小事开始。')}</section><section class="agenda"><div class="section-title"><h2>今日时间线</h2><small>${dateText(new Date(), { month: 'short', day: 'numeric' })}</small></div>${events(localDate(new Date()))}</section></div><footer class="section-foot"><div class="brand-mark">${icon('asterisk')}</div><span>Hermes · ${state.hermes.connected ? esc(state.hermes.origin) : '未连接'}</span><button class="secondary" data-page="hermes">${icon('plug')} ${state.hermes.connected ? '管理连接' : '连接 Hermes'}</button></footer>`;
  if (state.page === 'calendar') return calendarPage();
  const tasks = state.tasks.filter(t => (state.filter === 'all' || t.completed === (state.filter === 'done')) && t.title.toLowerCase().includes(state.search.toLowerCase()));
  return `${head('待办', '')}<div class="toolbar"><div class="tabs">${[['all', '全部'], ['open', '待完成'], ['done', '已完成']].map(([id, label]) => `<button data-filter="${id}" class="${state.filter === id ? 'active' : ''}">${label}</button>`).join('')}</div><input class="search" id="search" type="search" placeholder="搜索任务" aria-label="搜索任务" value="${esc(state.search)}"></div><section id="task-list">${tasks.map(taskRow).join('') || empty('暂无任务')}</section>`;
}
function modelPanel(h){
  const catalog=h.catalog;
  return `<section class="settings-section"><div class="section-title"><h2>模型目录</h2><button class="secondary" data-action="models" ${h.connected?'':'disabled'}>${icon('refresh-cw')}获取模型</button></div>${catalog?`<p class="inline-status">default · 新会话默认模型：${esc(catalog.current.model||'未知')}</p><form id="model-form"><input type="hidden" name="expected" value="${esc(JSON.stringify(catalog.current))}"><label>搜索模型<input id="model-query" type="search" placeholder="提供商或模型名称"></label><div class="model-row"><select name="selection" aria-label="模型" ${catalog.models.length?'':'disabled'}>${catalog.models.map(m=>`<option value="${esc(JSON.stringify({model:m.id,provider:m.provider}))}" ${catalog.current.model===m.id&&catalog.current.provider===m.provider?'selected':''}>${esc(m.providerName)} / ${esc(m.id)}</option>`).join('')}</select><button type="submit" class="primary" ${catalog.models.length?'':'disabled'}>${icon('check')}应用到新会话</button></div><label class="model-cost"><input name="expensive" type="checkbox">允许网关标记的高费用模型</label><p class="inline-status">修改共享 default 档案，现有会话不变。</p><div class="form-error" role="alert"></div></form>` : empty(h.connected?'尚未获取模型目录':'尚未连接 Hermes','','boxes')}</section>`;
}
function hermesPage() {
  const h = state.hermes;
  return `${head('Hermes', '你的智能终端', false)}<div class="settings"><section class="settings-section"><h2>服务器连接</h2>${h.connected ? `<div class="connection-state"><div class="icon">${icon('server')}</div><div class="info"><strong>${esc(h.origin)}</strong><p>${esc(h.username)} · 已保存连接凭证</p></div><button class="secondary danger" data-action="disconnect">${icon('unplug')} 断开</button></div>` : ''}<form id="hermes-form"><div class="form-grid"><label class="full">服务器地址<input name="origin" type="url" placeholder="https://hermes.example.com" value="${esc(h.origin || '')}" required maxlength="2048"></label><label>Hermes 用户名<input name="username" autocomplete="off" value="${esc(h.username || '')}" required maxlength="100"></label><label>Hermes 密码<input name="password" type="password" autocomplete="off" required maxlength="256"></label></div><div class="form-error" role="alert"></div><div class="form-actions"><button class="primary" type="submit">${icon('plug')} ${h.connected ? '重新连接' : '连接服务器'}</button></div></form></section>${modelPanel(h)}</div>`;
}
function accountPage() {
  return `${head('个人设置', '', false)}<div class="settings account-settings"><section class="settings-section"><div class="connection-state"><img class="avatar" src="/assets/avatar.jpg" alt=""><div class="info"><strong>${esc(state.me.user.name)}</strong><p>${esc(state.me.user.username)}</p></div><button class="secondary" data-action="logout">${icon('log-out')} 退出登录</button></div></section><section class="settings-section"><div class="section-title"><h2>账户安全</h2>${icon('shield-check')}</div><div class="preference-row"><span>账号来源</span><span>应用账号验证</span></div><div class="preference-row"><span>修改密码与找回密码</span><span>需联系账号服务管理员</span></div><div class="preference-row"><span>外观与语言</span><button class="secondary" data-page="settings">${icon('settings-2')}偏好设置</button></div></section><section class="settings-section"><div class="section-title"><h2>已登录设备</h2><button class="secondary danger" data-action="revoke-others" ${state.devices.some(d=>!d.current)?'':'disabled'}>${icon('log-out')}退出其他会话</button></div><p class="inline-status">此处仅管理工作台登录，不会停止远端 Hermes 任务。</p>${state.devices.map(d => `<div class="device"><div class="icon">${icon(/手机/.test(d.device) ? 'smartphone' : 'monitor')}</div><div class="copy"><strong>${esc(d.device)}</strong><p>${dateText(d.created)} 登录<br>${dateText(d.expires)} 到期</p></div>${d.current ? '<span class="status">当前会话</span>' : ''}<button class="icon-button" data-action="rename-device" data-device-id="${d.id}" aria-label="重命名设备" title="重命名设备">${icon('pencil')}</button><button class="secondary danger" data-revoke="${d.id}">${d.current ? '退出' : '撤销'}</button></div>`).join('')}</section></div>`;
}
async function refresh(renderPage = true) {
  if (!state.me || state.loading) return;
  const current = generation; state.loading = true;
  try {
    const tasks = await api('/tasks'); const h = await api('/hermes'); const devices = await api('/devices');
    if (current !== generation) return;
    state.tasks = tasks.tasks; state.hermes = h; state.devices = devices.devices; state.stale = false;
    await window.HermesChat.load();
    await window.HermesDocuments.load();
    await window.HermesProjects.load();
    state.loading = false;
    if (renderPage) render();
  } catch (error) { if (current === generation) { state.stale = true; if (renderPage) { render(); notify(error.message); } } }
  finally { state.loading = false; }
}
function edit(id) {
  const task = state.tasks.find(t => t.id === id), dialog = $('#editor');
  const scheduled = task?.scheduledAt ? localInput(task.scheduledAt) : state.page === 'calendar' ? `${state.date}T09:00` : '';
  dialog.innerHTML = `<div class="dialog-head"><h2>${task ? '编辑任务' : '新建任务'}</h2><button class="icon" data-action="close" title="关闭" aria-label="关闭">${icon('x')}</button></div><form id="task-form"><label>任务名称<div class="task-title-input"><input name="title" required maxlength="300" value="${esc(task?.title || '')}" autofocus><button type="button" class="icon" data-action="dictate" title="语音输入" aria-label="语音输入">${icon('mic')}</button></div></label><div class="form-grid"><label>日历时间<input type="datetime-local" name="scheduled" value="${scheduled}"></label><label>时长（分钟）<input type="number" name="minutes" value="${task?.minutes || 30}" min="5" max="1440" required></label></div><div class="form-error" role="alert"></div><div class="form-actions">${task ? '<button type="button" class="secondary danger" data-action="delete-task">删除</button>' : ''}<button type="button" class="secondary" data-action="close">取消</button><button type="submit" class="primary">${icon('check')} 保存</button></div></form>`;
  dialog.task = task ? { ...task } : null; dialog.linkProject=task?undefined:window.HermesProjects.activeId();dialog.pending = null; dialog.showModal(); icons();
}
function taskBody(task) { return { id: task.id, version: task.version, title: task.title, scheduledAt: task.scheduledAt, minutes: task.minutes, timeZone: task.timeZone, completed: task.completed, deleted: task.deleted || false }; }
async function saveTask(body, key = crypto.randomUUID()) {
  await api('/tasks', { method: 'POST', key, body }); await refresh();
  channel?.postMessage('tasks');
}
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('hermes-workbench') : null;
channel?.addEventListener('message', () => reconcile());
async function reconcile() { if (busy || $('#editor').open || !state.me) return; try { const me = await api('/me'); if (me.user.id !== state.me.user.id) reset(); state.me = me; await refresh(!document.activeElement?.matches('input,select')); } catch { /* Explicit actions surface network failures. */ } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcile(); });
setInterval(() => { if (!document.hidden) reconcile(); }, 15000);
document.addEventListener('click', async event => {
  const button = event.target.closest('button,a[data-page],.nav-overlay'); if (!button || button.disabled || busy) return;
  if (button.dataset.page) { event.preventDefault(); state.page = button.dataset.page; state.menu = false; state.aiDrawer = false; state.chatExpanded = false; render(); return; }
  if (button.dataset.moduleFilter) { state.moduleFilter = button.dataset.moduleFilter; render(); return; }
  if (button.dataset.agentTab) { state.agentTab = button.dataset.agentTab; render(); return; }
  if (button.dataset.edit) { edit(button.dataset.edit); return; }
  if (button.dataset.filter) { state.filter = button.dataset.filter; render(); return; }
  if(button.dataset.calendarView){state.calendarView=button.dataset.calendarView;render();return;}
  if(button.dataset.calendarDate){state.date=button.dataset.calendarDate;state.calendarView='day';render();return;}
  if(button.dataset.calendarAdd){state.date=button.dataset.calendarAdd;edit();return;}
  if (button.dataset.day) { const d = new Date(`${state.date}T12:00:00`),step=Number(button.dataset.day); if(state.calendarView==='month'){d.setDate(1);d.setMonth(d.getMonth()+step);}else d.setDate(d.getDate()+step*(state.calendarView==='week'?7:1)); state.date = localDate(d); render(); return; }
  const action = button.dataset.action;
  if (action === 'menu' || action === 'close-menu') { state.menu = action === 'menu'; state.aiDrawer = false; render(); return; }
  if (action === 'toggle-ai') { if(innerWidth<=760){if(state.page==='chat'){state.page=state.chatReturnPage||'home';state.aiDrawer=false;}else{state.chatReturnPage=state.page;state.page='chat';state.aiDrawer=true;}state.chatExpanded=false;}else if (innerWidth <= 1080) state.aiDrawer = !state.aiDrawer; else state.aiHidden = !state.aiHidden; render(); return; }
  if (action === 'assistant-context' || action === 'assistant-chat') { state.aiContext = action === 'assistant-context'; render(); return; }
  if (action === 'search-tasks') { state.page = 'tasks'; render(); $('#search').focus(); return; }
  if (action === 'voice-info') { notify('任务编辑中可语音输入；连续 AI 语音对话尚未接入。'); return; }
  if (action === 'register') return registrationDialog();
  if (action === 'recover') { try { await recoveryDialog(); } catch (error) { notify(error.message); } return; }
  if (action === 'add') return edit();
  if(action==='rename-device'){
    const device=state.devices.find(d=>d.id===button.dataset.deviceId);if(!device)return;
    $('#editor').innerHTML=`<form id="device-name-form"><h2>重命名设备</h2><input type="hidden" name="sessionId" value="${esc(device.id)}"><label>设备名称<input name="device" required maxlength="80" value="${esc(device.device)}" autocomplete="off"></label><div class="form-error" role="alert"></div><div class="form-actions"><button type="button" class="secondary" data-action="close">取消</button><button type="submit" class="primary">保存</button></div></form>`;$('#editor').showModal();return;
  }
  if (action === 'close') { recognition?.abort(); $('#editor').close(); return; }
  if (action === 'window') { window.open(location.href, '_blank', 'noopener,width=1200,height=850'); return; }
  if (action === 'today') { state.date = localDate(new Date()); render(); return; }
  if (action === 'dictate') return dictate(button);
  if (!action && !button.dataset.revoke) return;
  busy = true; button.disabled = true;
  try {
    if (action === 'refresh') await refresh();
    if(action==='revoke-others'&&confirm('退出其他所有工作台会话？当前会话保留，远端任务不会停止。')){await api('/devices/revoke-others',{method:'POST',body:{confirm:true}});await refresh();notify('其他会话已退出');}
    if (action === 'logout' || button.dataset.revoke) {
      if(button.dataset.revoke&&button.dataset.revoke!==state.me.sessionId&&!confirm('撤销这个工作台会话？远端任务不会停止。'))return;
      if((!button.dataset.revoke||button.dataset.revoke===state.me.sessionId)&&window.HermesChat.hasDraft()&&!confirm('退出会丢失未发送的消息和附件，继续？'))return;
      if ((!button.dataset.revoke || button.dataset.revoke === state.me.sessionId) && window.HermesDocuments.dirty() && !confirm('文档有未保存内容，退出后将丢失。确认退出？')) return;
      if ((!button.dataset.revoke || button.dataset.revoke === state.me.sessionId) && window.HermesAgent.dirty() && !confirm('Hermes 配置有未保存修改，确认退出？')) return;
      if ((!button.dataset.revoke || button.dataset.revoke === state.me.sessionId) && window.HermesProjects.dirty() && !confirm('放弃未保存的项目修改？')) return;
      if (button.dataset.revoke) await api(`/devices/${button.dataset.revoke}`, { method: 'DELETE' });
      else await api('/auth/logout', { method: 'POST' });
      if (!button.dataset.revoke || button.dataset.revoke === state.me.sessionId) { reset(); channel?.postMessage('account'); }
      else { await refresh(); notify('已撤销设备会话'); }
    }
    if (action === 'models') {
      const catalog = await api('/hermes/models/refresh', { method: 'POST' }); state.hermes.catalog = catalog; render(); notify(`已获取 ${catalog.models.length} 个模型`);
    }
    if (action === 'disconnect' && confirm('断开此 Hermes 连接？')) { const result = await api('/hermes', { method: 'DELETE' }); await refresh(); notify(result.upstreamRevoked ? '已断开 Hermes' : '本地凭证已移除；远端会话未确认撤销'); }
    if (action === 'delete-task' && confirm('删除这条任务及对应日历安排？')) { await saveTask({ ...taskBody($('#editor').task), deleted: true }); $('#editor').close(); notify('任务已删除'); }
  } catch (error) { notify(error.message); if (action === 'models' && $('#model-status')) $('#model-status').textContent = '获取失败。已有目录为历史缓存，尚未更新。'; if (error.code === 'VERSION_CONFLICT') { $('#editor').close(); await refresh(); } }
  finally { busy = false; button.disabled = false; }
});
document.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'calendar-date' && target.value) { state.date = target.value; render(); }
  if (target.dataset.complete) {
    const task = state.tasks.find(t => t.id === target.dataset.complete); if (!task || busy) { target.checked = !!task?.completed; return; }
    busy = true; target.disabled = true;
    try { await saveTask({ ...taskBody(task), completed: target.checked }); notify(target.checked ? '完成了，日历也已更新。' : '任务已恢复'); }
    catch (error) { target.checked = task.completed; notify(error.message); await refresh(); }
    finally { busy = false; target.disabled = false; }
  }
});
document.addEventListener('input', event => {
  if(event.target.id==='model-query'){const q=event.target.value.trim().toLowerCase(),select=$('#model-form select');for(const option of select.options)option.hidden=!option.textContent.toLowerCase().includes(q);const visible=[...select.options].filter(o=>!o.hidden);if(select.selectedOptions[0]?.hidden)select.value=visible[0]?.value||'';$('#model-form [type=submit]').disabled=!visible.length;}
  if (event.target.id === 'search') { state.search = event.target.value; const tasks = state.tasks.filter(t => (state.filter === 'all' || t.completed === (state.filter === 'done')) && t.title.toLowerCase().includes(state.search.toLowerCase())); $('#task-list').innerHTML = tasks.map(taskRow).join('') || empty('没有匹配任务'); icons(); }
});
document.addEventListener('submit', async event => {
  if (event.target.matches('#live-chat-form,.clarify-form')) return;
  event.preventDefault(); if (busy) return;
  const form = event.target, data = Object.fromEntries(new FormData(form)), submit = form.querySelector('[type=submit],button.primary');
  busy = true; if (submit) submit.disabled = true;
  const errorBox = form.querySelector('.form-error'); if (errorBox) errorBox.textContent = '';
  try {
    if (form.id === 'register-form') {
      if (data.password !== data.confirmPassword) throw new Error('两次输入的密码不一致。');
      if (!/^[A-Za-z0-9.*_-]{6,18}$/.test(data.password)) throw new Error('密码须为 6–18 位字母、数字或 . * _ -。');
      await api('/auth/register', { method: 'POST', body: data });
      form.reset(); $('#editor').close(); render();
      $('#login-form [name=username]').value = data.username;
      $('#login-form [name=password]').focus(); notify('注册成功，请登录');
    }
    if(form.id==='device-name-form'){await api(`/devices/${data.sessionId}`,{method:'PATCH',body:{device:data.device}});$('#editor').close();await refresh();notify('设备名称已更新');}
    if (form.id === 'login-form') { const me = await api('/auth/login', { method: 'POST', body: data }); generation++; state.me = me; form.reset(); await refresh(); render(); channel?.postMessage('account'); }
    if (form.id === 'hermes-form') { state.hermes = await api('/hermes/connect', { method: 'POST', body: data }); form.elements.password.value = ''; render(); notify('Hermes 登录已验证，现在可以获取模型'); }
    if (form.id === 'model-form') {
      const selected = JSON.parse(data.selection);
      if(!confirm('将所选模型应用到共享 default 档案？其他客户端新建会话也会受影响，现有会话不会切换。'))return;
      const result=await api('/hermes/model',{method:'POST',body:{...selected,expected:JSON.parse(data.expected),confirm:true,confirmExpensive:data.expensive==='on'}});
      state.hermes.catalog=result.catalog;state.hermes.preference=result.preference;render();notify('远端模型已回读确认，将用于新会话');
    }
    if (form.id === 'task-form') {
      const task = $('#editor').task;
      const body = { id: task?.id || $('#editor').pending?.body.id || crypto.randomUUID(), version: task?.version || 0, title: data.title.trim(), scheduledAt: data.scheduled ? new Date(data.scheduled).toISOString() : null, minutes: Number(data.minutes), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, completed: task?.completed || false, deleted: false,...($('#editor').linkProject?{linkProject:$('#editor').linkProject}:{}) };
      const fingerprint = JSON.stringify(body), pending = $('#editor').pending;
      const key = pending?.fingerprint === fingerprint ? pending.key : crypto.randomUUID();
      $('#editor').pending = { body, fingerprint, key };
      await saveTask(body, key); recognition?.abort(); $('#editor').close(); notify('任务已保存');
    }
  } catch (error) { if (errorBox) errorBox.textContent = error.message; else notify(error.message); if (error.code === 'VERSION_CONFLICT') { $('#editor').close(); await refresh(); } }
  finally { busy = false; if (submit) submit.disabled = false; }
});
function dictate(button) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return notify('当前浏览器不支持语音输入');
  if (recognition) { recognition.abort(); return; }
  const instance = new SpeechRecognition(); recognition = instance; instance.lang = 'zh-CN'; instance.continuous = false; instance.interimResults = false;
  button.classList.add('recording'); button.title = '停止语音输入';
  instance.onresult = event => { const field = $('#task-form input[name=title]'); if (field && $('#editor').open) field.value = (field.value + event.results[0][0].transcript).slice(0, 300); };
  instance.onerror = () => notify('语音输入不可用，请检查麦克风权限与网络');
  instance.onend = () => { if (recognition === instance) recognition = null; button.classList.remove('recording'); button.title = '语音输入'; };
  try { instance.start(); } catch { instance.onend(); notify('无法启动麦克风'); }
}
$('#editor').addEventListener('close', () => {
  recognition?.abort();
  const dialog = $('#editor');
  if (!dialog.open) { dialog.replaceChildren(); dialog.task = null; dialog.pending = null; }
});
window.HermesChat.configure({state,api,render,notify,refresh,changed:()=>channel?.postMessage('tasks')});
window.HermesDocuments.configure({state,api,render,notify});
window.HermesProjects.configure({state,api,render,notify,taskRow});
window.HermesTaskPlan.configure({state,api,refresh,notify,changed:()=>channel?.postMessage('tasks')});
window.HermesAgent.configure({state,api,render,notify});
window.HermesProfiles.configure({state,api,render,notify});
window.HermesExternalAgents.configure({state,api,render,notify});
window.HermesSkillsHub.configure({state,api,render,notify});
(async () => { try { state.me = await api('/me'); await refresh(); } catch (error) { if (error.code !== 'AUTH_REQUIRED') notify(error.message); } render(); })();
