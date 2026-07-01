const DISEASE_COLORS = {
  Measles:'#378ADD', Dengue:'#D85A30', Malaria:'#1D9E75',
  Cholera:'#D4537E', AWD:'#BA7517', TB:'#7F77DD'
};
const DISEASE_BG = {
  Measles:'#F9F1F0', Dengue:'#F4E8DB', Malaria:'#F4F0E1',
  Cholera:'#E9F1EE', AWD:'#EAF5FF', TB:'#EEE9F2'
};
const HOSP_COLORS = {
  BU:'#378ADD',HG:'#D85A30',EG:'#1D9E75',GH:'#D4537E',
  MC:'#BA7517',BO:'#7F77DD',BE:'#639922',BA:'#888780',SL:'#533AB7'
};

let currentDisease = 'Measles', selectedHospital = null, charts = {};
let RAW = {}; // 原本寫死的資料，現在從 CSV 動態載入
let GLOBAL_WEEKS = [];
let GLOBAL_MONTHS = [];
let activeView = 'weekly';

if (window.ChartAnnotation) {
  Chart.register(ChartAnnotation);
}

// 載入與解析 CSV
fetch('data.csv')
  .then(res => res.text())
  .then(text => {
    RAW = parseCSV(text);
    buildDiseaseButtons();
    setupViewSwitch();
    setDisease(currentDisease);
  })
  .catch(err => console.error("Error loading CSV:", err));

function parseCSV(text) {
  const data = {};
  const weekSet = new Set();
  const monthSet = new Set();
  const lines = text.trim().split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const [type, disease, key1, key2, countStr] = lines[i].split(',');
    const count = parseInt(countStr, 10);

    if (!data[disease]) {
      data[disease] = { total: 0, weekly_by_hospital: [], monthly: [], by_hospital: [], by_gender: [], by_age: [] };
    }

    if (type === 'Total') data[disease].total = count;
    else if (type === 'Weekly') {
      data[disease].weekly_by_hospital.push({ week: key1, "Hospital Name": key2, count: count });
      weekSet.add(key1);
    }
    else if (type === 'Monthly') {
      data[disease].monthly.push({ month: key1, count: count });
      monthSet.add(key1);
    }
    else if (type === 'Hospital') data[disease].by_hospital.push({ "Hospital Name": key1, count: count });
    else if (type === 'Gender') data[disease].by_gender.push({ Gender: key1, count: count });
    else if (type === 'Age') data[disease].by_age.push({ age_group: key1, count: count });
  }

  GLOBAL_WEEKS = [...weekSet].sort();
  GLOBAL_MONTHS = [...monthSet].sort();
  return data;
}

function getDiseaseTrend(disease) {
  const months = RAW[disease].monthly.slice().sort((a,b)=>a.month.localeCompare(b.month));
  if (months.length < 2) return 'flat';
  const last = months[months.length - 1].count;
  const prev = months[months.length - 2].count;
  if (last > prev) return 'up';
  if (last < prev) return 'down';
  return 'flat';
}

function buildDiseaseButtons() {
  const row = document.getElementById('diseaseRow');
  row.innerHTML = '';
  Object.keys(RAW).forEach(d => {
    const b = document.createElement('button');
    b.className = 'd-btn' + (d === currentDisease ? ' active' : '');
    b.dataset.disease = d;
    const trend = getDiseaseTrend(d);
    b.dataset.trend = trend;
    const icon = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '▬';
    b.innerHTML = `${d} <span class="trend-icon">${icon}</span>`;
    b.onclick = () => setDisease(d);
    row.appendChild(b);
  });
}

function setDisease(d) {
  currentDisease = d; selectedHospital = null;
  document.body.style.background = DISEASE_BG[d] || '#f5f4f0';
  document.querySelectorAll('.d-btn').forEach(b => {
    const active = b.dataset.disease === d;
    b.classList.toggle('active', active);
  });
  buildFilters(); renderAll();
}

function getHospitals() {
  const s = new Set();
  RAW[currentDisease].weekly_by_hospital.forEach(r => s.add(r['Hospital Name']));
  return [...s].sort();
}

