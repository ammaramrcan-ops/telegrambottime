export const dashboardHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>لوحة الإنتاجية</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
:root{--bg:#0f172a;--card:rgba(30,41,59,0.75);--txt:#f8fafc;--muted:#94a3b8;--accent:#6366f1;--green:#10b981;--red:#ef4444;--yellow:#f59e0b;--border:rgba(255,255,255,0.08);}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Cairo',sans-serif;background:radial-gradient(ellipse at top,#1e1b4b,var(--bg));color:var(--txt);min-height:100vh;padding:1.5rem;}
.wrap{max-width:1300px;margin:0 auto;}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem;padding-bottom:1rem;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:1rem;}
h1{font-size:2rem;background:linear-gradient(135deg,#818cf8,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.badge{background:rgba(16,185,129,.1);color:var(--green);padding:.4rem 1rem;border-radius:20px;font-size:.85rem;display:flex;align-items:center;gap:.5rem;border:1px solid rgba(16,185,129,.2);}
.dot{width:8px;height:8px;background:var(--green);border-radius:50%;animation:pulse 2s infinite;}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(16,185,129,.7)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;}
@media(max-width:768px){.grid2{grid-template-columns:1fr;}}
.card{background:var(--card);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:18px;padding:1.5rem;transition:.3s;margin-bottom:1.5rem;}
.card:hover{transform:translateY(-3px);box-shadow:0 20px 40px rgba(0,0,0,.3);}
.card h2{font-size:1.15rem;color:#e2e8f0;margin-bottom:1.2rem;padding-bottom:.6rem;border-bottom:1px dashed var(--border);display:flex;align-items:center;gap:.5rem;}
.chart-wrap{height:280px;display:flex;justify-content:center;}
table{width:100%;border-collapse:collapse;}
th{color:var(--muted);font-size:.8rem;padding:.7rem 1rem;text-align:right;border-bottom:1px solid var(--border);}
td{padding:.8rem 1rem;border-bottom:1px solid var(--border);font-size:.9rem;}
tr:last-child td{border:none;}
tbody tr:hover{background:rgba(255,255,255,.04);}
.chip{display:inline-block;padding:.25rem .7rem;border-radius:10px;font-size:.8rem;font-weight:600;}
.chip-blue{background:rgba(99,102,241,.2);color:#818cf8;border:1px solid rgba(99,102,241,.3);}
.chip-green{background:rgba(16,185,129,.2);color:#34d399;border:1px solid rgba(16,185,129,.3);}
.chip-red{background:rgba(239,68,68,.2);color:#f87171;border:1px solid rgba(239,68,68,.3);}
.chip-yellow{background:rgba(245,158,11,.2);color:#fcd34d;border:1px solid rgba(245,158,11,.3);}
.chip-purple{background:rgba(167,139,250,.2);color:#c4b5fd;border:1px solid rgba(167,139,250,.3);}
.chip-pink{background:rgba(236,72,153,.2);color:#f9a8d4;border:1px solid rgba(236,72,153,.3);}
.empty{text-align:center;padding:2rem;color:var(--muted);font-style:italic;}

/* ── Tasks Section ── */
.task-view-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;}
.task-view-period{background:rgba(15,23,42,0.4);border:1px solid var(--border);border-radius:16px;padding:1.2rem;}
.task-view-period h3{font-size:1rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;}
.task-list-item{display:flex;align-items:center;gap:.8rem;padding:.7rem;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:.6rem;transition:.2s;}
.task-list-item:hover{background:rgba(255,255,255,0.06);}
.task-list-item.done{opacity:0.6;}
.task-list-item.done .title{text-decoration:line-through;color:var(--muted);}
.checkbox{width:20px;height:20px;border-radius:6px;border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
.checkbox.checked{background:var(--accent);color:white;font-size:12px;}
.title{flex:1;font-size:.95rem;}
.time-label{font-size:.7rem;color:var(--muted);background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;}

/* ── Manage Tasks ── */
.manage-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem;}
.manage-col{background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:14px;padding:1rem;}
.add-task-form{margin-top:1rem;display:flex;flex-direction:column;gap:.5rem;}
.add-task-form input{background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:8px;padding:.5rem;color:var(--txt);font-family:'Cairo';font-size:.85rem;}
.add-task-form button{background:var(--accent);border:none;color:white;padding:.5rem;border-radius:8px;cursor:pointer;font-family:'Cairo';}

/* ── Tabs ── */
.tabs{display:flex;gap:.5rem;margin-bottom:1.5rem;flex-wrap:wrap;}
.tab{background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:10px;padding:.5rem 1.2rem;cursor:pointer;font-family:'Cairo',sans-serif;font-size:.9rem;color:var(--muted);transition:.2s;}
.tab.active{background:var(--accent);color:#fff;border-color:var(--accent);}
.section{display:none;}.section.show{display:block;}

.btn-sm{background:none;border:none;cursor:pointer;padding:.2rem .4rem;border-radius:5px;font-size:.9rem;transition:.15s;}
.btn-sm:hover{background:rgba(255,255,255,.1);}

/* ── Timeline ── */
.timeline-card{overflow:visible;}
.timeline-container{position:relative;width:100%;height:100px;background:rgba(255,255,255,0.03);border-radius:12px;margin:2rem 0 3rem;border:1px solid var(--border);padding:0 5px;}
.timeline-hours{display:flex;justify-content:space-between;position:absolute;bottom:-25px;width:100%;left:0;padding:0 5px;}
.timeline-hours span{font-size:0.7rem;color:var(--muted);}
.timeline-item{position:absolute;top:15px;height:70px;border-radius:6px;cursor:pointer;transition:0.2s;border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden;}
.timeline-item:hover{transform:scaleY(1.1);z-index:10;box-shadow:0 0 20px rgba(0,0,0,0.5);}
.prayer-line{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,0.15);z-index:2;pointer-events:none;}
.prayer-line::after{content:attr(data-label);position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:0.65rem;color:var(--muted);white-space:nowrap;}
.tl-tooltip{position:absolute;background:#1e293b;border:1px solid var(--accent);padding:0.6rem;border-radius:8px;font-size:0.8rem;z-index:100;pointer-events:none;display:none;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);color:white;min-width:150px;}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1rem;}
.progress-container{background:rgba(255,255,255,0.05);height:12px;border-radius:6px;overflow:hidden;margin-top:0.5rem;border:1px solid var(--border);}
.progress-bar{height:100%;background:linear-gradient(90deg, var(--accent), var(--green));width:0%;transition:1s ease-out;}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>🚀 بوظة الإنتاجية</h1>
  <div class="badge"><div class="dot"></div> البوت نشط ومتصل</div>
</header>

<div class="tabs">
  <button class="tab active" onclick="showTab('status')">🏠 المهام الحالية</button>
  <button class="tab" onclick="showTab('manage')">⚙️ إدارة المهام</button>
  <button class="tab" onclick="showTab('stats')">📊 الإحصائيات</button>
  <button class="tab" onclick="showTab('ideas')">💡 الأفكار</button>
  <button class="tab" onclick="showTab('archive')">🗂️ الأرشيف</button>
</div>

<!-- STATUS (HOME) -->
<div id="tab-status" class="section show">
  <!-- Visual Timeline -->
  <div class="card timeline-card">
    <h2>🕒 مخطط النشاطات الزمني (24 ساعة)</h2>
    <div class="timeline-container" id="timelineContainer">
      <div class="prayer-line" style="left: 18.75%" data-label="الفجر"></div>
      <div class="prayer-line" style="left: 50%" data-label="الظهر"></div>
      <div class="prayer-line" style="left: 64.58%" data-label="العصر"></div>
      <div class="prayer-line" style="left: 78.12%" data-label="المغرب"></div>
      <div class="prayer-line" style="left: 84.37%" data-label="العشاء"></div>
      <div id="timelineItems"></div>
      <div class="timeline-hours">
        <span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>23:59</span>
      </div>
    </div>
    <div id="timelineSummary" class="summary-grid"></div>
    <div class="tl-tooltip" id="timelineTooltip"></div>
  </div>

  <div class="card">
    <h2>🏠 مهام اليوم وحالتها التنفيذية</h2>
    <div id="statusGrid" class="task-view-grid">
      <div class="empty">جاري تحميل المهام...</div>
    </div>
  </div>
</div>

<!-- MANAGE TASKS -->
<div id="tab-manage" class="section">
  <div class="card">
    <h2>⚙️ إضافة وإدارة المهام للفترات</h2>
    <div id="manageGrid" class="manage-grid">
      <div class="empty">جاري التحميل...</div>
    </div>
  </div>
</div>

<!-- STATS -->
<div id="tab-stats" class="section">
  <div class="grid2">
    <div class="card">
      <h2>📈 توزيع الأنشطة</h2>
      <div class="chart-wrap"><canvas id="activityChart"></canvas></div>
    </div>
    <div class="card">
      <h2>📝 سجل الأنشطة</h2>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>التوقيت</th><th>النشاط</th><th>المدة (س)</th><th>إجراء</th></tr></thead>
          <tbody id="logsBody"><tr><td colspan="4" class="empty">جاري التحميل...</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- IDEAS -->
<div id="tab-ideas" class="section">
  <div class="card">
    <h2>💡 بنك الأفكار</h2>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>التوقيت</th><th>الفكرة</th><th>التصنيف</th></tr></thead>
        <tbody id="ideasBody"><tr><td colspan="3" class="empty">جاري التحميل...</td></tr></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ARCHIVE -->
<div id="tab-archive" class="section">
  <div class="card">
    <h2>🗂️ أرشيف الأيام السابقة</h2>
    <div id="archiveBody"><div class="empty">جاري التحميل...</div></div>
  </div>
</div>

</div>

<script>
const PERIODS = [
  {key:'fajr_dhuhr',  label:'الفجر → الظهر',   time:'4:30 – 12:00', chipClass:'chip-yellow'},
  {key:'dhuhr_asr',   label:'الظهر → العصر',   time:'12:00 – 15:30',chipClass:'chip-blue'},
  {key:'asr_maghrib', label:'العصر → المغرب',  time:'15:30 – 18:45',chipClass:'chip-green'},
  {key:'maghrib_isha',label:'المغرب → العشاء', time:'18:45 – 20:15',chipClass:'chip-purple'},
  {key:'isha_fajr',   label:'العشاء → الفجر',  time:'20:15 – 4:30', chipClass:'chip-pink'},
];

function showTab(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('show'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('show');
  event.target.classList.add('active');
}

function fmtDate(iso){
  return new Date(iso).toLocaleString('ar-EG',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

// ── Tasks ──
let allTasks=[];
async function loadTasks(){
  const res=await fetch('/api/tasks');
  allTasks=await res.json();
  renderStatus();
  renderManage();
}

function renderStatus(){
  const grid = document.getElementById('statusGrid');
  grid.innerHTML = PERIODS.map(p => {
    const tasks = allTasks.filter(t => t.period === p.key);
    if(tasks.length === 0) return '';
    return \`
    <div class="task-view-period">
      <h3><span class="chip \${p.chipClass}">\${p.label}</span> <span class="time-label">\${p.time}</span></h3>
      \${tasks.map(t => \`
        <div class="task-list-item \${t.is_done?'done':''}">
          <div class="checkbox \${t.is_done?'checked':''}" onclick="doneTask(\${t.id})">\${t.is_done?'✓':''}</div>
          <span class="title">\${t.title} \${t.estimated_hours?'<small>('+t.estimated_hours+'س)</small>':''}</span>
        </div>
      \`).join('')}
    </div>\`;
  }).join('') || '<div class="empty">لا توجد مهام مسجلة لهذا اليوم. اذهب لصفحة الإدارة لإضافة مهام.</div>';
}

function renderManage(){
  const grid = document.getElementById('manageGrid');
  grid.innerHTML = PERIODS.map(p => {
    const tasks = allTasks.filter(t => t.period === p.key);
    return \`
    <div class="manage-col">
      <h3>\${p.label}</h3>
      <div class="task-manage-list">
        \${tasks.map(t => \`
          <div style="display:flex;justify-content:space-between;font-size:.85rem;padding:.3rem 0;border-bottom:1px solid rgba(255,255,255,0.05)">
            <span>\${t.title}</span>
            <button class="btn-sm" onclick="delTask(\${t.id})">🗑️</button>
          </div>
        \`).join('')}
      </div>
      <div class="add-task-form">
        <input id="inp-\${p.key}" placeholder="عنوان المهمة..." type="text">
        <input id="hrs-\${p.key}" placeholder="الساعات" type="number" step="0.5">
        <button onclick="addTask('\${p.key}')">إضافة مهمة +</button>
      </div>
    </div>\`;
  }).join('');
}

async function addTask(periodKey){
  const inp=document.getElementById('inp-'+periodKey);
  const hrs=document.getElementById('hrs-'+periodKey);
  if(!inp.value.trim()) return;
  const body={title:inp.value.trim(),period:periodKey};
  if(hrs.value) body.estimated_hours=parseFloat(hrs.value);
  await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  await loadTasks();
}

async function doneTask(id){
  await fetch('/api/tasks/'+id+'/done',{method:'PATCH'});
  await loadTasks();
}

async function delTask(id){
  if(!confirm('حذف المهمة؟')) return;
  await fetch('/api/tasks/'+id,{method:'DELETE'});
  await loadTasks();
}

// ── Logs + Chart ──
let chartInst = null;
async function loadLogs(){
  const res = await fetch('/api/logs');
  const logs = await res.json();
  const tbody = document.getElementById('logsBody');
  if(!logs||logs.length===0){tbody.innerHTML='<tr><td colspan="4" class="empty">لا يوجد أنشطة مسجلة</td></tr>';return;}
  tbody.innerHTML = logs.map(l=>\`
    <tr>
      <td style="color:#cbd5e1;font-size:.8rem" dir="ltr">\${fmtDate(l.created_at)}</td>
      <td><span class="chip chip-blue">\${l.activity}</span></td>
      <td style="color:var(--green);font-weight:700">\${Number(l.duration_hours).toFixed(2)}</td>
      <td><button class="btn-sm" onclick="delLogEntry(\${l.id})" title="حذف">🗑️</button></td>
    </tr>\`).join('');

  const totals={};
  logs.forEach(l=>{ totals[l.activity]=(totals[l.activity]||0)+Number(l.duration_hours); });
  const ctx=document.getElementById('activityChart').getContext('2d');
  if(chartInst) chartInst.destroy();
  chartInst=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:Object.keys(totals),
      datasets:[{data:Object.values(totals),backgroundColor:['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'],borderWidth:0}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{family:'Cairo'},color:'#e2e8f0'}}}}
  });

  renderTimeline(logs);
}

function renderTimeline(logs) {
  const container = document.getElementById('timelineItems');
  const summary = document.getElementById('timelineSummary');
  const tooltip = document.getElementById('timelineTooltip');
  if (!logs) return;

  const getColor = (name) => {
    if (name.includes('صلاة')) return '#22c55e';
    if (name.includes('أكل')) return '#f97316';
    if (name.includes('حمام')) return '#38bdf8';
    if (name.includes('تضييع')) return '#ef4444';
    return '#8b5cf6';
  };

  let totalMins = 0;
  const itemsHtml = logs.map(l => {
    // Adapt to different field names if necessary
    const name = l.activity || l.name || 'نشاط';
    const durationMins = l.duration ? l.duration : (l.duration_hours ? l.duration_hours * 60 : 0);
    
    let start, end;
    if (l.start_time && l.end_time) {
      start = new Date(l.start_time);
      end = new Date(l.end_time);
    } else {
      end = new Date(l.created_at);
      start = new Date(end.getTime() - durationMins * 60000);
    }

    totalMins += durationMins;

    const startOfToday = new Date(start);
    startOfToday.setHours(0,0,0,0);
    const startMins = (start.getTime() - startOfToday.getTime()) / 60000;
    
    const left = (startMins / 1440) * 100;
    const width = (durationMins / 1440) * 100;

    return '<div class="timeline-item" ' +
           'style="left: ' + left + '%; width: ' + width + '%; background: ' + getColor(name) + ';" ' +
           'onmouseover="showTooltip(event, \'' + name + '\', \'' + Math.round(durationMins) + ' دقيقة\', \'' + formatClock(start) + ' - ' + formatClock(end) + '\')" ' +
           'onmouseout="hideTooltip()">' +
           '</div>';
  }).join('');

  container.innerHTML = itemsHtml;

  const wakeHours = 18;
  const wakeMins = wakeHours * 60;
  const progress = Math.min((totalMins / wakeMins) * 100, 100);

  summary.innerHTML = 
    '<div>' +
      '<div style="font-size:0.9rem; color:var(--muted)">📊 إحصائية سريعة</div>' +
      '<div style="font-size:1.1rem; font-weight:bold">' + logs.length + ' أنشطة | ' + Math.floor(totalMins/60) + ' ساعة ' + Math.round(totalMins%60) + ' دقيقة</div>' +
    '</div>' +
    '<div>' +
      '<div style="font-size:0.9rem; color:var(--muted)">⚡ نسبة الإنجاز من ساعات اليقظة (' + wakeHours + 'س)</div>' +
      '<div class="progress-container"><div class="progress-bar" style="width: ' + progress + '%"></div></div>' +
      '<div style="font-size:0.75rem; text-align:left; margin-top:4px">' + Math.round(progress) + '%</div>' +
    '</div>';
}

function formatClock(date) {
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function showTooltip(e, name, dur, time) {
  const tt = document.getElementById('timelineTooltip');
  tt.innerHTML = '<strong>' + name + '</strong><br>⏱️ ' + dur + '<br>🕒 ' + time;
  tt.style.display = 'block';
  tt.style.left = (e.pageX + 10) + 'px';
  tt.style.top = (e.pageY + 10) + 'px';
}

function hideTooltip() {
  document.getElementById('timelineTooltip').style.display = 'none';
}

async function delLogEntry(id){
  if(!confirm('حذف النشاط؟')) return;
  await fetch('/api/logs/'+id,{method:'DELETE'});
  await loadLogs();
}

// ── Ideas & Archive ──
async function loadIdeas(){
  const res=await fetch('/api/ideas');
  const ideas=await res.json();
  const tbody=document.getElementById('ideasBody');
  tbody.innerHTML=ideas.map(i=> '<tr><td>' + fmtDate(i.created_at) + '</td><td>' + i.content + '</td><td>' + i.category + '</td></tr>').join('');
}

async function loadArchive(){
  const res=await fetch('/api/archive');
  const data=await res.json();
  const el=document.getElementById('archiveBody');
  if(!data||data.length===0){el.innerHTML='<div class="empty">لا يوجد أرشيف</div>';return;}
  const byDay={};
  data.forEach(r=>{ (byDay[r.log_date]=byDay[r.log_date]||[]).push(r); });
  el.innerHTML=Object.entries(byDay).map(([date,rows])=> 
    '<div class="archive-day">' +
      '<div style="border-bottom:1px solid var(--border);padding:.5rem 0;color:var(--muted)">📅 ' + date + '</div>' +
      '<table>' + rows.map(r=> '<tr><td>' + r.activity + '</td><td>' + Number(r.duration_hours).toFixed(2) + 'س</td></tr>').join('') + '</table>' +
    '</div>').join('');
}

loadLogs(); loadTasks(); loadIdeas(); loadArchive();
setInterval(()=>{ loadLogs(); loadTasks(); }, 60000);
</script>
</body>
</html>`;
