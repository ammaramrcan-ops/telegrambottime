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
.card{background:var(--card);backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:18px;padding:1.5rem;transition:.3s;}
.card:hover{transform:translateY(-3px);box-shadow:0 20px 40px rgba(0,0,0,.3);}
.card h2{font-size:1.15rem;color:#e2e8f0;margin-bottom:1.2rem;padding-bottom:.6rem;border-bottom:1px dashed var(--border);display:flex;align-items:center;gap:.5rem;}
.chart-wrap{height:280px;display:flex;justify-content:center;}
table{width:100%;border-collapse:collapse;}
th{color:var(--muted);font-size:.8rem;padding:.7rem 1rem;text-align:right;border-bottom:1px solid var(--border);}
td{padding:.8rem 1rem;border-bottom:1px solid var(--border);font-size:.9rem;}
tr:last-child td{border:none;}
tbody tr{transition:.2s;}
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
.periods-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem;margin-top:1rem;}
.period-col{background:rgba(15,23,42,.5);border:1px solid var(--border);border-radius:14px;padding:1rem;}
.period-col h3{font-size:.9rem;margin-bottom:.8rem;display:flex;align-items:center;gap:.4rem;}
.period-col h3 .ptime{font-size:.75rem;color:var(--muted);font-weight:400;}
.task-item{background:rgba(255,255,255,.05);border-radius:8px;padding:.6rem .8rem;margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center;gap:.4rem;}
.task-item.done{opacity:.45;text-decoration:line-through;}
.task-title{font-size:.85rem;flex:1;}
.task-est{font-size:.75rem;color:var(--muted);}
.task-actions{display:flex;gap:.3rem;}
.btn-sm{background:none;border:none;cursor:pointer;padding:.2rem .4rem;border-radius:5px;font-size:.9rem;transition:.15s;}
.btn-sm:hover{background:rgba(255,255,255,.1);}
.add-task{display:flex;gap:.5rem;margin-top:.7rem;}
.add-task input,.add-task select{flex:1;background:rgba(255,255,255,.07);border:1px solid var(--border);border-radius:8px;padding:.45rem .7rem;color:var(--txt);font-family:'Cairo',sans-serif;font-size:.82rem;}
.add-task input::placeholder{color:var(--muted);}
.add-task button{background:var(--accent);border:none;color:#fff;border-radius:8px;padding:.45rem .9rem;cursor:pointer;font-family:'Cairo',sans-serif;font-size:.82rem;transition:.2s;}
.add-task button:hover{opacity:.85;}
.period-active{border-color:rgba(99,102,241,.5);box-shadow:0 0 15px rgba(99,102,241,.15);}

/* ── Tabs ── */
.tabs{display:flex;gap:.5rem;margin-bottom:1.5rem;flex-wrap:wrap;}
.tab{background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:10px;padding:.5rem 1.2rem;cursor:pointer;font-family:'Cairo',sans-serif;font-size:.9rem;color:var(--muted);transition:.2s;}
.tab.active{background:var(--accent);color:#fff;border-color:var(--accent);}
.section{display:none;}.section.show{display:block;}

/* ── Archive ── */
.archive-day{margin-bottom:1rem;}
.archive-day-header{font-size:.85rem;color:var(--muted);margin-bottom:.4rem;padding:.3rem 0;border-bottom:1px solid var(--border);}
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>🚀 لوحة الإنتاجية</h1>
  <div class="badge"><div class="dot"></div> البوت نشط ومتصل</div>
</header>

<div class="tabs">
  <button class="tab active" onclick="showTab('today')">📊 اليوم</button>
  <button class="tab" onclick="showTab('tasks')">📋 المهام</button>
  <button class="tab" onclick="showTab('ideas')">💡 الأفكار</button>
  <button class="tab" onclick="showTab('archive')">🗂️ الأرشيف</button>
</div>

<!-- TODAY -->
<div id="tab-today" class="section show">
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

<!-- TASKS -->
<div id="tab-tasks" class="section">
  <div class="card">
    <h2>📋 مهام اليوم — مقسّمة حسب الفترات</h2>
    <div class="periods-grid" id="periodsGrid">
      <div class="empty" style="grid-column:1/-1">جاري التحميل...</div>
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

</div><!-- /wrap -->

<script>
const PERIODS = [
  {key:'fajr_dhuhr',  label:'الفجر → الظهر',   time:'4:30 – 12:00', chipClass:'chip-yellow'},
  {key:'dhuhr_asr',   label:'الظهر → العصر',   time:'12:00 – 15:30',chipClass:'chip-blue'},
  {key:'asr_maghrib', label:'العصر → المغرب',  time:'15:30 – 18:45',chipClass:'chip-green'},
  {key:'maghrib_isha',label:'المغرب → العشاء', time:'18:45 – 20:15',chipClass:'chip-purple'},
  {key:'isha_fajr',   label:'العشاء → الفجر',  time:'20:15 – 4:30', chipClass:'chip-pink'},
];

function getCurrentPeriodKey(){
  const now=new Date();
  const h=now.getHours(), m=now.getMinutes(), t=h*60+m;
  if(t>=4*60+30 && t<12*60) return 'fajr_dhuhr';
  if(t>=12*60   && t<15*60+30) return 'dhuhr_asr';
  if(t>=15*60+30&& t<18*60+45) return 'asr_maghrib';
  if(t>=18*60+45&& t<20*60+15) return 'maghrib_isha';
  return 'isha_fajr';
}

function showTab(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('show'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('show');
  event.target.classList.add('active');
}

function fmtDate(iso){
  return new Date(iso).toLocaleString('ar-EG',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
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

  // Chart
  const totals={};
  logs.forEach(l=>{ totals[l.activity]=(totals[l.activity]||0)+Number(l.duration_hours); });
  const ctx=document.getElementById('activityChart').getContext('2d');
  if(chartInst) chartInst.destroy();
  Chart.defaults.color='#94a3b8'; Chart.defaults.font.family='Cairo';
  chartInst=new Chart(ctx,{
    type:'doughnut',
    data:{
      labels:Object.keys(totals),
      datasets:[{data:Object.values(totals),
        backgroundColor:['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'],
        borderWidth:0,hoverOffset:8}]
    },
    options:{responsive:true,maintainAspectRatio:false,cutout:'70%',
      plugins:{legend:{position:'right',labels:{font:{size:13,family:'Cairo'},color:'#e2e8f0',padding:16}}}}
  });
}

// ── Tasks ──
let allTasks=[];
async function loadTasks(){
  const res=await fetch('/api/tasks');
  allTasks=await res.json();
  renderPeriods();
}

function renderPeriods(){
  const current=getCurrentPeriodKey();
  const grid=document.getElementById('periodsGrid');
  grid.innerHTML=PERIODS.map(p=>{
    const tasks=allTasks.filter(t=>t.period===p.key);
    const isActive=p.key===current;
    return \`
    <div class="period-col \${isActive?'period-active':''}">
      <h3>
        <span class="chip \${p.chipClass}">\${isActive?'▶ ':''}\${p.label}</span>
        <span class="ptime">\${p.time}</span>
      </h3>
      \${tasks.map(t=>\`
        <div class="task-item \${t.is_done?'done':''}" id="task-\${t.id}">
          <span class="task-title">\${t.title}</span>
          \${t.estimated_hours?'<span class="task-est">'+t.estimated_hours+'س</span>':''}
          <span class="task-actions">
            \${!t.is_done?'<button class="btn-sm" onclick="doneTask('+t.id+')" title="تم">✅</button>':''}
            <button class="btn-sm" onclick="delTask('+t.id+')" title="حذف">🗑️</button>
          </span>
        </div>\`).join('')}
      <div class="add-task">
        <input id="inp-\${p.key}" placeholder="مهمة جديدة..." type="text" onkeydown="if(event.key==='Enter')addTask('\${p.key}')">
        <input id="hrs-\${p.key}" placeholder="ساعات" type="number" min="0.1" step="0.1" style="max-width:70px">
        <button onclick="addTask('\${p.key}')">+</button>
      </div>
    </div>\`;
  }).join('');
}

async function delLogEntry(id){
  if(!confirm('حذف هذا النشاط من السجل؟')) return;
  await fetch('/api/logs/'+id,{method:'DELETE'});
  await loadLogs();
}

async function addTask(periodKey){
  const inp=document.getElementById('inp-'+periodKey);
  const hrs=document.getElementById('hrs-'+periodKey);
  const title=inp.value.trim();
  if(!title) return;
  const body={title,period:periodKey};
  if(hrs.value) body.estimated_hours=parseFloat(hrs.value);
  await fetch('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  inp.value=''; hrs.value='';
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

// ── Ideas ──
async function loadIdeas(){
  const res=await fetch('/api/ideas');
  const ideas=await res.json();
  const tbody=document.getElementById('ideasBody');
  if(!ideas||ideas.length===0){tbody.innerHTML='<tr><td colspan="3" class="empty">لا توجد أفكار</td></tr>';return;}
  tbody.innerHTML=ideas.map(i=>{
    const bad=i.category==='مضيعة للوقت';
    return \`<tr>
      <td style="color:#cbd5e1;font-size:.8rem" dir="ltr">\${fmtDate(i.created_at)}</td>
      <td style="color:#e2e8f0">\${i.content}</td>
      <td><span class="chip \${bad?'chip-red':'chip-green'}">\${i.category}</span></td>
    </tr>\`;
  }).join('');
}

// ── Archive ──
async function loadArchive(){
  const res=await fetch('/api/archive');
  const data=await res.json();
  const el=document.getElementById('archiveBody');
  if(!data||data.length===0){el.innerHTML='<div class="empty">لا يوجد أرشيف بعد</div>';return;}
  const byDay={};
  data.forEach(r=>{ (byDay[r.log_date]=byDay[r.log_date]||[]).push(r); });
  el.innerHTML=Object.entries(byDay).map(([date,rows])=>\`
    <div class="archive-day">
      <div class="archive-day-header">📅 \${date} — \${rows.reduce((s,r)=>s+Number(r.duration_hours),0).toFixed(2)} ساعة إجمالية</div>
      <table>
        <thead><tr><th>النشاط</th><th>المدة (س)</th><th>التوقيت</th></tr></thead>
        <tbody>
          \${rows.map(r=>\`<tr>
            <td><span class="chip chip-blue">\${r.activity}</span></td>
            <td style="color:var(--green);font-weight:700">\${Number(r.duration_hours).toFixed(2)}</td>
            <td style="color:#cbd5e1;font-size:.8rem" dir="ltr">\${r.logged_at?fmtDate(r.logged_at):''}</td>
          </tr>\`).join('')}
        </tbody>
      </table>
    </div>\`).join('');
}

// ── Init ──
loadLogs();
loadTasks();
loadIdeas();
loadArchive();
setInterval(loadLogs,  60000);
setInterval(loadTasks, 60000);
</script>
</body>
</html>`;
