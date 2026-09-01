const $ = (s, p = document) => p.querySelector(s);

const state = { products: [], rows: [] };
const dropZone = $('#dropZone');
const csvFile = $('#csvFile');
const linksFile = $('#linksFile');
const status = $('#status');
const bridgeStatus = $('#bridgeStatus');
const rankingBody = $('#rankingBody');

function number(value) {
  const text = String(value ?? '').trim().replaceAll(',', '').replaceAll('NT$', '').replaceAll('$', '');
  if (!text) return 0;
  const percent = text.endsWith('%');
  const parsed = Number.parseFloat(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(parsed)) return 0;
  return percent ? parsed / 100 : parsed;
}

function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
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
  const entries = Object.entries(row);
  for (const name of names) {
    const target = name.toLocaleLowerCase('zh-TW').replace(/[\s_-]/g, '');
    const found = entries.find(([key, value]) => key.toLocaleLowerCase('zh-TW').replace(/[\s_-]/g, '') === target && String(value).trim());
    if (found) return found[1];
  }
  return '';
}

function stableId(seed) {
  let hash = 2166136261;
  for (const char of String(seed || 'shopee-product')) {
    hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619);
  }
  return `shopee-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeLinkRow(row) {
  const affiliateUrl = String(get(row, ['產品供應連結', '推廣連結', '分潤連結', '產品推廣連結', 'affiliate_url', 'Affiliate Link', 'Product Offer Link']) || '').trim();
  if (!affiliateUrl) return null;
  const productUrl = String(get(row, ['商品連結', '商品網址', '產品連結', '商品頁面', 'product_url', 'Product Link']) || '').trim();
  const title = String(get(row, ['商品名稱', '產品名稱', '產品', 'title', 'Product Name']) || 'Shopee imported product').trim();
  const subId = String(get(row, ['Sub ID', 'Sub_Id', 'Sub ID 1', 'Sub_id1', 'sub_id1', 'sub_id', 'subid', '追蹤代碼']) || '').trim();
  const commissionRate = Math.max(0, number(get(row, ['分潤率', '佣金率', 'commission_rate', 'Commission Rate'])));
  const category = String(get(row, ['商品分類', '分類', 'category', 'Category']) || '蝦皮匯入').trim();
  return {
    productId: String(get(row, ['product_id', '商品ID', '商品編號', '商品代碼']) || stableId(productUrl || affiliateUrl || title)),
    title, productUrl, affiliateUrl, subId, commissionRate, category,
  };
}

function scoreRow(row) {
  const clicks = Math.max(0, Math.trunc(number(get(row, ['clicks', '點擊', '點擊數', '總點擊數']))));
  let orders = Math.max(0, Math.trunc(number(get(row, ['orders', '訂單', '訂單數', '有效訂單', '完成訂單']))));
  const commission = Math.max(0, number(get(row, ['commission', '分潤', '分潤金', '商品分潤', '預估分潤'])));
  const revenue = Math.max(0, number(get(row, ['revenue', 'gmv', '成交金額', '購買金額', '買家購買價格', '商品成交金額'])));
  const ctr = Math.max(0, number(get(row, ['ctr', 'CTR', '點擊率'])));
  const commissionRate = Math.max(0, number(get(row, ['commission_rate', '分潤率', '佣金率'])));
  const rawOrderId = String(get(row, ['訂單編號', '訂單ID', 'order_id', 'Order ID']) || '').trim();
  if (!orders && rawOrderId) orders = 1;
  const cvr = clicks ? orders / clicks : 0;
  const epc = clicks ? commission / clicks : 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const cvrPoints = clamp(cvr / 0.08, 0, 1) * 40;
  const epcPoints = clamp(epc / 5, 0, 1) * 35;
  const ratePoints = clamp(commissionRate / 0.2, 0, 1) * 15;
  const confidence = clamp(clicks / 100, 0.25, 1);
  const score = (cvrPoints + epcPoints + ratePoints) * confidence + Math.min(10, orders * 1.5);
  return {
    productId: String(get(row, ['product_id', '商品ID', '商品編號', '商品代碼']) || '').trim(),
    productTitle: String(get(row, ['商品名稱', '產品名稱', 'product_name', 'Product Name']) || '').trim(),
    subId: String(get(row, ['sub_id', 'Sub ID', 'Sub_Id', 'Sub ID 1', 'Sub_id1', 'sub_id1', 'subid', '追蹤代碼']) || '').trim(),
    clicks, orders, revenue, commission, ctr, commissionRate, cvr, epc,
    score: Math.round(score * 100) / 100,
  };
}

function money(value) { return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 }).format(value || 0); }
function pct(value) { return `${((value || 0) * 100).toFixed(1)}%`; }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function matches(product, row) {
  if (row.productId && product.productId === row.productId) return true;
  if (row.subId && product.subId && product.subId === row.subId) return true;
  if (row.productTitle && product.title && row.productTitle === product.title) return true;
  return false;
}

function renderBridge() {
  const matchedRows = state.rows.filter(row => state.products.some(product => matches(product, row)));
  $('#bridgeProducts').textContent = state.products.length.toLocaleString('zh-TW');
  $('#bridgePerformance').textContent = state.rows.length.toLocaleString('zh-TW');
  $('#bridgeMatched').textContent = matchedRows.length.toLocaleString('zh-TW');
  if (state.products.length || state.rows.length) {
    bridgeStatus.textContent = `SHOPEE BRIDGE / LINKS ${state.products.length} / PERFORMANCE ${state.rows.length} / MATCHED ${matchedRows.length}`;
    bridgeStatus.className = 'status ok';
  } else {
    bridgeStatus.textContent = 'SHOPEE BRIDGE / WAITING FOR OFFICIAL EXPORTS';
    bridgeStatus.className = 'status';
  }
}

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
      <td><strong>${escapeHTML(row.productId || row.productTitle || row.subId || 'UNMATCHED')}</strong>${row.subId ? `<br><small>${escapeHTML(row.subId)}</small>` : ''}</td>
      <td>${row.clicks}</td><td>${row.orders}</td><td>${pct(row.cvr)}</td><td>${money(row.epc)}</td><td>${pct(row.commissionRate)}</td><td class="score">${row.score.toFixed(1)}</td>
    </tr>`).join('') : '<tr><td colspan="7">尚未載入資料</td></tr>';
  renderBridge();
}

