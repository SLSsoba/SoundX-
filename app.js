const DB_KEY = 'soundx_db_v2';
let state = loadState();
let currentView = 'rooms';
let dailyDateFilter = new Date().toISOString().slice(0, 10);
let isSyncingFromCloud = false;
let expandedEquipGroups = new Set();
let equipSearchQuery = '';

let logTypeFilter = 'all'; 
let logStatusFilter = 'all';

// ==========================================
// STATE MANAGEMENT & FIREBASE SYNC
// ==========================================
function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data) {
      data.rooms = data.rooms || [];
      data.equipment = data.equipment || [];
      data.logs = data.logs || [];
      data.dailyLogs = data.dailyLogs || [];
      return data;
    }
  } catch {}
  return { rooms: [], equipment: [], logs: [], dailyLogs: [] };
}

function saveState() {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
  if (!isSyncingFromCloud && window.FB) {
    window.FB.save(state).catch(err => console.warn("Gagal sinkron ke Cloud:", err));
  }
}

if (window.FB) {
  window.FB.listen((cloudData) => {
    if (!cloudData) {
      if (state.rooms.length || state.equipment.length) window.FB.save(state);
      return;
    }

    // 🛡️ PENGAMAN: Pastikan semua array ada, jika tidak buat array kosong
    cloudData.rooms = cloudData.rooms || [];
    cloudData.equipment = cloudData.equipment || [];
    cloudData.logs = cloudData.logs || [];
    cloudData.dailyLogs = cloudData.dailyLogs || [];

    if (JSON.stringify(cloudData) !== JSON.stringify(state)) {
      isSyncingFromCloud = true;
      state = cloudData;
      localStorage.setItem(DB_KEY, JSON.stringify(state));
      
      if (currentView === 'rooms') renderRooms();
      else if (currentView === 'equipment') renderEquipment();
      else if (currentView === 'daily') renderDaily();
      else if (currentView === 'logs') renderLogs();
      
      isSyncingFromCloud = false;
    }
  });
}

// ==========================================
// UTILITIES
// ==========================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LOG_TYPE_LABEL = { maintenance: 'Maintenance', damage: 'Kerusakan', repair: 'Perbaikan' };

function fmtDate(ts) { return new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function updateRoomStatusFromLogs(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  if (!room || room.status === 'maintenance') return;
  const now = Date.now();
  const hasActiveSession = state.dailyLogs.some(l => 
    l.roomId === roomId && l.startAt <= now && (!l.endAt || l.endAt > now)
  );
  room.status = hasActiveSession ? 'in_use' : 'available';
}

// ==========================================
// NAVIGASI
// ==========================================
function switchView(v) {
  currentView = v;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  if (v === 'rooms') renderRooms();
  if (v === 'equipment') renderEquipment();
  if (v === 'daily') renderDaily();
  if (v === 'logs') renderLogs();
}

function handleFab() {
  if (currentView === 'rooms') openRoomModal();
  else if (currentView === 'equipment') openEquipmentModal();
  else if (currentView === 'daily') openDailyModal();
  else if (currentView === 'logs') openLogModal();
}

function openModal(title, bodyHTML, onSave) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  $('#modal').classList.remove('hidden');
  $('#modalSave').onclick = () => { if (onSave() !== false) closeModal(); };
}
function closeModal() { $('#modal').classList.add('hidden'); }

