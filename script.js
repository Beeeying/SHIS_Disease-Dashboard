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
let RAW = {}; // 原本寫死的資料，現在從 JSON 動態載入
let GLOBAL_WEEKS = [];
let GLOBAL_MONTHS = [];
let activeView = 'weekly';
let REGION_BY_HOSPITAL = {};
let GEOJSON_FEATURES = [];
let weeklyWindowStart = 0;

function getCategoryBoundaries(scale, chartArea, pointCount) {
  if (!scale || !chartArea || !pointCount) return [];

  const centers = Array.from({ length: pointCount }, (_, index) => scale.getPixelForValue(index));
  if (!centers.length) return [];

  const boundaries = [chartArea.left];
  for (let index = 1; index < centers.length; index++) {
    boundaries.push((centers[index - 1] + centers[index]) / 2);
  }
  boundaries.push(chartArea.right);

  return boundaries;
}

const weeklyPeakHighlightPlugin = {
  id: 'weeklyPeakHighlight',
  beforeDatasetsDraw(chart, args, pluginOptions) {
    const settings = chart.options?.plugins?.weeklyPeakHighlight || {};
    const peakIndex = settings.peakIndex;
    if (peakIndex === undefined || peakIndex === null) return;

    const { ctx, chartArea, scales } = chart;
    if (!ctx || !chartArea || !scales?.x || !scales?.y) return;

    const xScale = scales.x;
  const boundaries = getCategoryBoundaries(xScale, chartArea, chart.data.labels.length);
  const left = boundaries[peakIndex] ?? xScale.left;
  const right = boundaries[peakIndex + 1] ?? xScale.right;
    if (right <= left) return;

    ctx.save();
    ctx.fillStyle = '#F5DCDA';
    ctx.globalAlpha = 0.95;
    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    ctx.restore();
  },
  afterDatasetsDraw(chart, args, pluginOptions) {
    const settings = chart.options?.plugins?.weeklyPeakHighlight || {};
    const peakIndex = settings.peakIndex;
    if (peakIndex === undefined || peakIndex === null) return;

    const { ctx, chartArea, scales } = chart;
    if (!ctx || !chartArea || !scales?.x || !scales?.y) return;

    const xScale = scales.x;
  const boundaries = getCategoryBoundaries(xScale, chartArea, chart.data.labels.length);
  const left = boundaries[peakIndex] ?? xScale.left;
  const right = boundaries[peakIndex + 1] ?? xScale.right;
    if (right <= left) return;

    const label = settings.label || 'Peak Week';
    if (!label) return;

    const centerX = left + (right - left) / 2;
  const textY = Math.max(14, chartArea.top - 14);

    ctx.save();
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText(label, centerX, textY);
    ctx.restore();
  }
};

const barValueLabelsPlugin = {
  id: 'barValueLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    if (!ctx) return;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;

    ctx.save();
    ctx.font = '10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111';

    meta.data.forEach((bar, index) => {
      if (!bar || typeof bar.x !== 'number' || typeof bar.y !== 'number') return;
      const value = chart.data.datasets[0].data[index];
      if (value === undefined || value === null || value <= 0) return;

      const barHeight = Math.abs(bar.base - bar.y);
      const drawInside = barHeight >= 26;
      const labelY = drawInside ? bar.y + barHeight / 2 : Math.max(chart.chartArea.top + 8, bar.y - 10);
      ctx.fillStyle = drawInside ? '#FFFFFF' : '#111111';
      ctx.fillText(value.toLocaleString(), bar.x, labelY);
    });

    ctx.restore();
  }
};

const weeklyIntervalGridPlugin = {
  id: 'weeklyIntervalGrid',
  beforeDatasetsDraw(chart) {
    const settings = chart.options?.plugins?.weeklyIntervalGrid || {};
    const { ctx, chartArea, scales } = chart;
    if (!settings.enabled || !ctx || !chartArea || !scales?.x) return;

    const boundaries = getCategoryBoundaries(scales.x, chartArea, chart.data.labels.length);
    if (!boundaries.length) return;

    ctx.save();
    ctx.strokeStyle = settings.lineColor || 'rgba(0,0,0,0.12)';
    ctx.lineWidth = settings.lineWidth || 1;

    boundaries.forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
    });

    ctx.restore();
  },
  afterDraw(chart) {
    const settings = chart.options?.plugins?.weeklyIntervalGrid || {};
    const { ctx, chartArea, scales } = chart;
    if (!settings.enabled || !ctx || !chartArea || !scales?.x) return;

    const boundaries = getCategoryBoundaries(scales.x, chartArea, chart.data.labels.length);
    const labels = settings.labels || [];
    if (!boundaries.length || !labels.length) return;

    ctx.save();
    ctx.font = settings.font || '10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = settings.color || '#444444';

    labels.forEach((label, index) => {
      const x = boundaries[index];
      if (x === undefined) return;
      ctx.fillText(label, x, chartArea.bottom + 10);
    });

    ctx.restore();
  }
};