function buildFilters() {
  const row = document.getElementById('filterRow');
  row.innerHTML = '<span class="pill-label">Hospital:</span>';
  const all = document.createElement('button');
  all.className = 'pill active'; all.textContent = 'All';
  all.onclick = () => { selectedHospital = null; updatePills(); renderAll(); };
  row.appendChild(all);
  getHospitals().forEach(h => {
    const p = document.createElement('button');
    p.className = 'pill'; p.textContent = h;
    p.style.borderLeft = '3px solid ' + (HOSP_COLORS[h] || '#888');
    p.onclick = () => { selectedHospital = (selectedHospital === h) ? null : h; updatePills(); renderAll(); };
    row.appendChild(p);
  });
}

function updatePills() {
  document.querySelectorAll('#filterRow .pill').forEach((p, i) => {
    if (i === 0) p.classList.toggle('active', !selectedHospital);
    else p.classList.toggle('active', p.textContent === selectedHospital);
  });
}

function renderStats() {
  const d = RAW[currentDisease];
  let total = d.total, peak = '', peakVal = 0;
  if (selectedHospital) {
    const rows = d.weekly_by_hospital.filter(r => r['Hospital Name'] === selectedHospital);
    total = rows.reduce((s, r) => s + r.count, 0);
    rows.forEach(r => { if (r.count > peakVal) { peakVal = r.count; peak = r.week; } });
  } else {
    const wm = {};
    d.weekly_by_hospital.forEach(r => { wm[r.week] = (wm[r.week] || 0) + r.count; });
    Object.entries(wm).forEach(([w, c]) => { if (c > peakVal) { peakVal = c; peak = w; } });
  }
  const g = d.by_gender, mRow = g.find(x => x.Gender === 'M');
  const mRatio = mRow ? Math.round(mRow.count / g.reduce((s, x) => s + x.count, 0) * 100) : 0;
  const topAge = [...d.by_age].sort((a, b) => b.count - a.count)[0];
  const months = d.monthly;
  const trend = months.length >= 2 ? (months[months.length-1].count > months[months.length-2].count ? 'Rising' : 'Falling') : 'N/A';
  const tColor = trend === 'Rising' ? '#E24B4A' : '#1D9E75';
  const accentColor = DISEASE_COLORS[currentDisease];
  document.getElementById('bannerSummary').innerHTML = `
    <div class="banner-card"><div class="card-label">Total Cases</div><div class="card-value">${total.toLocaleString()}</div><div class="card-sub">All Hospitals</div></div>
    <div class="banner-card"><div class="card-label">Peak Week</div><div class="card-value">${peak ? peak.slice(5).replace('-', ' - ') : '—'}</div><div class="card-sub">${peakVal} cases</div></div>
    <div class="banner-card"><div class="card-label">Top Age Group</div><div class="card-value">${topAge ? topAge.age_group : '—'}</div><div class="card-sub">${topAge ? topAge.count + ' cases' : ''}</div></div>`;
}