// ==========================================
// ROOMS
// ==========================================
function renderRooms() {
  // 1. TAMPILKAN WIDGET DASHBOARD
  const totalRooms = state.rooms.length;
  const inUse = state.rooms.filter(r => r.status === 'in_use').length;
  const maint = state.rooms.filter(r => r.status === 'maintenance').length;
  const avail = state.rooms.filter(r => r.status === 'available').length;

  const dashWrap = $('#dashboardSummary');
  if (dashWrap) {
    dashWrap.innerHTML = `
      <div class="dash-card">
        <div class="dash-title">Total Room</div>
        <div class="dash-val">${totalRooms}</div>
        <div class="dash-sub">Terdaftar di sistem</div>
      </div>
      <div class="dash-card success">
        <div class="dash-title">Tersedia</div>
        <div class="dash-val">${avail}</div>
        <div class="dash-sub">Siap digunakan</div>
      </div>
      <div class="dash-card warning">
        <div class="dash-title">Terpakai</div>
        <div class="dash-val">${inUse}</div>
        <div class="dash-sub">Sedang ada sesi</div>
      </div>
      <div class="dash-card danger">
        <div class="dash-title">Maintenance</div>
        <div class="dash-val">${maint}</div>
        <div class="dash-sub">Sedang diperbaiki</div>
      </div>
    `;
  }

  // 2. TAMPILKAN DAFTAR ROOM
  const wrap = $('#roomsList');
  if (!state.rooms.length) {
    wrap.innerHTML = '<div class="empty">Belum ada room.<br>Tekan + untuk menambah.</div>';
    return;
  }
  
  wrap.innerHTML = state.rooms.map(r => {
    const eqCount = state.equipment.filter(e => e.roomId === r.id).length;
    const openLogs = state.logs.filter(l => l.roomId === r.id && l.status === 'open').length;
    const todayDaily = state.dailyLogs.filter(d => d.roomId === r.id && d.date === todayStr()).length;
    
    const parts = [`${eqCount} alat`];
    if (openLogs) parts.push(`${openLogs} log aktif`);
    if (todayDaily) parts.push(`${todayDaily} sesi hari ini`);
    
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${esc(r.name)}</div>
            <div class="card-sub">${parts.join(' · ')}</div>
          </div>
          <div class="card-actions">
            <button class="icon-btn" onclick="openRoomModal('${r.id}')">✎</button>
            <button class="icon-btn" onclick="deleteRoom('${r.id}')">🗑</button>
          </div>
        </div>
        <div class="status-row">
          <select class="badge-select" data-status="${r.status}" onchange="setRoomStatus('${r.id}', this.value)">
            <option value="available" ${r.status==='available'?'selected':''}>● Tersedia</option>
            <option value="in_use" ${r.status==='in_use'?'selected':''}>● Terpakai</option>
            <option value="maintenance" ${r.status==='maintenance'?'selected':''}>● Maintenance</option>
          </select>
        </div>
      </div>`;
  }).join('');
}

function openRoomModal(id) {
  const r = id ? state.rooms.find(x => x.id === id) : null;
  openModal(r ? 'Edit Room' : 'Tambah Room', `
    <label>Nama Room</label>
    <input id="f-room-name" type="text" value="${r ? esc(r.name) : ''}" placeholder="Contoh: VIP 1">
    <label>Status</label>
    <select id="f-room-status">
      <option value="available" ${(!r || r.status==='available')?'selected':''}>Tersedia</option>
      <option value="in_use" ${(r && r.status==='in_use')?'selected':''}>Terpakai</option>
      <option value="maintenance" ${(r && r.status==='maintenance')?'selected':''}>Maintenance</option>
    </select>`, () => {
    const name = $('#f-room-name').value.trim();
    if (!name) return false;
    const status = $('#f-room-status').value;
    if (r) { r.name = name; r.status = status; }
    else state.rooms.push({ id: uid(), name, status, createdAt: Date.now() });
    saveState(); renderRooms();
  });
}

function setRoomStatus(id, status) {
  const r = state.rooms.find(x => x.id === id);
  if (r) { r.status = status; saveState(); renderRooms(); }
}

function deleteRoom(id) {
  const r = state.rooms.find(x => x.id === id);
  if (!r) return;
  if (!confirm(`Hapus room "${r.name}"? Alat, log, dan log harian terkait juga terhapus.`)) return;
  state.rooms = state.rooms.filter(x => x.id !== id);
  state.equipment = state.equipment.filter(e => e.roomId !== id);
  state.logs = state.logs.filter(l => l.roomId !== id);
  state.dailyLogs = state.dailyLogs.filter(d => d.roomId !== id);
  saveState(); renderRooms();
}

// ==========================================
// EQUIPMENT (GROUPED & SEARCHABLE)
// ==========================================
function roomName(id) { const r = state.rooms.find(x => x.id === id); return r ? r.name : '—'; }

function toggleEquipmentGroup(key) {
  if (expandedEquipGroups.has(key)) expandedEquipGroups.delete(key);
  else expandedEquipGroups.add(key);
  renderEquipment();
}

function handleEquipSearch(val) {
  equipSearchQuery = val.toLowerCase();
  renderEquipment();
}

function renderEquipment() {
  const wrap = $('#equipmentList');
  
  if (!state.equipment.length) {
    wrap.innerHTML = '<div class="empty">Belum ada alat.<br>Tekan + untuk menambah.</div>';
    return;
  }

  let filteredEquip = state.equipment;
  if (equipSearchQuery) {
    filteredEquip = state.equipment.filter(e => {
      const rName = roomName(e.roomId).toLowerCase();
      const eName = e.name.toLowerCase();
      const eType = (e.type || '').toLowerCase();
      return eName.includes(equipSearchQuery) || eType.includes(equipSearchQuery) || rName.includes(equipSearchQuery);
    });
  }

  if (!filteredEquip.length) {
    wrap.innerHTML = `<div class="empty">Alat dengan kata kunci "${esc(equipSearchQuery)}" tidak ditemukan.</div>`;
    return;
  }

  const groups = {};
  filteredEquip.forEach(e => {
    const key = `${e.name}|||${e.type || ''}`;
    if (!groups[key]) groups[key] = { name: e.name, type: e.type || '', items: [] };
    groups[key].items.push(e);
  });

  wrap.innerHTML = Object.keys(groups).map(key => {
    const group = groups[key];
    const isExpanded = expandedEquipGroups.has(key);
    const totalQty = group.items.length;

    const conditions = group.items.map(i => i.condition);
    const uniqueConditions = [...new Set(conditions)];
    let summaryCondition = 'good';
    let summaryLabel = 'Baik';
    
    if (uniqueConditions.length > 1) { summaryCondition = 'mixed'; summaryLabel = 'Beragam'; }
    else if (uniqueConditions[0] === 'damaged') { summaryCondition = 'damaged'; summaryLabel = 'Rusak'; }
    else if (uniqueConditions[0] === 'repairing') { summaryCondition = 'repairing'; summaryLabel = 'Diperbaiki'; }

    const detailGroups = {};
    group.items.forEach(item => {
      const dKey = `${item.roomId}|||${item.condition}`;
      if (!detailGroups[dKey]) detailGroups[dKey] = { roomId: item.roomId, condition: item.condition, items: [] };
      detailGroups[dKey].items.push(item);
    });

    let detailsHTML = '';
    Object.values(detailGroups).forEach(dg => {
      const condLabel = dg.condition === 'good' ? 'Baik' : dg.condition === 'damaged' ? 'Rusak' : 'Diperbaiki';
      const condColor = dg.condition === 'good' ? 'var(--success)' : dg.condition === 'damaged' ? 'var(--danger)' : 'var(--warning)';
      
      detailsHTML += `
        <div class="equipment-detail-row">
            <div>
                <div style="font-weight:600; font-size:14px; color:var(--text);">${esc(roomName(dg.roomId))}</div>
                <div style="font-size:12px; color:var(--text-dim);"><span style="color:${condColor}">●</span> ${condLabel}</div>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <div style="font-weight:700; font-size:14px; color:var(--primary);">${dg.items.length} unit</div>
                <div class="card-actions">
                    <button class="icon-btn" style="width:28px; height:28px; font-size:12px;" onclick="openEquipmentModal('${dg.items[0].id}')">✎</button>
                    <button class="icon-btn" style="width:28px; height:28px; font-size:12px;" onclick="deleteEquipment('${dg.items[0].id}')">🗑</button>
                </div>
            </div>
        </div>
      `;
    });

    let badgeBg = 'var(--success)';
    if (summaryCondition === 'mixed') badgeBg = 'var(--primary)';
    else if (summaryCondition === 'damaged') badgeBg = 'var(--danger)';
    else if (summaryCondition === 'repairing') badgeBg = 'var(--warning)';

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${esc(group.name)}</div>
            <div class="card-sub">${esc(group.type || '—')} · Total: ${totalQty} unit</div>
          </div>
        </div>
        <div class="status-row" style="margin-top: 10px;">
             <div class="badge-select" style="background-color: ${badgeBg}; cursor:default; padding-right:12px;">● ${summaryLabel}</div>
             <button class="btn primary" style="flex: 0; padding: 6px 16px; font-size: 12px; border-radius: 999px;" onclick="toggleEquipmentGroup('${key}')">
                ${isExpanded ? 'Tutup ∨' : 'View ∨'}
             </button>
        </div>
        ${isExpanded ? `
            <div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 8px;">
                ${detailsHTML}
                <div style="margin-top:12px; text-align:center;">
                    <button class="btn ghost" style="padding:6px 12px; font-size:12px;" onclick="openEquipmentModal(null, '${esc(group.name)}', '${esc(group.type)}')">+ Tambah Varian</button>
                </div>
            </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function openEquipmentModal(id, prefillName = '', prefillType = '') {
  if (!state.rooms.length) { alert('Tambahkan room terlebih dahulu.'); return; }
  const e = id ? state.equipment.find(x => x.id === id) : null;
  const roomOpts = state.rooms.map(r => `<option value="${r.id}" ${e && e.roomId===r.id?'selected':''}>${esc(r.name)}</option>`).join('');
  const initName = e ? esc(e.name) : esc(prefillName);
  const initType = e ? esc(e.type || '') : esc(prefillType);
  
  openModal(e ? 'Edit Alat' : 'Tambah Alat', `
    <label>Nama Alat</label>
    <input id="f-eq-name" type="text" value="${initName}" placeholder="Contoh: Mic Wireless 1">
    <label>Jenis (opsional)</label>
    <input id="f-eq-type" type="text" value="${initType}" placeholder="Contoh: Mikrofon / Speaker">
    ${!e ? `<label>Jumlah (Qty)</label><input id="f-eq-qty" type="number" value="1" min="1">` : ''}
    <label>Room</label>
    <select id="f-eq-room">${roomOpts}</select>
    <label>Kondisi</label>
    <select id="f-eq-cond">
      <option value="good" ${(!e || e.condition==='good')?'selected':''}>Baik</option>
      <option value="damaged" ${(e && e.condition==='damaged')?'selected':''}>Rusak</option>
      <option value="repairing" ${(e && e.condition==='repairing')?'selected':''}>Diperbaiki</option>
    </select>`, () => {
    const name = $('#f-eq-name').value.trim();
    if (!name) return false;
    const data = { name, type: $('#f-eq-type').value.trim(), roomId: $('#f-eq-room').value, condition: $('#f-eq-cond').value };
    
    if (e) Object.assign(e, data);
    else {
        const qty = parseInt($('#f-eq-qty').value) || 1;
        for (let i = 0; i < qty; i++) state.equipment.push({ id: uid(), ...data, createdAt: Date.now() });
    }
    saveState(); renderEquipment();
  });
}

function deleteEquipment(id) {
  if (!confirm('Hapus 1 unit alat ini?')) return;
  state.equipment = state.equipment.filter(x => x.id !== id);
  saveState(); renderEquipment();
}

// ==========================================
// DAILY ROOM LOG
// ==========================================
function renderDaily() {
  $('#dailyFilter').innerHTML = `
    <button class="chip ${dailyDateFilter===todayStr()?'active':''}" onclick="setDailyFilter('today')">Hari ini</button>
    <input type="date" id="dailyDateInput" value="${dailyDateFilter}" onchange="setDailyFilter(this.value)">
  `;

  const wrap = $('#dailyList');
  const items = state.dailyLogs.filter(d => d.date === dailyDateFilter).sort((a, b) => b.startAt - a.startAt);

  if (!items.length) {
    wrap.innerHTML = `<div class="empty">Belum ada sesi pada ${fmtDate(new Date(dailyDateFilter).getTime())}.</div>`;
    return;
  }

  wrap.innerHTML = items.map(d => {
    const eqList = d.equipmentIds && d.equipmentIds.length
      ? d.equipmentIds.map(id => (state.equipment.find(x => x.id === id) || {}).name || '').filter(Boolean).join(', ')
      : '';
    const durasi = d.endAt ? Math.round((d.endAt - d.startAt) / 60000) + ' mnt' : 'Berjalan';

    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">${esc(roomName(d.roomId))}</div>
            <div class="card-sub">${fmtDateTime(d.startAt)} → ${d.endAt ? fmtDateTime(d.endAt) : '—'} · ${durasi}</div>
          </div>
          <div class="card-actions">
            <button class="icon-btn" onclick="openDailyModal('${d.id}')">✎</button>
            <button class="icon-btn" onclick="deleteDaily('${d.id}')">🗑</button>
          </div>
        </div>
        ${d.customer ? `<div class="card-sub" style="margin-top:6px">👤 ${esc(d.customer)}</div>` : ''}
        ${eqList ? `<div class="card-sub" style="margin-top:4px">🎤 ${eqList}</div>` : ''}
        ${d.notes ? `<div class="card-sub" style="margin-top:4px">📝 ${esc(d.notes)}</div>` : ''}
        <div class="status-row">
          <span class="badge ${d.endAt ? 'done' : 'open'}">${d.endAt ? 'Selesai' : 'Berjalan'}</span>
          ${!d.endAt ? `<button class="btn ghost" style="flex:0;padding:6px 12px;font-size:12px" onclick="endDailyNow('${d.id}')">Akhiri sekarang</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function setDailyFilter(val) {
  dailyDateFilter = val === 'today' ? todayStr() : (val || todayStr());
  renderDaily();
}

function openDailyModal(id) {
  const d = id ? state.dailyLogs.find(x => x.id === id) : null;
  const allowedRooms = state.rooms.filter(r => r.status === 'available' || (d && r.id === d.roomId));

  if (!allowedRooms.length) {
    alert('Tidak ada room dengan status Tersedia.\nUbah status room di tab Room, atau akhiri sesi yang sedang berjalan.');
    return;
  }

  const roomOpts = allowedRooms.map(r => `<option value="${r.id}" ${d && d.roomId===r.id?'selected':''}>${esc(r.name)}</option>`).join('');
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const startVal = d ? new Date(d.startAt - now.getTimezoneOffset()*60000).toISOString().slice(0,16) : localNow;
  const endVal = d && d.endAt ? new Date(d.endAt - now.getTimezoneOffset()*60000).toISOString().slice(0,16) : '';

  openModal(d ? 'Edit Sesi Harian' : 'Sesi Room Baru', `
    <label>Tanggal</label>
    <input id="f-d-date" type="date" value="${d ? d.date : dailyDateFilter}">
    <label>Room (Hanya Tersedia)</label>
    <select id="f-d-room">${roomOpts}</select>
    <label>Nama Pelanggan (opsional)</label>
    <input id="f-d-cust" type="text" value="${d ? esc(d.customer || '') : ''}" placeholder="Nama / kode pelanggan">
    <label>Jam Mulai</label>
    <input id="f-d-start" type="datetime-local" value="${startVal}">
    <label>Jam Selesai (kosongkan jika masih berjalan)</label>
    <input id="f-d-end" type="datetime-local" value="${endVal}">
    <label>Alat yang dipakai (pisah koma, opsional)</label>
    <input id="f-d-eq" type="text" value="${d && d.equipmentIds ? d.equipmentIds.map(eid => (state.equipment.find(x=>x.id===eid)||{}).name||'').filter(Boolean).join(', ') : ''}" placeholder="Contoh: Mic 1, Speaker A">
    <label>Catatan (opsional)</label>
    <textarea id="f-d-notes" placeholder="Kondisi room, request, dsb">${d ? esc(d.notes || '') : ''}</textarea>
  `, () => {
    const dateVal = $('#f-d-date').value;
    const roomId = $('#f-d-room').value;
    const custVal = $('#f-d-cust').value.trim();
    const startVal = $('#f-d-start').value;
    const endVal = $('#f-d-end').value;
    const eqRaw = $('#f-d-eq').value.trim();
    const notesVal = $('#f-d-notes').value.trim();

    if (!dateVal || !roomId || !startVal) return false;

    const roomEq = state.equipment.filter(e => e.roomId === roomId);
    const equipmentIds = eqRaw ? eqRaw.split(',').map(s => s.trim()).filter(Boolean).map(nm => (roomEq.find(e => e.name.toLowerCase() === nm.toLowerCase()) || {}).id).filter(Boolean) : [];
    const startAt = new Date(startVal).getTime();
    const endAt = endVal ? new Date(endVal).getTime() : null;
    
    if (endAt && endAt < startAt) { alert('Jam selesai harus setelah jam mulai.'); return false; }

    const payload = { date: dateVal, roomId, customer: custVal, startAt, endAt, equipmentIds, notes: notesVal };

    if (d) {
      const oldRoomId = d.roomId;
      Object.assign(d, payload);
      updateRoomStatusFromLogs(oldRoomId);
    } else {
      state.dailyLogs.push({ id: uid(), ...payload, createdAt: Date.now() });
    }

    updateRoomStatusFromLogs(roomId);
    saveState();
    dailyDateFilter = dateVal;
    renderDaily();
    renderRooms();
  });
}

function endDailyNow(id) {
  const d = state.dailyLogs.find(x => x.id === id);
  if (!d) return;
  d.endAt = Date.now();
  updateRoomStatusFromLogs(d.roomId);
  saveState(); renderDaily(); renderRooms();
}

function deleteDaily(id) {
  if (!confirm('Hapus sesi harian ini?')) return;
  const d = state.dailyLogs.find(x => x.id === id);
  state.dailyLogs = state.dailyLogs.filter(x => x.id !== id);
  if (d) updateRoomStatusFromLogs(d.roomId);
  saveState(); renderDaily(); renderRooms();
}

// ==========================================
// LOGS & REPORT
// ==========================================
function setLogFilter(type, val) {
  if (type === 'type') logTypeFilter = val;
  if (type === 'status') logStatusFilter = val;
  renderLogs();
}

function renderLogs() {
  const totalMaint = state.logs.filter(l => l.type === 'maintenance').length;
  const totalDamage = state.logs.filter(l => l.type === 'damage').length;
  const totalRepair = state.logs.filter(l => l.type === 'repair').length;

  $('#logSummary').innerHTML = `
    <div class="summary-box">
      <div class="val" style="color: #a5b4fc;">${totalMaint}</div>
      <div class="lbl">Maintenance</div>
    </div>
    <div class="summary-box">
      <div class="val" style="color: #fca5a5;">${totalDamage}</div>
      <div class="lbl">Kerusakan</div>
    </div>
    <div class="summary-box">
      <div class="val" style="color: #fcd34d;">${totalRepair}</div>
      <div class="lbl">Perbaikan</div>
    </div>
  `;

  $('#logFilter').innerHTML = `
    <button class="chip ${logTypeFilter==='all'?'active':''}" onclick="setLogFilter('type', 'all')">Semua</button>
    <button class="chip ${logTypeFilter==='maintenance'?'active':''}" onclick="setLogFilter('type', 'maintenance')">Maint</button>
    <button class="chip ${logTypeFilter==='damage'?'active':''}" onclick="setLogFilter('type', 'damage')">Rusak</button>
    <button class="chip ${logTypeFilter==='repair'?'active':''}" onclick="setLogFilter('type', 'repair')">Perbaikan</button>
  `;

  let filteredLogs = state.logs;
  if (logTypeFilter !== 'all') filteredLogs = filteredLogs.filter(l => l.type === logTypeFilter);
  
  const wrap = $('#logsList');
  if (!filteredLogs.length) {
    wrap.innerHTML = '<div class="empty">Belum ada log sesuai filter.</div>';
    return;
  }

  const sorted = [...filteredLogs].sort((a, b) => b.createdAt - a.createdAt);
  wrap.innerHTML = sorted.map(l => {
    const eq = l.equipmentId ? state.equipment.find(e => e.id === l.equipmentId) : null;
    const target = eq ? eq.name : roomName(l.roomId);
    return `
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title"><span class="badge type-${l.type}">${LOG_TYPE_LABEL[l.type]}</span> ${esc(target)}</div>
            <div class="card-sub">${fmtDate(l.createdAt)}${l.description ? ' · ' + esc(l.description) : ''}</div>
          </div>
          <div class="card-actions">
            <button class="icon-btn" onclick="toggleLogStatus('${l.id}')">${l.status==='open'?'✓':'↺'}</button>
            <button class="icon-btn" onclick="deleteLog('${l.id}')">🗑</button>
          </div>
        </div>
        <div class="status-row">
          <span class="badge ${l.status}">${l.status === 'open' ? 'Belum selesai' : 'Selesai'}</span>
        </div>
      </div>`;
  }).join('');
}

function openLogModal() {
  if (!state.rooms.length) { alert('Tambahkan room terlebih dahulu.'); return; }
  const roomOpts = state.rooms.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  openModal('Tambah Log', `
    <label>Jenis</label>
    <select id="f-log-type">
      <option value="maintenance">Maintenance</option>
      <option value="damage">Kerusakan</option>
      <option value="repair">Perbaikan</option>
    </select>
    <label>Room</label>
    <select id="f-log-room" onchange="updateEquipmentOptions()">${roomOpts}</select>
    <label>Alat (opsional)</label>
    <select id="f-log-eq"><option value="">— Semua / tidak spesifik —</option></select>
    <label>Deskripsi</label>
    <textarea id="f-log-desc" placeholder="Deskripsi singkat masalah / tindakan"></textarea>
    <label>Status</label>
    <select id="f-log-status"><option value="open">Belum selesai</option><option value="done">Selesai</option></select>
  `, () => {
    const roomId = $('#f-log-room').value;
    if (!roomId) return false;
    state.logs.push({ id: uid(), type: $('#f-log-type').value, roomId, equipmentId: $('#f-log-eq').value || null, description: $('#f-log-desc').value.trim(), status: $('#f-log-status').value, createdAt: Date.now() });
    saveState(); renderLogs();
  });
  updateEquipmentOptions();
}

function updateEquipmentOptions() {
  const roomId = $('#f-log-room').value;
  const sel = $('#f-log-eq');
  const eqs = state.equipment.filter(e => e.roomId === roomId);
  const uniqueNames = [...new Set(eqs.map(e => e.name))];
  
  sel.innerHTML = '<option value="">— Semua / tidak spesifik —</option>' + 
    uniqueNames.map(name => {
        const item = eqs.find(e => e.name === name);
        return `<option value="${item.id}">${esc(name)}</option>`;
    }).join('');
}

function toggleLogStatus(id) {
  const l = state.logs.find(x => x.id === id);
  if (l) { l.status = l.status === 'open' ? 'done' : 'open'; saveState(); renderLogs(); }
}

function deleteLog(id) {
  if (!confirm('Hapus log ini?')) return;
  state.logs = state.logs.filter(x => x.id !== id);
  saveState(); renderLogs();
}

// ==========================================
// SETTINGS / BACKUP
// ==========================================
function openSettings() {
  openModal('Pengaturan', `
    <div class="settings-row"><span>Total room</span><strong>${state.rooms.length}</strong></div>
    <div class="settings-row"><span>Total alat</span><strong>${state.equipment.length}</strong></div>
    <div class="settings-row"><span>Log maintenance</span><strong>${state.logs.length}</strong></div>
    <div class="settings-row"><span>Log harian</span><strong>${state.dailyLogs.length}</strong></div>
    <div class="settings-row" style="margin-top:8px">
      <button class="btn ghost" onclick="exportData()">⬇ Export</button>
      <button class="btn ghost" onclick="document.getElementById('importFile').click()">⬆ Import</button>
    </div>
    <input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(event)">
    <div class="settings-row"><button class="btn danger" style="width:100%" onclick="clearAllData()">Hapus Semua Data</button></div>
  `, () => true);
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `soundx-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
}

function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.rooms || !data.equipment || !data.logs) throw new Error('Format salah');
      data.dailyLogs = data.dailyLogs || [];
      if (!confirm('Ganti data saat ini dengan data impor?')) return;
      state = data; saveState();
      renderRooms(); renderEquipment(); renderDaily(); renderLogs();
      closeModal(); alert('Data berhasil diimpor.');
    } catch (err) { alert('Gagal impor: ' + err.message); }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Hapus SEMUA data?')) return;
  if (!confirm('Yakin? Pastikan sudah export backup.')) return;
  state = { rooms: [], equipment: [], logs: [], dailyLogs: [] };
  saveState(); renderRooms(); renderEquipment(); renderDaily(); renderLogs(); closeModal();
}

// ==========================================
// AUTO-REFRESH & KEYBOARD SHORTCUTS
// ==========================================
setInterval(() => {
  let changed = false;
  state.rooms.forEach(r => {
    const oldStatus = r.status;
    updateRoomStatusFromLogs(r.id);
    if (oldStatus !== r.status) changed = true;
  });
  if (changed) {
    saveState();
    if (currentView === 'rooms') renderRooms();
    if (currentView === 'daily') renderDaily();
  }
}, 60000);

document.addEventListener('keydown', (e) => {
  if (e.key === 'F2') {
    e.preventDefault(); 
    const activeTag = document.activeElement.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;
    handleFab();
  }
});

// INIT
renderRooms();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed', err));
  });
}