function loadPerformanceRows(rows, label = 'CSV') {
  state.rows = rows.map(scoreRow).filter(row => row.productId || row.productTitle || row.subId || row.clicks || row.orders || row.commission);
  status.textContent = `${label} LOADED / ${state.rows.length} ROWS / LOCAL ONLY`;
  status.className = 'status ok';
  render();
}

function loadLinkRows(rows, label = 'LINK CSV') {
  state.products = rows.map(normalizeLinkRow).filter(Boolean);
  bridgeStatus.textContent = `${label} LOADED / ${state.products.length} OFFICIAL LINKS / LOCAL ONLY`;
  bridgeStatus.className = state.products.length ? 'status ok' : 'status bad';
  render();
}

async function readFile(file, kind) {
  if (!file) return;
  try {
    const rows = parseCSV(await file.text());
    if (kind === 'links') loadLinkRows(rows, file.name.toUpperCase());
    else loadPerformanceRows(rows, file.name.toUpperCase());
  } catch (error) {
    const target = kind === 'links' ? bridgeStatus : status;
    target.textContent = `READ FAILED / ${error.message}`; target.className = 'status bad';
  }
}

csvFile?.addEventListener('change', event => readFile(event.target.files?.[0], 'performance'));
linksFile?.addEventListener('change', event => readFile(event.target.files?.[0], 'links'));

function bindDrop(element, kind) {
  if (!element) return;
  ['dragenter', 'dragover'].forEach(name => element.addEventListener(name, event => { event.preventDefault(); element.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(name => element.addEventListener(name, event => { event.preventDefault(); element.classList.remove('drag'); }));
  element.addEventListener('drop', event => readFile(event.dataTransfer?.files?.[0], kind));
}
bindDrop(dropZone, 'performance');
bindDrop($('#linksDrop'), 'links');
bindDrop($('#performanceDrop'), 'performance');

$('#loadDemo')?.addEventListener('click', () => loadPerformanceRows([
  { product_id: 'product-003', sub_id: 'threads-bedside-001', clicks: '156', orders: '11', revenue: '6589', commission: '527', ctr: '5.1%', commission_rate: '8%' },
  { product_id: 'product-001', sub_id: 'threads-desk-001', clicks: '120', orders: '7', revenue: '3493', commission: '279', ctr: '4.8%', commission_rate: '8%' },
  { product_id: 'product-002', sub_id: 'threads-wall-001', clicks: '82', orders: '3', revenue: '1797', commission: '144', ctr: '3.2%', commission_rate: '8%' },
], 'DEMO DATA'));

$('#clearData')?.addEventListener('click', () => {
  state.rows = []; if (csvFile) csvFile.value = ''; status.textContent = 'WAITING FOR DATA / LOCAL ONLY'; status.className = 'status'; render();
});

$('#clearBridge')?.addEventListener('click', () => {
  state.products = []; state.rows = [];
  if (csvFile) csvFile.value = ''; if (linksFile) linksFile.value = '';
  status.textContent = 'WAITING FOR DATA / LOCAL ONLY'; status.className = 'status'; render();
});

$('#downloadTemplate')?.addEventListener('click', () => {
  const content = 'product_id,sub_id,clicks,orders,revenue,commission,ctr,commission_rate\nproduct-001,threads-topic-001,0,0,0,0,0%,0%\n';
  downloadText(content, 'theard-affiliate-performance-template.csv', 'text/csv;charset=utf-8');
});

$('#downloadProducts')?.addEventListener('click', () => {
  if (!state.products.length) {
    bridgeStatus.textContent = 'NO LINK FILE LOADED / IMPORT SHOPEE BATCH LINKS FIRST'; bridgeStatus.className = 'status bad'; return;
  }
  const header = 'product_id,title,category,product_url,affiliate_url,sub_id,commission_rate';
  const rows = state.products.map(product => [
    product.productId, product.title, product.category, product.productUrl, product.affiliateUrl, product.subId, product.commissionRate,
  ].map(csvCell).join(','));
  downloadText([header, ...rows].join('\n') + '\n', 'theard-shopee-products-normalized.csv', 'text/csv;charset=utf-8');
});

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

render();