function dc(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function renderWeekly() {
  dc('weekly');
  let rows = RAW[currentDisease].weekly_by_hospital;
  if (selectedHospital) rows = rows.filter(r => r['Hospital Name'] === selectedHospital);
  const weeks = GLOBAL_WEEKS;
  const totalsByWeek = {};
  rows.forEach(r => { totalsByWeek[r.week] = (totalsByWeek[r.week] || 0) + r.count; });
  const data = weeks.map(w => totalsByWeek[w] || 0);
  const peakWeek = weeks.reduce((best, w, idx) => {
    return data[idx] > (totalsByWeek[best] || 0) ? w : best;
  }, weeks[0]);
  const peakIndex = weeks.indexOf(peakWeek);

  const accent = '#4a4a4a';
  document.getElementById('legendWeekly').innerHTML = '';
  charts['weekly'] = new Chart(document.getElementById('chartWeekly'), {
    type:'bar', data:{ labels:weeks.map(w=>w.slice(5)), datasets:[{ label:'Total cases', data, backgroundColor:accent, borderRadius:14, borderSkipped:false }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, annotation:{annotations:{peakArea:{type:'box', xMin:peakIndex - 0.5, xMax:peakIndex + 0.5, yMin:0, yMax:data[peakIndex] || 1,
          backgroundColor:'rgba(245,220,218,0.4)', borderWidth:0, drawTime:'beforeDatasetsDraw',
          label:{content:['Peak Week'], enabled:true, position:'center', yAdjust:-20, backgroundColor:'transparent', color:'#4d3232', font:{family:'monospace', size:11}}}}}},
      scales:{ x:{ticks:{font:{size:10},autoSkip:true,maxTicksLimit:12}}, y:{beginAtZero:true,ticks:{font:{size:10},precision:0,callback:value=>Number.isInteger(value) ? value : ''}} }
    }
  });
}

function renderHospital() {
  dc('hosp');
  let rows = RAW[currentDisease].weekly_by_hospital;
  if (selectedHospital) rows = rows.filter(r => r['Hospital Name'] === selectedHospital);
  const weeks = GLOBAL_WEEKS;
  const hospitals = [...new Set(rows.map(r => r['Hospital Name']))].sort();
  if (!rows.length) { document.getElementById('chartHosp').parentElement.innerHTML = '<div class="zero-msg">No data</div>'; return; }
  const datasets = hospitals.map(h => {
    const values = weeks.map(w => { const r = rows.find(x => x.week === w && x['Hospital Name'] === h); return r ? r.count : 0; });
    return { label:h, data:values, borderColor:HOSP_COLORS[h]||'#888', backgroundColor:(HOSP_COLORS[h]||'#888')+'22', tension:0.3, fill:false, pointRadius:2, borderWidth:2 };
  });
  document.getElementById('legendWeekly').innerHTML = hospitals.map(h =>
    `<span class="legend-item"><span class="legend-dot" style="background:${HOSP_COLORS[h]||'#888'}"></span>${h}</span>`).join('');
  charts['hosp'] = new Chart(document.getElementById('chartHosp'), {
    type:'line',
    data:{ labels:weeks.map(w=>w.slice(5)), datasets },
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:false}},
      scales:{ x:{ticks:{font:{size:10},autoSkip:true,maxTicksLimit:12}}, y:{beginAtZero:true,ticks:{font:{size:10},precision:0,callback:value=>Number.isInteger(value) ? value : ''}} }
    }
  });
}

function renderAge() {
  dc('age');
  const ages = RAW[currentDisease].by_age;
  const color = DISEASE_COLORS[currentDisease];
  charts['age'] = new Chart(document.getElementById('chartAge'), {
    type:'bar',
    data:{ labels:ages.map(a=>a.age_group), datasets:[{ data:ages.map(a=>a.count), backgroundColor:color+'99', borderColor:color, borderWidth:1, borderRadius:3 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}}, scales:{ x:{ticks:{font:{size:11}}}, y:{beginAtZero:true,ticks:{font:{size:10},precision:0,callback:value=>Number.isInteger(value) ? value : ''}}} }
  });
}

function renderMonthly() {
  dc('monthly');
  const months = GLOBAL_MONTHS;
  const monthCounts = RAW[currentDisease].monthly.reduce((map, item) => { map[item.month] = item.count; return map; }, {});
  const color = DISEASE_COLORS[currentDisease];
  charts['monthly'] = new Chart(document.getElementById('chartMonthly'), {
    type:'bar',
    data:{ labels:months.map(m=>m), datasets:[{ data:months.map(m=>monthCounts[m] || 0), backgroundColor:color+'99', borderColor:color, borderWidth:1, borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>' '+ctx.parsed.y+' cases'}}},
      scales:{ x:{ticks:{font:{size:12},autoSkip:true,maxTicksLimit:12}}, y:{beginAtZero:true,ticks:{font:{size:10},precision:0,callback:value=>Number.isInteger(value) ? value : ''}} } }
  });
}

function renderAll() {
  renderStats();
  renderWeekly();
  renderHospital();
  renderAge();
  renderMonthly();
}

function setupViewSwitch() {
  const buttons = document.querySelectorAll('.view-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      activeView = btn.dataset.mode;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('weeklyChartBox').classList.toggle('hidden', activeView !== 'weekly');
      document.getElementById('monthlyChartBox').classList.toggle('hidden', activeView !== 'monthly');
    };
  });
}