const weeklyPeakHighlightPlugin = {
  id: 'weeklyPeakHighlight',
  beforeDatasetsDraw(chart, args, pluginOptions) {
    const settings = chart.options?.plugins?.weeklyPeakHighlight || {};
    const peakIndex = settings.peakIndex;
    if (peakIndex === undefined || peakIndex === null) return;

    const { ctx, chartArea, scales } = chart;
    if (!ctx || !chartArea || !scales?.x || !scales?.y) return;

    const xScale = scales.x;
    const step = Math.max(12, (xScale.right - xScale.left) / Math.max(1, chart.data.labels.length));
    const left = Math.max(xScale.left, xScale.getPixelForValue(peakIndex) - step / 2);
    const right = Math.min(xScale.right, xScale.getPixelForValue(peakIndex) + step / 2);
    if (right <= left) return;

    ctx.save();
    ctx.fillStyle = '#F5DCDA';
    ctx.globalAlpha = 0.95;
    ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    ctx.restore();

    const label = settings.label || 'Peak Week';
    if (label) {
      ctx.save();
      ctx.font = '12px monospace';
      ctx.fillStyle = '#4d3232';
      const textWidth = ctx.measureText(label).width;
      const textX = left + (right - left) / 2 - textWidth / 2;
      const textY = chartArea.top - 8;
      ctx.fillText(label, textX, textY);
      ctx.restore();
    }
  }
};

if (window.ChartAnnotation) {
  Chart.register(ChartAnnotation);
}


function adaptDashboardJson(json) {
  const diseases = json && json.diseases ? json.diseases : {};
  const adapted = {};

  Object.entries(diseases).forEach(([disease, entry]) => {
    adapted[disease] = {
      total: Number(entry.total || 0),
      weekly_by_hospital: (entry.weekly_by_hospital || []).map(r => ({
        week: r.week,
        "Hospital Name": r.hospital,
        count: Number(r.count ?? r.cases ?? 0)
      })),
      monthly_by_hospital: (entry.monthly_by_hospital || []).map(r => ({
        month: r.month,
        "Hospital Name": r.hospital,
        count: Number(r.count ?? r.cases ?? 0)
      })),
      monthly: (entry.monthly || []).map(r => ({
        month: r.month,
        count: Number(r.count ?? r.cases ?? 0)
      })),
      by_hospital: (entry.by_hospital || []).map(r => ({
        "Hospital Name": r.hospital,
        count: Number(r.count ?? r.cases ?? 0)
      })),
      by_gender: (entry.by_gender || []).map(r => ({
        Gender: r.gender,
        count: Number(r.count ?? r.cases ?? 0)
      })),
      by_age: (entry.by_age || []).map(r => ({
        age_group: r.age_group || r.age || '',
        count: Number(r.count ?? r.cases ?? 0)
      }))
    };
  });

  return adapted;
}

function rebuildGlobalPeriodsFromRaw(rawData) {
  const weeks = new Set();
  const months = new Set();

  Object.values(rawData || {}).forEach(d => {
    (d.weekly_by_hospital || []).forEach(r => {
      if (r.week) weeks.add(r.week);
    });
    (d.monthly || []).forEach(r => {
      if (r.month) months.add(r.month);
    });
  });

  GLOBAL_WEEKS = [...weeks].sort();
  GLOBAL_MONTHS = [...months].sort();
}

