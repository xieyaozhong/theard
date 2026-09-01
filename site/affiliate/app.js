const $ = (s, p = document) => p.querySelector(s);

const state = { rows: [] };
const dropZone = $('#dropZone');
const csvFile = $('#csvFile');
const status = $('#status');
const rankingBody = $('#rankingBody');

function number(value) {
  const text = String(value ?? '').trim().replaceAll(',', '').replace('NT$', '').replace('$', '');
  if (!text) return 0;
  const percent = text.endsWith('%');
  const parsed = Number.parseFloat(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(parsed)) return 0;
  return percent ? parsed / 100 : parsed;
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const split = line => {
    const out = []; let cell = ''; let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) { cell += '"'; i += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === ',' && !quoted) { out.push(cell); cell = ''; continue; }
      cell += char;
    }
    out.push(cell); return out;
  };
  const headers = split(lines[0]).map(v => v.trim());
  return lines.slice(1).map(line => {
    const cells = split(line); const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] ?? ''; });
    return row;
  });
}

function get(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return row[name];
  }
  return '';
}

function scoreRow(row) {
  const clicks = Math.max(0, Math.trunc(number(get(row, ['clicks', '點擊', '點擊數']))));
  const orders = Math.max(0, Math.trunc(number(get(row, ['orders', '訂單', '訂單數', '有效訂單']))));
  const commission = Math.max(0, number(get(row, ['commission', '分潤', '分潤金', '商品分潤'])));
  const revenue = Math.max(0, number(get(row, ['revenue', 'gmv', '成交金額', '購買金額'])));
  const ctr = Math.max(0, number(get(row, ['ctr', 'CTR', '點擊率'])));
  const commissionRate = Math.max(0, number(get(row, ['commission_rate', '分潤率', '佣金率'])));
  const cvr = clicks ? orders / clicks : 0;
  const epc = clicks ? commission / clicks : 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const cvrPoints = clamp(cvr / 0.08, 0, 1) * 40;
  const epcPoints = clamp(epc / 5, 0, 1) * 35;
  const ratePoints = clamp(commissionRate / 0.2, 0, 1) * 15;
  const confidence = clamp(clicks / 100, 0.25, 1);
  const score = (cvrPoints + epcPoints + ratePoints) * confidence + 10;
  return {
    productId: String(get(row, ['product_id', '商品ID', '商品編號', '商品代碼']) || get(row, ['sub_id', 'Sub ID', 'subid']) || 'UNKNOWN'),
    subId: String(get(row, ['sub_id', 'Sub ID', 'subid']) || ''),
    clicks, orders, revenue, commission, ctr, commissionRate, cvr, epc,
    score: Math.round(score * 100) / 100,
  };
}

function money(value) { return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0); }
function pct(value) { return `${((value || 0) * 100).toFixed(1)}%`; }

function render() {
  const rows = [...state.rows].sort((a, b) => b.score - a.score);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const orders = rows.reduce((sum, row) => sum + row.orders, 0);
  const commission = rows.reduce((sum, row) => sum + row.commission, 0);
  $('#metricClicks').textContent = clicks.toLocaleString('zh-TW');
  $('#metricOrders').textContent = orders.toLocaleString('zh-TW');
  $('#metricCvr').textContent = pct(clicks ? orders / clicks : 0);
  $('#metricCommission').textContent = money(commission);
  rankingBody.innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td><strong>${escapeHTML(row.productId)}</strong>${row.subId ? `<br><small>${escapeHTML(row.subId)}</small>` : ''}</td>
      <td>${row.clicks}</td><td>${row.orders}</td><td>${pct(row.cvr)}</td><td>${money(row.epc)}</td><td>${pct(row.commissionRate)}</td><td class="score">${row.score.toFixed(1)}</td>
    </tr>`).join('') : '<tr><td colspan="7">尚未載入資料</td></tr>';
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function loadRows(rows, label = 'CSV') {
  state.rows = rows.map(scoreRow).filter(row => row.productId !== 'UNKNOWN' || row.clicks || row.orders || row.commission);
  status.textContent = `${label} LOADED / ${state.rows.length} ROWS / LOCAL ONLY`;
  status.className = 'status ok';
  render();
}

async function readFile(file) {
  if (!file) return;
  try { loadRows(parseCSV(await file.text()), file.name.toUpperCase()); }
  catch (error) { status.textContent = `READ FAILED / ${error.message}`; status.className = 'status bad'; }
}

csvFile?.addEventListener('change', event => readFile(event.target.files?.[0]));
['dragenter', 'dragover'].forEach(name => dropZone?.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('drag'); }));
['dragleave', 'drop'].forEach(name => dropZone?.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('drag'); }));
dropZone?.addEventListener('drop', event => readFile(event.dataTransfer?.files?.[0]));

$('#loadDemo')?.addEventListener('click', () => loadRows([
  { product_id: 'product-003', sub_id: 'threads-bedside-001', clicks: '156', orders: '11', revenue: '6589', commission: '527', ctr: '5.1%', commission_rate: '8%' },
  { product_id: 'product-001', sub_id: 'threads-desk-001', clicks: '120', orders: '7', revenue: '3493', commission: '279', ctr: '4.8%', commission_rate: '8%' },
  { product_id: 'product-002', sub_id: 'threads-wall-001', clicks: '82', orders: '3', revenue: '1797', commission: '144', ctr: '3.2%', commission_rate: '8%' },
], 'DEMO DATA'));

$('#clearData')?.addEventListener('click', () => {
  state.rows = []; csvFile.value = ''; status.textContent = 'WAITING FOR DATA / LOCAL ONLY'; status.className = 'status'; render();
});

$('#downloadTemplate')?.addEventListener('click', () => {
  const content = 'product_id,sub_id,clicks,orders,revenue,commission,ctr,commission_rate\nproduct-001,threads-topic-001,0,0,0,0,0%,0%\n';
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'theard-affiliate-performance-template.csv'; link.click(); URL.revokeObjectURL(url);
});

render();