// 載入與解析 JSON 與 GeoJSON
Promise.all([
  fetch('data/dashboard_data.json').then(res => {
    if (!res.ok) {
      throw new Error(`Failed to load dashboard data: ${res.status}`);
    }
    return res.json();
  }),
  fetch('regions.geojson').then(res => {
    if (!res.ok) {
      throw new Error(`Failed to load regions geojson: ${res.status}`);
    }
    return res.json();
  })
])
  .then(([dashboardJson, geojson]) => {
    RAW = adaptDashboardJson(dashboardJson);
    rebuildGlobalPeriodsFromRaw(RAW);

    // Optional future support if hospital-region mapping is added to dashboard_data.json
    REGION_BY_HOSPITAL =
      dashboardJson.hospital_regions ||
      (dashboardJson.metadata && dashboardJson.metadata.hospital_regions) ||
      REGION_BY_HOSPITAL ||
      {};

    GEOJSON_FEATURES = geojson.features || [];

    if (!RAW[currentDisease]) {
      currentDisease = Object.keys(RAW)[0] || currentDisease;
    }

    buildDiseaseButtons();
    setupViewSwitch();
    setDisease(currentDisease);
  })
  .catch(err => console.error("Error loading dashboard data:", err));

function parseCSV(text) {
  const data = {};
  const weekSet = new Set();
  const monthSet = new Set();
  const lines = text.trim().split('\n');
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const [type, disease, key1, key2, countStr] = lines[i].split(',');
    const count = parseInt(countStr, 10);

    if (type === 'HospitalRegion') {
      REGION_BY_HOSPITAL[key1] = key2;
      continue;
    }

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

function getLatestWeek() {
  return GLOBAL_WEEKS[GLOBAL_WEEKS.length - 1] || '';
}

function getRegionalCaseMap(week) {
  const d = RAW[currentDisease];
  const rows = d.weekly_by_hospital.filter(r => r.week === week);
  const cases = {};
  rows.forEach(r => {
    const region = REGION_BY_HOSPITAL[r['Hospital Name']];
    if (!region) return;
    cases[region] = (cases[region] || 0) + r.count;
  });
  return cases;
}

function buildFilters() {
  const row = document.getElementById('filterRow');
  row.innerHTML = '<span class="pill-label">Hospital:</span>';
  const all = document.createElement('button');
  all.className = 'pill active'; all.textContent = 'All';
  all.onclick = () => { selectedHospital = null; updatePills(); renderHospital(); };
  row.appendChild(all);
  getHospitals().forEach(h => {
    const p = document.createElement('button');
    p.className = 'pill'; p.textContent = h;
    p.style.borderLeft = '3px solid ' + (HOSP_COLORS[h] || '#888');
    p.onclick = () => { selectedHospital = (selectedHospital === h) ? null : h; updatePills(); renderHospital(); };
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
  const wm = {};
  d.weekly_by_hospital.forEach(r => { wm[r.week] = (wm[r.week] || 0) + r.count; });
  Object.entries(wm).forEach(([w, c]) => { if (c > peakVal) { peakVal = c; peak = w; } });
  const g = d.by_gender, mRow = g.find(x => x.Gender === 'M');
  const mRatio = mRow ? Math.round(mRow.count / g.reduce((s, x) => s + x.count, 0) * 100) : 0;
  const topAge = [...d.by_age].sort((a, b) => b.count - a.count)[0];
  const months = d.monthly;
  const trend = months.length >= 2 ? (months[months.length-1].count > months[months.length-2].count ? 'Rising' : 'Falling') : 'N/A';
  const tColor = trend === 'Rising' ? '#E24B4A' : '#1D9E75';
  const accentColor = DISEASE_COLORS[currentDisease];
  const peakPeriod = peak ? peak.slice(5).replace('-', ' - ') : '—';
  const topAgeGroup = topAge ? topAge.age_group : '—';
  const topAgeCount = topAge ? topAge.count : 0;
  document.getElementById('bannerSummary').innerHTML = `
    <div class="banner-card"><div class="card-label">Total Cases</div><div class="card-value">${total.toLocaleString()}</div><div class="card-sub">All Hospitals</div></div>
    <div class="banner-card"><div class="card-label">Peak Week</div><div class="card-value">${peakVal.toLocaleString()}</div><div class="card-sub">${peakPeriod ? 'Week ' + peakPeriod : '—'}</div></div>
    <div class="banner-card"><div class="card-label">Top Age Group</div><div class="card-value">${topAgeGroup}<span class="age-suffix">Y</span></div><div class="card-sub">${topAgeCount ? topAgeCount.toLocaleString() + ' cases' : '—'}</div></div>`;
}

function dc(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function renderWeekly() {
  dc('weekly');
<<<<<<< HEAD
  const chartCanvas = document.getElementById('chartWeekly');
  const chartBox = document.getElementById('weeklyChartBox');
  let rows = RAW[currentDisease].weekly_by_hospital;
  if (selectedHospital) rows = rows.filter(r => r['Hospital Name'] === selectedHospital);
=======
  const rows = RAW[currentDisease].weekly_by_hospital;
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
  const weeks = GLOBAL_WEEKS;
  const totalsByWeek = {};
  rows.forEach(r => { totalsByWeek[r.week] = (totalsByWeek[r.week] || 0) + r.count; });
  const data = weeks.map(w => totalsByWeek[w] || 0);
  // guard for empty dataset
  if (!weeks || !weeks.length) {
<<<<<<< HEAD
    chartCanvas.getContext && chartCanvas.parentElement && (chartCanvas.parentElement.innerHTML = '<div class="zero-msg">No data</div>');
    return;
  }

  const totalWeeks = weeks.length;
  const maxStart = Math.max(0, totalWeeks - 5);
  weeklyWindowStart = Math.max(0, Math.min(weeklyWindowStart, maxStart));
  const start = weeklyWindowStart;
  const end = Math.min(totalWeeks, start + 5);
  const visibleWeeks = weeks.slice(start, end);
  const visibleData = data.slice(start, end);

  const existingSlider = document.getElementById('weeklySliderWrap');
  if (existingSlider) existingSlider.remove();
  if (totalWeeks > 5) {
    const sliderWrap = document.createElement('div');
    sliderWrap.id = 'weeklySliderWrap';
    sliderWrap.style.display = 'flex';
    sliderWrap.style.alignItems = 'center';
    sliderWrap.style.gap = '10px';
    sliderWrap.style.margin = '8px 0 0';
    sliderWrap.style.padding = '0 4px';
    sliderWrap.innerHTML = `
      <span style="font-size:11px;color:#666;white-space:nowrap;">Data Zoom</span>
      <input id="weeklyRange" type="range" min="0" max="${maxStart}" value="${start}" step="1" style="flex:1;accent-color:#4a4a4a;">
      <span style="font-size:11px;color:#666;white-space:nowrap;">${start + 1}-${end} / ${totalWeeks}</span>
    `;
    const rangeInput = sliderWrap.querySelector('#weeklyRange');
    rangeInput.oninput = () => {
      weeklyWindowStart = Number(rangeInput.value);
      renderWeekly();
    };
    chartBox.appendChild(sliderWrap);
  }

  // find peak index dynamically (sum across hospitals or filtered selection)
  let peakIndex = 0;
  let peakVal = -Infinity;
  for (let i = 0; i < visibleData.length; i++) {
    if ((visibleData[i] || 0) > peakVal) { peakVal = visibleData[i] || 0; peakIndex = i; }
=======
    document.getElementById('chartWeekly').getContext && document.getElementById('chartWeekly').parentElement && (document.getElementById('chartWeekly').parentElement.innerHTML = '<div class="zero-msg">No data</div>');
    return;
  }

  // find peak index dynamically (sum across hospitals or filtered selection)
  let peakIndex = 0;
  let peakVal = -Infinity;
  for (let i = 0; i < data.length; i++) {
    if ((data[i] || 0) > peakVal) { peakVal = data[i] || 0; peakIndex = i; }
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
  }

  const accent = '#4a4a4a';
  document.getElementById('legendWeekly').innerHTML = '';

<<<<<<< HEAD
  const formatWeeklyTick = (rawDate, index) => {
    if (!rawDate) return '';
    const [year, month, day] = rawDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const shortMonth = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const labelDay = String(day).padStart(2, '0');
    const prev = index > 0 ? visibleWeeks[index - 1] : null;
    const prevDate = prev ? prev.split('-').map(Number) : null;
    const isFirst = index === 0;
    const monthChanged = !prevDate || prevDate[1] !== month || prevDate[0] !== year;
    return isFirst || monthChanged ? `${shortMonth} ${labelDay}` : labelDay;
  };

  const boundaryLabels = visibleWeeks.map((week, index) => formatWeeklyTick(week, index));

  charts['weekly'] = new Chart(chartCanvas, {
    type: 'bar',
    data: {
      labels: visibleWeeks,
      datasets: [{
        label: 'Total cases',
        data: visibleData,
        backgroundColor: accent,
        borderRadius: 14,
        borderSkipped: false,
        barPercentage: 0.92,
        categoryPercentage: 0.96,
        maxBarThickness: 110
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 38, right: 28, bottom: 30, left: 28 }
      },
=======
  // use the Morandi red with requested opacity via helper
  const highlightColor = hexToRgba('#F5DCDA', 0.4);

  charts['weekly'] = new Chart(document.getElementById('chartWeekly'), {
    type: 'bar',
    data: { labels: weeks.map(w => w.slice(5)), datasets: [{ label: 'Total cases', data, backgroundColor: accent, borderRadius: 14, borderSkipped: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
      plugins: {
        legend: { display: false },
        weeklyPeakHighlight: {
          peakIndex,
          label: 'Peak Week'
<<<<<<< HEAD
        },
        weeklyIntervalGrid: {
          enabled: true,
          labels: boundaryLabels
=======
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
        }
      },
      scales: {
        x: {
<<<<<<< HEAD
          type: 'category',
          offset: true,
          ticks: {
            display: false,
            font: { size: 10 },
            align: 'center',
            autoSkip: false,
            maxTicksLimit: visibleWeeks.length,
            padding: 4,
            callback: (value, index) => formatWeeklyTick(visibleWeeks[index], index)
          },
          grid: {
            display: false,
            drawBorder: false,
            drawOnChartArea: false,
            tickLength: 0,
            drawTicks: false
          }
        },
        y: {
          beginAtZero: true,
          grace: '15%',
          ticks: {
            font: { size: 10 },
            precision: 0,
            callback: value => Number.isInteger(value) ? value : ''
          }
        }
      }
    },
    plugins: [weeklyIntervalGridPlugin, weeklyPeakHighlightPlugin, barValueLabelsPlugin]
=======
          grid: { display: false },
          ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 12 },
          offset: true
        },
        y: { beginAtZero: true, grace: '5%', ticks: { font: { size: 10 }, precision: 0, callback: value => Number.isInteger(value) ? value : '' } }
      }
    },
    plugins: [weeklyPeakHighlightPlugin]
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
  });
}

function renderHospital() {
  dc('hosp');
<<<<<<< HEAD
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
  // compute totals per week to detect peak
  const totalsByWeek = {};
  rows.forEach(r => { totalsByWeek[r.week] = (totalsByWeek[r.week] || 0) + r.count; });
  const totalData = weeks.map(w => totalsByWeek[w] || 0);

  // find peak index and overall max for y-range
  let peakIndex = 0, peakVal = -Infinity;
  for (let i = 0; i < totalData.length; i++) {
    if ((totalData[i] || 0) > peakVal) { peakVal = totalData[i] || 0; peakIndex = i; }
  }

  const highlightColor = hexToRgba('#F5DCDA', 0.4);

  charts['hosp'] = new Chart(document.getElementById('chartHosp'), {
    type: 'line',
    data: { labels: weeks.map(w => w.slice(5)), datasets },
=======
  const isMonthly = activeView === 'monthly';
  const color = DISEASE_COLORS[currentDisease] || '#378ADD';
  const chartHost = document.getElementById('chartHosp')?.parentElement;
  if (!chartHost) return;
  const ensureCanvas = () => {
    if (!document.getElementById('chartHosp')) {
      chartHost.innerHTML = '<canvas id="chartHosp"></canvas>';
    }
  };
  ensureCanvas();

  let labels = [];
  let datasets = [];
  let totals = [];

  if (isMonthly) {
    const months = [...GLOBAL_MONTHS];
    let rows = RAW[currentDisease].monthly_by_hospital || [];
    if (selectedHospital) rows = rows.filter(r => r['Hospital Name'] === selectedHospital);
    const hospitals = [...new Set(rows.map(r => r['Hospital Name']))].sort();
    if (!rows.length) {
      chartHost.innerHTML = '<canvas id="chartHosp"></canvas><div class="zero-msg">No data</div>';
      document.getElementById('legendWeekly').innerHTML = '';
      return;
    }
    labels = months;
    datasets = hospitals.map(h => {
      const values = months.map(m => {
        const r = rows.find(x => x.month === m && x['Hospital Name'] === h);
        return r ? r.count : 0;
      });
      return {
        label: h,
        data: values,
        borderColor: HOSP_COLORS[h] || '#888',
        backgroundColor: hexToRgba(HOSP_COLORS[h] || '#888', 0.14),
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        borderWidth: 2
      };
    });
    document.getElementById('legendWeekly').innerHTML = hospitals.map(h =>
      `<span class="legend-item"><span class="legend-dot" style="background:${HOSP_COLORS[h]||'#888'}"></span>${h}</span>`).join('');
    totals = months.map((m, index) => datasets.reduce((sum, ds) => sum + (ds.data[index] || 0), 0));
  } else {
    let rows = RAW[currentDisease].weekly_by_hospital;
    if (selectedHospital) rows = rows.filter(r => r['Hospital Name'] === selectedHospital);
    const weeks = GLOBAL_WEEKS;
    const hospitals = [...new Set(rows.map(r => r['Hospital Name']))].sort();
    if (!rows.length) {
      chartHost.innerHTML = '<canvas id="chartHosp"></canvas><div class="zero-msg">No data</div>';
      document.getElementById('legendWeekly').innerHTML = '';
      return;
    }
    labels = weeks.map(w => w.slice(5));
    datasets = hospitals.map(h => {
      const values = weeks.map(w => { const r = rows.find(x => x.week === w && x['Hospital Name'] === h); return r ? r.count : 0; });
      return {
        label: h,
        data: values,
        borderColor: HOSP_COLORS[h] || '#888',
        backgroundColor: hexToRgba(HOSP_COLORS[h] || '#888', 0.14),
        tension: 0.3,
        fill: false,
        pointRadius: 2,
        borderWidth: 2
      };
    });
    document.getElementById('legendWeekly').innerHTML = hospitals.map(h =>
      `<span class="legend-item"><span class="legend-dot" style="background:${HOSP_COLORS[h]||'#888'}"></span>${h}</span>`).join('');
    totals = weeks.map((w, index) => datasets.reduce((sum, ds) => sum + (ds.data[index] || 0), 0));
  }

  if (!labels.length || totals.every(v => v === 0)) {
    chartHost.innerHTML = '<canvas id="chartHosp"></canvas><div class="zero-msg">No data</div>';
    return;
  }

  const peakIndex = totals.reduce((best, value, index) => value > totals[best] ? index : best, 0);
  const highlightColor = hexToRgba('#F5DCDA', 0.4);
  const maxTotal = Math.max(...totals, 1);

  charts['hosp'] = new Chart(document.getElementById('chartHosp'), {
    type: 'line',
    data: { labels, datasets },
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            peakArea: {
              type: 'box',
              xMin: peakIndex - 0.5,
              xMax: peakIndex + 0.5,
              yMin: 0,
<<<<<<< HEAD
              yMax: Math.max(...totalData, 1),
=======
              yMax: maxTotal,
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
              backgroundColor: highlightColor,
              borderWidth: 0,
              drawTime: 'beforeDatasetsDraw',
              label: {
<<<<<<< HEAD
                content: ['Peak Week'],
                enabled: true,
                position: 'center',
                // nudge the label above the highlight block so it sits visually outside the box
=======
                content: [isMonthly ? 'Peak Month' : 'Peak Week'],
                enabled: true,
                position: 'center',
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
                yAdjust: -24,
                backgroundColor: 'transparent',
                color: '#4d3232',
                font: { family: 'monospace', size: 12 },
                padding: 2
              }
            }
          }
        }
      },
<<<<<<< HEAD
      scales: { x: { ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 12 }, offset: true }, y: { beginAtZero: true, grace: '5%', ticks: { font: { size: 10 }, precision: 0, callback: value => Number.isInteger(value) ? value : '' } } }
=======
      scales: {
        x: { ticks: { font: { size: 10 }, autoSkip: true, maxTicksLimit: 12 }, offset: true },
        y: { beginAtZero: true, grace: '5%', ticks: { font: { size: 10 }, precision: 0, callback: value => Number.isInteger(value) ? value : '' } }
      }
>>>>>>> be0d2b87589eb7d4f98a5aa5751d17725d4e1b7c
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
      plugins:{legend:{display:false}}, scales:{ x:{ticks:{font:{size:11}}, offset:true}, y:{beginAtZero:true,grace:'5%',ticks:{font:{size:10},precision:0,callback:value=>Number.isInteger(value) ? value : ''}}} }
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
      scales:{ x:{ticks:{font:{size:12},autoSkip:true,maxTicksLimit:12}, offset:true}, y:{beginAtZero:true,grace:'5%',ticks:{font:{size:10},precision:0,callback:value=>Number.isInteger(value) ? value : ''}} } }
  });
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function renderRegionalMap() {
  const container = document.getElementById('regionMap');
  const legend = document.getElementById('regionMapLegend');
  if (!container || !legend) return;

  if (!GEOJSON_FEATURES.length) {
    container.innerHTML = '<div class="zero-msg">No regional data available</div>';
    legend.innerHTML = '';
    return;
  }

  const week = getLatestWeek();
  const caseMap = getRegionalCaseMap(week);
  const regions = GEOJSON_FEATURES
    .map(feature => feature.properties?.NAM_1)
    .filter(Boolean)
    .filter((name, index, arr) => arr.indexOf(name) === index);
  const maxCases = Math.max(...regions.map(region => caseMap[region] || 0), 1);
  const color = DISEASE_COLORS[currentDisease] || '#378ADD';

  legend.innerHTML = [
    '<span class="legend-item"><span class="legend-swatch" style="background: #f7f7f7"></span>Low</span>',
    '<span class="legend-item"><span class="legend-swatch" style="background:' + hexToRgba(color, 0.45) + '"></span>Medium</span>',
    '<span class="legend-item"><span class="legend-swatch" style="background:' + hexToRgba(color, 0.85) + '"></span>High</span>'
  ].join('');

  const margin = 24;
  const width = 760;
  const height = 500;
  const allCoords = [];
  GEOJSON_FEATURES.forEach(feature => {
    const geometry = feature.geometry;
    const walk = (coords) => {
      if (!coords || !coords.length) return;
      if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
        allCoords.push(coords);
      } else {
        coords.forEach(walk);
      }
    };
    if (geometry?.type === 'Polygon') walk(geometry.coordinates);
    if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach(polygon => walk(polygon));
  });

  const lons = allCoords.flat().map(([lon]) => lon);
  const lats = allCoords.flat().map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const projectPoint = ([lon, lat]) => ({
    x: margin + ((lon - minLon) / (maxLon - minLon || 1)) * (width - margin * 2),
    y: height - margin - ((lat - minLat) / (maxLat - minLat || 1)) * (height - margin * 2)
  });

  const toPath = (rings) => rings.map(ring => {
    const points = ring.map(point => {
      const projected = projectPoint(point);
      return `${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
    }).join(' ');
    return `M ${points} Z`;
  }).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', 'transparent');
  svg.appendChild(background);

  GEOJSON_FEATURES.forEach(feature => {
    const regionName = feature.properties?.NAM_1;
    const geometry = feature.geometry;
    const count = caseMap[regionName] || 0;
    const alpha = 0.15 + (count / maxCases) * 0.7;
    const fill = hexToRgba(color, alpha);

    const createPath = (coords) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', toPath(coords));
      path.setAttribute('fill', fill);
      path.setAttribute('stroke', '#ffffff');
      path.setAttribute('stroke-width', '1.2');
      svg.appendChild(path);
    };

    if (geometry?.type === 'Polygon') createPath(geometry.coordinates);
    if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach(createPath);

    if (regionName) {
      const centroid = geometry?.type === 'MultiPolygon' ? geometry.coordinates[0][0][0] : geometry?.coordinates?.[0]?.[0];
      if (centroid) {
        const point = projectPoint(centroid);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(point.x));
        text.setAttribute('y', String(point.y));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'map-region-label');
        text.textContent = `${regionName} · ${count}`;
        svg.appendChild(text);
      }
    }
  });

  container.innerHTML = '';
  container.appendChild(svg);

  const caption = document.createElement('div');
  caption.className = 'card-sub';
  caption.textContent = `Latest week: ${week || '—'} · ${currentDisease}`;
  container.appendChild(caption);
}

function renderAll() {
  renderStats();
  renderWeekly();
  renderHospital();
  renderAge();
  renderMonthly();
  renderRegionalMap();
}

function setupViewSwitch() {
  const buttons = document.querySelectorAll('.view-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      activeView = btn.dataset.mode;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      const weeklyOnlyIds = ['weeklyChartBox'];
      const alwaysVisibleIds = ['hospitalTrendBox', 'ageChartBox', 'regionChartBox'];
      weeklyOnlyIds.forEach(id => document.getElementById(id)?.classList.toggle('hidden', activeView !== 'weekly'));
      alwaysVisibleIds.forEach(id => document.getElementById(id)?.classList.toggle('hidden', false));
      document.getElementById('monthlyChartBox')?.classList.toggle('hidden', activeView !== 'monthly');
      renderAll();
    };
  });
}
