/*
    Real Estate Management App - Final Version 4 (Rebuilt)
    Author: Jules
    Date: 2025-08-19
    Description: A complete rebuild of the application logic to use IndexedDB,
    PWA features, and modern, CSP-compliant event handling with `addEventListener`.
    This version is designed to be robust, stable, and fully asynchronous.
*/

/* ===== GLOBAL STATE & CONFIG ===== */
const APPKEY = 'estate_pro_final_v3_migrated'; // New key to avoid conflicts
let state = {};
let historyStack = [];
let historyIndex = -1;
let currentView = 'dash';
let currentParam = null;

/* ===== CORE APP INITIALIZATION ===== */
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('ServiceWorker registered.', reg))
                .catch(err => console.error('ServiceWorker registration failed:', err));
        });
    }

    // 1. Initialize state with a default, empty but valid structure.
    state = { settings: {theme:'dark',font:16, pass:null}, locked: false };
    OBJECT_STORES.forEach(storeName => {
        if (storeName !== 'keyval' && storeName !== 'settings') {
            state[storeName] = [];
        }
    });

    try {
        await openDB();
        const migrationComplete = await getKeyVal('migrationComplete');
        let loadedState;

        if (migrationComplete) {
            loadedState = await loadStateFromDB();
        } else {
            console.log("Checking for localStorage data to migrate...");
            const localStorageState = loadFromLocalStorage();
            if (localStorageState && localStorageState.customers && localStorageState.customers.length > 0) {
                console.log("Migrating data from localStorage to IndexedDB...");
                loadedState = localStorageState;
                const tempState = state;
                state = loadedState;
                await persist();
                state = tempState;
                console.log("Migration successful.");
            }
            await setKeyVal('migrationComplete', true);
        }

        if (loadedState) {
            for(const key in loadedState) {
                if (key === 'settings' && typeof loadedState[key] === 'object' && loadedState[key] !== null) {
                    Object.assign(state.settings, loadedState[key]);
                } else if (state[key] !== undefined) {
                    state[key] = loadedState[key];
                }
            }
        }

    } catch (error) {
        console.error("Fatal Error: Failed to load or migrate data.", error);
        alert("حدث خطأ فادح أثناء تحميل البيانات. سيعمل التطبيق بحالة فارغة.");
    }

    // 3. Run startup sequence with a guaranteed valid state object.
    if (!state.safes || state.safes.length === 0) {
        state.safes = [{ id: uid('S'), name: 'الخزنة الرئيسية', balance: 0 }];
        await persist();
    }

    // Setup UI and global event listeners
    applySettings();
    document.getElementById('themeSel').onchange = async (e) => { state.settings.theme = e.target.value; await persist(); };
    document.getElementById('fontSel').onchange = async (e) => { state.settings.font = Number(e.target.value); await persist(); };
    document.getElementById('lockBtn').onclick = async () => {
        const pass = prompt('ضع كلمة مرور أو اتركها فارغة لإلغاء القفل', '');
        state.locked = !!pass;
        state.settings.pass = pass || null;
        await persist();
        alert(state.locked ? 'تم تفعيل القفل' : 'تم إلغاء القفل');
        checkLock();
    };
    document.getElementById('undoBtn').onclick = undo;
    document.getElementById('redoBtn').onclick = redo;

    checkLock();
    saveState();
    updateUndoRedoButtons();
    nav('dash');
}

/* ===== DATA PERSISTENCE & MIGRATION ===== */
async function persist() {
    try {
        const db = await openDB();
        const transaction = db.transaction(OBJECT_STORES.filter(s => s !== 'keyval'), 'readwrite');
        const promises = [];
        for (const storeName of OBJECT_STORES) {
            if (storeName === 'keyval') continue;
            const store = transaction.objectStore(storeName);
            promises.push(new Promise((resolve) => { store.clear().onsuccess = resolve; }));
            const dataToStore = state[storeName];
            if (storeName === 'settings') {
                 if (dataToStore) promises.push(new Promise((resolve) => { store.put({key: 'appSettings', ...dataToStore}).onsuccess = resolve; }));
            } else if (dataToStore && Array.isArray(dataToStore)) {
                dataToStore.forEach(item => {
                    if(typeof item === 'object' && item !== null && item.id) {
                        promises.push(new Promise((resolve) => { store.put(item).onsuccess = resolve; }));
                    }
                });
            }
        }
        await Promise.all(promises);
        applySettings();
    } catch (error) { console.error('Failed to persist state to IndexedDB:', error); }
}

async function loadStateFromDB() {
    const newState = {};
    const db = await openDB();
    const transaction = db.transaction(OBJECT_STORES.filter(s => s !== 'keyval'), 'readonly');
    const promises = [];
    for (const storeName of OBJECT_STORES) {
        if (storeName === 'keyval') continue;
        const store = transaction.objectStore(storeName);
        promises.push(new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
                if (storeName === 'settings') {
                    newState.settings = req.result.length > 0 ? req.result[0] : null;
                } else {
                    newState[storeName] = req.result;
                }
                resolve();
            };
            req.onerror = (e) => reject(e.target.error);
        }));
    }
    await Promise.all(promises);
    return newState;
}

function loadFromLocalStorage(){ const s = localStorage.getItem('estate_pro_final_v3'); return s ? JSON.parse(s) : {}; }

/* ===== UNDO/REDO ===== */
async function undo() { if (historyIndex > 0) { historyIndex--; const restoredState = JSON.parse(JSON.stringify(historyStack[historyIndex])); Object.keys(state).forEach(key => delete state[key]); Object.assign(state, restoredState); await persist(); nav(currentView, currentParam); updateUndoRedoButtons(); } }
async function redo() { if (historyIndex < historyStack.length - 1) { historyIndex++; const restoredState = JSON.parse(JSON.stringify(historyStack[historyIndex])); Object.keys(state).forEach(key => delete state[key]); Object.assign(state, restoredState); await persist(); nav(currentView, currentParam); updateUndoRedoButtons(); } }
function saveState() { historyStack = historyStack.slice(0, historyIndex + 1); historyStack.push(JSON.parse(JSON.stringify(state))); if (historyStack.length > 50) { historyStack.shift(); } historyIndex = historyStack.length - 1; updateUndoRedoButtons(); }
function updateUndoRedoButtons() { const undoBtn = document.getElementById('undoBtn'); const redoBtn = document.getElementById('redoBtn'); if (undoBtn) undoBtn.disabled = historyIndex <= 0; if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1; }
document.addEventListener('keydown', (e) => { const targetNode = e.target.nodeName.toLowerCase(); if (targetNode === 'input' || targetNode === 'textarea' || e.target.isContentEditable) return; if (e.ctrlKey) { if (e.key === 'z') { e.preventDefault(); undo(); } else if (e.key === 'y') { e.preventDefault(); redo(); } } });

/* ===== UTILS & HELPERS ===== */
function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9); }
function today(){ return new Date().toISOString().slice(0,10); }
function logAction(description, details = {}) { 
    if (!state.auditLog) state.auditLog = [];
    state.auditLog.push({ id: uid('LOG'), timestamp: new Date().toISOString(), description, details }); 
}
const fmt = new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function egp(v){ v=Number(v||0); return isFinite(v)?fmt.format(v)+' ج.م':'' }
function applySettings(){ if(state && state.settings) { document.documentElement.setAttribute('data-theme', state.settings.theme||'dark'); document.documentElement.style.fontSize=(state.settings.font||16)+'px'; } }
function checkLock(){ if(state.locked){ const p=prompt('اكتب كلمة المرور للدخول'); if(p!==state.settings.pass){ alert('كلمة مرور غير صحيحة'); location.reload(); } } }
function unitById(id){ return state.units?.find(u=>u.id===id); }
function custById(id){ return state.customers?.find(c=>c.id===id); }
function partnerById(id){ return state.partners?.find(p=>p.id===id); }
function brokerById(id){ return state.brokers?.find(b=>b.id===id); }
function unitCode(id){ return (unitById(id)||{}).code||'—'; }
function getUnitDisplayName(unit) { if (!unit) return '—'; const name = unit.name ? `اسم الوحدة (${unit.name})` : ''; const floor = unit.floor ? `رقم الدور (${unit.floor})` : ''; const building = unit.building ? `رقم العمارة (${unit.building})` : ''; return [name, floor, building].filter(Boolean).join(' '); }
function parseNumber(v){ v=String(v||'').replace(/[^\d.]/g,''); return Number(v||0); }

/* ===== ROUTING & UI ===== */
const routes=[
  {id:'dash',title:'لوحة التحكم',render:renderDash, tab: true}, {id:'old-dash',title:'لوحة التحكم القديمة',render:renderOldDash, tab: false},
  {id:'customers',title:'العملاء',render:renderCustomers, tab: true}, {id:'units',title:'الوحدات',render:renderUnits, tab: true},
  {id:'contracts',title:'العقود',render:renderContracts, tab: true}, {id:'brokers',title:'السماسرة',render:renderBrokers, tab: true},
  {id:'installments',title:'الأقساط',render:renderInstallments, tab: true}, {id:'vouchers',title:'السندات',render:renderVouchers, tab: true},
  {id:'partners',title:'الشركاء',render:renderPartners, tab: true}, {id:'treasury',title:'الخزينة',render:renderTreasury, tab: true},
  {id:'reports',title:'التقارير',render:renderReports, tab: true}, {id:'partner-debts',title:'ديون الشركاء',render:renderPartnerDebts, tab: false},
  {id:'audit', title: 'سجل التغييرات', render: renderAuditLog, tab: true}, {id:'backup',title:'نسخة احتياطية',render:renderBackup, tab: true},
  {id:'unit-details', title:'تفاصيل الوحدة', render:renderUnitDetails, tab: false}, {id:'partner-group-details', title:'تفاصيل مجموعة الشركاء', render:renderPartnerGroupDetails, tab: false},
  {id: 'broker-details', title: 'تفاصيل السمسار', render: renderBrokerDetails, tab: false}, {id: 'partner-details', title: 'تفاصيل الشريك', render: renderPartnerDetails, tab: false},
  {id: 'customer-details', title: 'تفاصيل العميل', render: renderCustomerDetails, tab: false}, {id: 'unit-edit', title: 'تعديل الوحدة', render: renderUnitEdit, tab: false},
];
const tabs=document.getElementById('tabs'), view=document.getElementById('view');
routes.forEach(r=>{ if(r.tab){const b=document.createElement('button'); b.className='tab'; b.id='tab-'+r.id; b.textContent=r.title; b.setAttribute('hx-trigger', 'click'); b.setAttribute('hx-target', '#view'); b.onclick=()=>nav(r.id); tabs.appendChild(b);} });
function nav(id, param = null){
  currentView = id; currentParam = param;
  const route = routes.find(x=>x.id===id); if(!route) return;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const tab = document.getElementById('tab-'+id); if(tab) tab.classList.add('active');
  route.render(param);
  if(typeof htmx !== 'undefined') htmx.process(view);
}

function showModal(title, content, onSave) {
    const modal = document.createElement('div'); modal.id = 'dynamic-modal';
    modal.style = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;';
    modal.innerHTML = `<div style="background:var(--panel);padding:20px;border-radius:12px;width:90%;max-width:500px;"><h3>${title}</h3><div>${content}</div><div class="tools" style="margin-top:20px;justify-content:flex-end;"><button class="btn secondary" id="modal-cancel">إلغاء</button><button class="btn" id="modal-save">حفظ</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('modal-cancel').onclick = () => document.body.removeChild(modal);
    document.getElementById('modal-save').onclick = async () => {
        const result = await onSave();
        if (result) { document.body.removeChild(modal); }
    };
}
function table(headers, rows, sortKey=null, onSort=null){ const head = headers.map((h,i)=>`<th data-idx="${i}">${h}${sortKey&&sortKey.idx===i?(sortKey.dir==='asc'?' ▲':' ▼'):''}</th>`).join(''); const body = rows.length? rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}"><small>لا توجد بيانات</small></td></tr>`; const html = `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`; const wrap=document.createElement('div'); wrap.innerHTML=html; if(onSort){ wrap.querySelectorAll('th').forEach(th=> th.onclick=()=>{ const idx=Number(th.dataset.idx); const dir = sortKey && sortKey.idx===idx && sortKey.dir==='asc' ? 'desc' : 'asc'; onSort({idx,dir}); }); } return wrap.innerHTML; }
function printHTML(title, bodyHTML){ const w=window.open('','_blank'); if(!w) return alert('الرجاء السماح بال نوافذ المنبثقة لطباعة التقارير.'); w.document.write(`<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4;margin:12mm}body{font-family:system-ui,Segoe UI,Roboto; padding:0; margin:0; direction:rtl; color:#111}.wrap{padding:16px 18px}h1{font-size:20px;margin:0 0 12px 0}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right;vertical-align:top}thead th{background:#f1f5f9}footer{margin-top:12px;font-size:11px;color:#555}</style></head><body><div class="wrap">${bodyHTML}<footer>تمت الطباعة في ${new Date().toLocaleString('ar-EG')}</footer></div></body></html>`); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 250); }

/* ===== RENDER FUNCTIONS & EVENT HANDLERS ===== */

function renderDash() {
    const totalUnits = state.units?.length || 0;
    const totalCustomers = state.customers?.length || 0;
    const totalContracts = state.contracts?.length || 0;
    const totalPartners = state.partners?.length || 0;
    
    const activeContracts = state.contracts?.filter(c => c.status === 'نشط').length || 0;
    const totalRevenue = state.installments?.reduce((sum, i) => sum + (i.paid ? parseNumber(i.amount) : 0), 0) || 0;
    const pendingInstallments = state.installments?.filter(i => !i.paid && new Date(i.dueDate) < new Date()).length || 0;
    
    view.innerHTML = `
        <div class="grid grid-4" style="margin-bottom: 20px;">
            <div class="card">
                <h3>إجمالي الوحدات</h3>
                <div style="font-size: 24px; font-weight: bold; color: #007bff;">${totalUnits}</div>
            </div>
            <div class="card">
                <h3>إجمالي العملاء</h3>
                <div style="font-size: 24px; font-weight: bold; color: #28a745;">${totalCustomers}</div>
            </div>
            <div class="card">
                <h3>العقود النشطة</h3>
                <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${activeContracts}</div>
            </div>
            <div class="card">
                <h3>إجمالي الإيرادات</h3>
                <div style="font-size: 18px; font-weight: bold; color: #17a2b8;">${egp(totalRevenue)}</div>
            </div>
        </div>
        
        <div class="grid grid-2">
            <div class="card">
                <h3>الأقساط المتأخرة</h3>
                <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${pendingInstallments}</div>
                <button class="btn" onclick="nav('installments')">عرض التفاصيل</button>
            </div>
            <div class="card">
                <h3>إحصائيات سريعة</h3>
                <div>إجمالي الشركاء: ${totalPartners}</div>
                <div>إجمالي العقود: ${totalContracts}</div>
                <button class="btn secondary" onclick="nav('reports')">عرض التقارير</button>
            </div>
        </div>
    `;
}

function renderOldDash() {
    view.innerHTML = `
        <div class="card">
            <h2>لوحة التحكم القديمة</h2>
            <p>هذه هي النسخة القديمة من لوحة التحكم. يرجى استخدام النسخة الجديدة.</p>
            <button class="btn" onclick="nav('dash')">العودة للوحة التحكم الجديدة</button>
        </div>
    `;
}

function renderCustomers() {
    let sort = { idx: 0, dir: 'asc' };

    function draw() {
        const q = (document.getElementById('c-q')?.value || '').trim().toLowerCase();
        let list = state.customers?.slice() || [];
        if (q) {
            list = list.filter(c => {
                const searchable = `${c.name||''} ${c.phone||''} ${c.nationalId||''} ${c.address||''} ${c.status||''}`.toLowerCase();
                return searchable.includes(q);
            });
        }
        list.sort((a, b) => {
            const colsA = [a.name || '', a.phone || '', a.nationalId || '', a.status || ''];
            const colsB = [b.name || '', b.phone || '', b.nationalId || '', b.status || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        const rows = list.map(c => [
            `<a href="#" data-nav-id="customer-details" data-nav-param="${c.id}">${c.name||''}</a>`,
            c.phone || '', c.nationalId || '', c.status || 'نشط',
            `<button class="btn secondary" data-del-coll="customers" data-del-id="${c.id}">حذف</button>`
        ]);
        document.getElementById('c-list').innerHTML = table(['الاسم', 'الهاتف', 'الرقم القومي', 'الحالة', ''], rows, sort, (ns) => { sort = ns; draw(); });
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة عميل</h3>
                <div class="grid grid-2" style="gap: 10px;">
                    <input class="input" id="c-name" placeholder="اسم العميل">
                    <input class="input" id="c-phone" placeholder="الهاتف">
                    <input class="input" id="c-nationalId" placeholder="الرقم القومي">
                    <input class="input" id="c-address" placeholder="العنوان">
                </div>
                <select class="select" id="c-status" style="margin-top:10px;"><option value="نشط">نشط</option><option value="موقوف">موقوف</option></select>
                <textarea class="input" id="c-notes" placeholder="ملاحظات" style="margin-top:10px;" rows="2"></textarea>
                <button class="btn" id="add-customer-btn" style="margin-top:10px;">حفظ</button>
            </div>
            <div class="card">
                <h3>العملاء</h3>
                <div class="tools">
                    <input class="input" id="c-q" placeholder="بحث..." oninput="draw()" style="width: auto; margin-bottom: 0;">
                    <button class="btn secondary" id="export-csv-btn">CSV</button>
                    <label class="btn secondary"><input type="file" id="import-csv-input" accept=".csv" style="display:none">استيراد CSV</label>
                    <button class="btn" id="print-pdf-btn">طباعة PDF</button>
                </div>
                <div id="c-list"></div>
            </div>
        </div>`;

    draw();

    // Attach Event Listeners
    document.getElementById('add-customer-btn').addEventListener('click', async () => {
        const name = document.getElementById('c-name').value.trim();
        const phone = document.getElementById('c-phone').value.trim();
        const nationalId = document.getElementById('c-nationalId').value.trim();
        const address = document.getElementById('c-address').value.trim();
        const status = document.getElementById('c-status').value;
        const notes = document.getElementById('c-notes').value.trim();
        if (!name || !phone) return alert('الرجاء إدخال الاسم ورقم الهاتف على الأقل.');
        if (state.customers && state.customers.some(c => c.name.toLowerCase() === name.toLowerCase())) { return alert('عميل بنفس الاسم موجود بالفعل.'); }

        saveState();
        const newCustomer = { id: uid('C'), name, phone, nationalId, address, status, notes };
        if (!state.customers) state.customers = [];
        state.customers.push(newCustomer);
        logAction('إضافة عميل جديد', { id: newCustomer.id, name: newCustomer.name });
        await persist();

        document.getElementById('c-name').value = '';
        document.getElementById('c-phone').value = '';
        document.getElementById('c-nationalId').value = '';
        document.getElementById('c-address').value = '';
        document.getElementById('c-notes').value = '';
        draw();
    });

    view.addEventListener('click', (e) => {
        if (e.target.matches('[data-del-id]')) {
            const id = e.target.dataset.delId;
            const coll = e.target.dataset.delColl;
            delRow(coll, id);
        }
        if (e.target.matches('[data-nav-id]')) {
            e.preventDefault();
            const id = e.target.dataset.navId;
            const param = e.target.dataset.navParam;
            nav(id, param);
        }
    });
}

function renderUnits() {
    let sort = { idx: 0, dir: 'asc' };

    function draw() {
        const query = (document.getElementById('u-q')?.value || '').trim().toLowerCase();
        let list = state.units?.slice() || [];
        
        if (query) {
            list = list.filter(unit => {
                const searchable = `${unit.name || ''} ${unit.code || ''} ${unit.building || ''} ${unit.floor || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const colsA = [a.name || '', a.code || '', a.building || '', a.status || ''];
            const colsB = [b.name || '', b.code || '', b.building || '', b.status || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(unit => {
            const unitContracts = state.contracts?.filter(c => c.unitId === unit.id) || [];
            const activeContract = unitContracts.find(c => c.status === 'نشط');
            const unitInstallments = state.installments?.filter(i => {
                const contract = state.contracts?.find(c => c.id === i.contractId);
                return contract && contract.unitId === unit.id;
            }) || [];
            const paidInstallments = unitInstallments.filter(i => i.paid).length;
            const totalInstallments = unitInstallments.length;
            
            return [
                `<a href="#" data-nav-id="unit-details" data-nav-param="${unit.id}">${unit.name || ''}</a>`,
                unit.code || '',
                unit.building || '',
                unit.floor || '',
                unit.area ? `${unit.area} م²` : '',
                egp(unit.price),
                unit.status || 'متاحة',
                activeContract ? `<span style="color: orange;">مباعة</span>` : `<span style="color: green;">متاحة</span>`,
                totalInstallments > 0 ? `${paidInstallments}/${totalInstallments}` : '-',
                `<button class="btn secondary" data-del-coll="units" data-del-id="${unit.id}">حذف</button>`
            ];
        });
        
        document.getElementById('u-list').innerHTML = table(
            ['اسم الوحدة', 'الرمز', 'العمارة', 'الدور', 'المساحة', 'السعر', 'الحالة', 'الحالة الفعلية', 'الأقساط', ''],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة وحدة</h3>
                <div class="grid grid-2" style="gap: 10px;">
                    <input class="input" id="u-name" placeholder="اسم الوحدة">
                    <input class="input" id="u-code" placeholder="رمز الوحدة">
                    <input class="input" id="u-building" placeholder="رقم العمارة">
                    <input class="input" id="u-floor" placeholder="رقم الدور">
                </div>
                <input class="input" id="u-area" placeholder="المساحة (م²)" style="margin-top:10px;">
                <input class="input" id="u-price" placeholder="السعر" style="margin-top:10px;">
                <select class="select" id="u-type" style="margin-top:10px;">
                    <option value="شقة">شقة</option>
                    <option value="محل">محل</option>
                    <option value="مكتب">مكتب</option>
                    <option value="مستودع">مستودع</option>
                    <option value="فيلا">فيلا</option>
                </select>
                <select class="select" id="u-status" style="margin-top:10px;">
                    <option value="متاحة">متاحة</option>
                    <option value="مباعة">مباعة</option>
                    <option value="قيد التطوير">قيد التطوير</option>
                    <option value="صيانة">صيانة</option>
                </select>
                <textarea class="input" id="u-notes" placeholder="ملاحظات" style="margin-top:10px;" rows="2"></textarea>
                <button class="btn" id="add-unit-btn" style="margin-top:10px;">حفظ</button>
            </div>
            <div class="card">
                <h3>الوحدات</h3>
                <div class="tools">
                    <input class="input" id="u-q" placeholder="بحث..." oninput="draw()" style="width: auto; margin-bottom: 0;">
                    <button class="btn secondary" id="export-units-csv">CSV</button>
                    <button class="btn" id="print-units-pdf">طباعة PDF</button>
                </div>
                <div id="u-list"></div>
            </div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('add-unit-btn').addEventListener('click', async () => {
        const name = document.getElementById('u-name').value.trim();
        const code = document.getElementById('u-code').value.trim();
        const building = document.getElementById('u-building').value.trim();
        const floor = document.getElementById('u-floor').value.trim();
        const area = document.getElementById('u-area').value.trim();
        const price = document.getElementById('u-price').value.trim();
        const type = document.getElementById('u-type').value;
        const status = document.getElementById('u-status').value;
        const notes = document.getElementById('u-notes').value.trim();
        
        if (!name || !code) {
            return alert('الرجاء إدخال اسم الوحدة والرمز على الأقل.');
        }
        
        if (state.units && state.units.some(u => u.code.toLowerCase() === code.toLowerCase())) {
            return alert('وحدة بنفس الرمز موجودة بالفعل.');
        }

        saveState();
        const newUnit = {
            id: uid('U'),
            name,
            code,
            building,
            floor,
            area: parseNumber(area),
            price: parseNumber(price),
            type,
            status,
            notes,
            createdAt: new Date().toISOString()
        };
        
        if (!state.units) state.units = [];
        state.units.push(newUnit);
        logAction('إضافة وحدة جديدة', {
            id: newUnit.id,
            name: newUnit.name,
            code: newUnit.code,
            type: newUnit.type
        });
        
        await persist();

        // Clear form
        document.getElementById('u-name').value = '';
        document.getElementById('u-code').value = '';
        document.getElementById('u-building').value = '';
        document.getElementById('u-floor').value = '';
        document.getElementById('u-area').value = '';
        document.getElementById('u-price').value = '';
        document.getElementById('u-notes').value = '';
        
        draw();
    });

    // Global event delegation
    view.addEventListener('click', (e) => {
        if (e.target.matches('[data-del-id]')) {
            const id = e.target.dataset.delId;
            const collection = e.target.dataset.delColl;
            delRow(collection, id);
        }
        
        if (e.target.matches('[data-nav-id]')) {
            e.preventDefault();
            const id = e.target.dataset.navId;
            const param = e.target.dataset.navParam;
            nav(id, param);
        }
    });
}

function renderContracts() {
    let sort = { idx: 0, dir: 'asc' };

    function draw() {
        const query = (document.getElementById('contract-q')?.value || '').trim().toLowerCase();
        let list = state.contracts?.slice() || [];
        
        if (query) {
            list = list.filter(contract => {
                const unit = unitById(contract.unitId);
                const customer = custById(contract.customerId);
                const searchable = `${unit?.name || ''} ${customer?.name || ''} ${contract.type || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const unitA = unitById(a.unitId);
            const unitB = unitById(b.unitId);
            const colsA = [unitA?.name || '', a.type || '', a.status || '', a.startDate || ''];
            const colsB = [unitB?.name || '', b.type || '', b.status || '', b.startDate || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(contract => {
            const unit = unitById(contract.unitId);
            const customer = custById(contract.customerId);
            const contractInstallments = state.installments?.filter(i => i.contractId === contract.id) || [];
            const paidInstallments = contractInstallments.filter(i => i.paid).length;
            const totalInstallments = contractInstallments.length;
            const totalPaid = contractInstallments.filter(i => i.paid).reduce((sum, i) => sum + (i.amount || 0), 0);
            const remainingAmount = (contract.amount || 0) - totalPaid;
            
            return [
                unit?.name || '',
                customer?.name || '',
                contract.type || '',
                contract.status || 'نشط',
                contract.startDate || '',
                contract.endDate || '',
                egp(contract.amount),
                egp(totalPaid),
                egp(remainingAmount),
                totalInstallments > 0 ? `${paidInstallments}/${totalInstallments}` : '-',
                `<button class="btn secondary" data-del-coll="contracts" data-del-id="${contract.id}">حذف</button>
                 ${contract.status === 'نشط' ? `<button class="btn" style="background: #dc3545;" onclick="endContract('${contract.id}')">إنهاء</button>` : ''}`
            ];
        });
        
        document.getElementById('contract-list').innerHTML = table(
            ['الوحدة', 'العميل', 'النوع', 'الحالة', 'تاريخ البداية', 'تاريخ الانتهاء', 'قيمة العقد', 'المدفوع', 'المتبقي', 'الأقساط', 'الإجراءات'],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إنشاء عقد جديد</h3>
                <select class="select" id="contract-unit" style="margin-bottom:10px;">
                    <option value="">اختر الوحدة</option>
                    ${(state.units || []).filter(u => u.status === 'متاحة').map(u => `<option value="${u.id}">${u.name} - ${u.code}</option>`).join('')}
                </select>
                <select class="select" id="contract-customer" style="margin-bottom:10px;">
                    <option value="">اختر العميل</option>
                    ${(state.customers || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <select class="select" id="contract-type" style="margin-bottom:10px;">
                    <option value="بيع">بيع</option>
                    <option value="بيع بالتقسيط">بيع بالتقسيط</option>
                </select>
                <div class="grid grid-2" style="gap: 10px; margin-bottom:10px;">
                    <input class="input" id="contract-start-date" type="date" placeholder="تاريخ البداية">
                    <input class="input" id="contract-end-date" type="date" placeholder="تاريخ الانتهاء">
                </div>
                <input class="input" id="contract-amount" placeholder="قيمة العقد" style="margin-bottom:10px;">
                <input class="input" id="contract-monthly-amount" placeholder="المبلغ الشهري (للتقسيط)" style="margin-bottom:10px;">
                <input class="input" id="contract-deposit" placeholder="أمانات الصيانة" style="margin-bottom:10px;">
                <select class="select" id="contract-payment-method" style="margin-bottom:10px;">
                    <option value="شهري">شهري</option>
                    <option value="ربع سنوي">ربع سنوي</option>
                    <option value="نصف سنوي">نصف سنوي</option>
                    <option value="سنوي">سنوي</option>
                    <option value="مقدم">مقدم</option>
                </select>
                <textarea class="input" id="contract-notes" placeholder="ملاحظات" rows="2" style="margin-bottom:10px;"></textarea>
                <button class="btn" id="create-contract-btn">إنشاء العقد</button>
            </div>
            <div class="card">
                <h3>العقود</h3>
                <div class="tools">
                    <input class="input" id="contract-q" placeholder="بحث..." oninput="draw()" style="width: auto; margin-bottom: 0;">
                    <button class="btn secondary" id="export-contracts-csv">CSV</button>
                    <button class="btn" id="print-contracts-pdf">طباعة PDF</button>
                </div>
                <div id="contract-list"></div>
            </div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('create-contract-btn').addEventListener('click', async () => {
        const unitId = document.getElementById('contract-unit').value;
        const customerId = document.getElementById('contract-customer').value;
        const type = document.getElementById('contract-type').value;
        const startDate = document.getElementById('contract-start-date').value;
        const endDate = document.getElementById('contract-end-date').value;
        const amount = document.getElementById('contract-amount').value.trim();
        const monthlyAmount = document.getElementById('contract-monthly-amount').value.trim();
        const deposit = document.getElementById('contract-deposit').value.trim();
        const paymentMethod = document.getElementById('contract-payment-method').value;
        const notes = document.getElementById('contract-notes').value.trim();
        
        if (!unitId || !customerId || !startDate || !amount) {
            return alert('الرجاء ملء جميع الحقول المطلوبة.');
        }

        // Check if unit is available
        const unit = unitById(unitId);
        if (unit.status !== 'متاحة') {
            return alert('هذه الوحدة غير متاحة للعقد.');
        }

        saveState();
        const newContract = {
            id: uid('CT'),
            unitId,
            customerId,
            type,
            startDate,
            endDate,
            amount: parseNumber(amount),
            monthlyAmount: parseNumber(monthlyAmount),
            deposit: parseNumber(deposit),
            paymentMethod,
            status: 'نشط',
            notes,
            createdAt: new Date().toISOString()
        };
        
        if (!state.contracts) state.contracts = [];
        state.contracts.push(newContract);
        
        // Update unit status
        unit.status = 'مباعة';
        
        // Create automatic installments if monthly amount is provided
        if (newContract.monthlyAmount && newContract.monthlyAmount > 0) {
            const installments = [];
            const startDate = new Date(newContract.startDate);
            const endDate = newContract.endDate ? new Date(newContract.endDate) : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
            
            let currentDate = new Date(startDate);
            let installmentNumber = 1;
            
            while (currentDate <= endDate) {
                const newInstallment = {
                    id: uid('I'),
                    contractId: newContract.id,
                    amount: newContract.monthlyAmount,
                    dueDate: currentDate.toISOString().slice(0, 10),
                    paymentMethod: newContract.paymentMethod,
                    paid: false,
                    penalty: 0,
                    notes: `قسط رقم ${installmentNumber}`,
                    createdAt: new Date().toISOString()
                };
                
                installments.push(newInstallment);
                
                // Move to next month
                currentDate.setMonth(currentDate.getMonth() + 1);
                installmentNumber++;
            }
            
            if (!state.installments) state.installments = [];
            state.installments.push(...installments);
            
            logAction('إنشاء أقساط تلقائية للعقد', {
                contractId: newContract.id,
                count: installments.length,
                amount: newContract.monthlyAmount
            });
        }
        
        logAction('إنشاء عقد جديد', {
            id: newContract.id,
            unitId: newContract.unitId,
            customerId: newContract.customerId,
            type: newContract.type,
            amount: newContract.amount
        });
        
        await persist();
        draw();
    });

    // Global event delegation
    view.addEventListener('click', (e) => {
        if (e.target.matches('[data-del-id]')) {
            const id = e.target.dataset.delId;
            const collection = e.target.dataset.delColl;
            delRow(collection, id);
        }
    });
}

async function delRow(coll,id) {
  const nameMap = { customers: 'العميل', units: 'الوحدة', partners: 'الشريك', unitPartners: 'ربط شريك بوحدة', contracts: 'العقد', installments: 'القسط', safes: 'الخزنة' };
  const collName = nameMap[coll] || coll;
  const itemToDelete = state[coll] ? state[coll].find(x=>x.id===id) : undefined;
  const itemName = itemToDelete?.name || itemToDelete?.code || id;
  if(confirm(`هل أنت متأكد من حذف ${collName} "${itemName}"؟ هذا الإجراء لا يمكن التراجع عنه.`)){
    saveState();
    logAction(`حذف ${collName}`, { collection: coll, id, deletedItem: JSON.stringify(itemToDelete) });
    state[coll]=state[coll].filter(x=>x.id!==id);
    await persist();
    if (coll === 'unitPartners') {
      renderUnitDetails(itemToDelete.unitId);
    } else {
      nav(coll);
    }
  }
}

async function endContract(contractId) {
    const contract = state.contracts?.find(c => c.id === contractId);
    if (!contract) return;
    
    if (confirm('هل أنت متأكد من إنهاء هذا العقد؟')) {
        saveState();
        contract.status = 'منتهي';
        contract.endDate = today();
        
        // Update unit status to available
        const unit = unitById(contract.unitId);
        if (unit) {
            unit.status = 'متاحة';
        }
        
        logAction('إنهاء عقد', {
            id: contract.id,
            unitId: contract.unitId,
            customerId: contract.customerId
        });
        
        await persist();
        renderContracts();
    }
}

// Placeholder functions for other screens
function renderBrokers() {
    let sort = { idx: 0, dir: 'asc' };

    function draw() {
        const query = (document.getElementById('broker-q')?.value || '').trim().toLowerCase();
        let list = state.brokers?.slice() || [];
        
        if (query) {
            list = list.filter(broker => {
                const searchable = `${broker.name || ''} ${broker.phone || ''} ${broker.commission || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const colsA = [a.name || '', a.phone || '', a.commission || '', a.status || ''];
            const colsB = [b.name || '', b.phone || '', b.commission || '', b.status || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(broker => [
            broker.name || '',
            broker.phone || '',
            broker.commission || '0%',
            broker.status || 'نشط',
            `<button class="btn secondary" onclick="delRow('brokers', '${broker.id}')">حذف</button>`
        ]);
        
        document.getElementById('broker-list').innerHTML = table(
            ['اسم السمسار', 'الهاتف', 'العمولة', 'الحالة', ''],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة سمسار</h3>
                <input class="input" id="broker-name" placeholder="اسم السمسار">
                <input class="input" id="broker-phone" placeholder="رقم الهاتف">
                <input class="input" id="broker-commission" placeholder="نسبة العمولة (%)">
                <select class="select" id="broker-status">
                    <option value="نشط">نشط</option>
                    <option value="موقوف">موقوف</option>
                </select>
                <textarea class="input" id="broker-notes" placeholder="ملاحظات" rows="2"></textarea>
                <button class="btn" id="add-broker-btn">حفظ</button>
            </div>
            <div class="card">
                <h3>السماسرة</h3>
                <div class="tools">
                    <input class="input" id="broker-q" placeholder="بحث..." oninput="draw()" style="width: 200px; margin-bottom: 0;">
                </div>
                <div id="broker-list"></div>
            </div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('add-broker-btn').onclick = async () => {
        const name = document.getElementById('broker-name').value.trim();
        const phone = document.getElementById('broker-phone').value.trim();
        const commission = document.getElementById('broker-commission').value.trim();
        const status = document.getElementById('broker-status').value;
        const notes = document.getElementById('broker-notes').value.trim();
        
        if (!name || !phone) {
            return alert('الرجاء إدخال اسم السمسار ورقم الهاتف.');
        }

        saveState();
        const newBroker = {
            id: uid('B'),
            name,
            phone,
            commission: parseNumber(commission),
            status,
            notes
        };
        
        if (!state.brokers) state.brokers = [];
        state.brokers.push(newBroker);
        logAction('إضافة سمسار جديد', { id: newBroker.id, name: newBroker.name });
        
        await persist();

        // Clear form
        document.getElementById('broker-name').value = '';
        document.getElementById('broker-phone').value = '';
        document.getElementById('broker-commission').value = '';
        document.getElementById('broker-notes').value = '';
        
        draw();
    };
}

function renderInstallments() {
    let sort = { idx: 0, dir: 'asc' };
    
    function draw() {
        const query = (document.getElementById('installment-q')?.value || '').trim().toLowerCase();
        let list = state.installments?.slice() || [];
        
        if (query) {
            list = list.filter(installment => {
                const contract = state.contracts?.find(c => c.id === installment.contractId);
                const unit = unitById(contract?.unitId);
                const customer = custById(contract?.customerId);
                const searchable = `${unit?.name || ''} ${customer?.name || ''} ${installment.amount || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const colsA = [a.dueDate || '', a.amount || '', a.paid ? 'مدفوع' : 'غير مدفوع', ''];
            const colsB = [b.dueDate || '', b.amount || '', b.paid ? 'مدفوع' : 'غير مدفوع', ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(installment => {
            const contract = state.contracts?.find(c => c.id === installment.contractId);
            const unit = unitById(contract?.unitId);
            const customer = custById(contract?.customerId);
            const isOverdue = !installment.paid && new Date(installment.dueDate) < new Date();
            const daysOverdue = isOverdue ? Math.floor((new Date() - new Date(installment.dueDate)) / (1000 * 60 * 60 * 24)) : 0;
            
            return [
                `${unit?.name || ''} - ${customer?.name || ''}`,
                installment.dueDate || '',
                egp(installment.amount),
                installment.paid ? '<span style="color: green;">مدفوع</span>' : 
                    isOverdue ? `<span style="color: red;">متأخر ${daysOverdue} يوم</span>` : '<span style="color: orange;">غير مدفوع</span>',
                installment.paymentDate || '-',
                egp(installment.penalty || 0),
                installment.paymentMethod || '-',
                `<button class="btn ${installment.paid ? 'secondary' : 'ok'}" onclick="toggleInstallmentPayment('${installment.id}')">
                    ${installment.paid ? 'إلغاء الدفع' : 'تسجيل الدفع'}
                </button>`
            ];
        });
        
        document.getElementById('installment-list').innerHTML = table(
            ['العقد', 'تاريخ الاستحقاق', 'المبلغ', 'الحالة', 'تاريخ الدفع', 'الغرامة', 'طريقة الدفع', 'الإجراء'],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة قسط جديد</h3>
                <select class="select" id="installment-contract">
                    <option value="">اختر العقد</option>
                    ${(state.contracts || []).filter(c => c.status === 'نشط').map(c => {
                        const unit = unitById(c.unitId);
                        const customer = custById(c.customerId);
                        return `<option value="${c.id}">${unit?.name || ''} - ${customer?.name || ''}</option>`;
                    }).join('')}
                </select>
                <input class="input" id="installment-amount" placeholder="المبلغ">
                <input class="input" id="installment-due-date" type="date">
                <select class="select" id="installment-payment-method">
                    <option value="نقداً">نقداً</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="شيك">شيك</option>
                    <option value="بطاقة ائتمان">بطاقة ائتمان</option>
                </select>
                <textarea class="input" id="installment-notes" placeholder="ملاحظات" rows="2"></textarea>
                <button class="btn" id="add-installment-btn">حفظ</button>
                
                <hr style="margin: 20px 0;">
                <h4>إنشاء أقساط تلقائية</h4>
                <select class="select" id="auto-contract">
                    <option value="">اختر العقد</option>
                    ${(state.contracts || []).filter(c => c.status === 'نشط').map(c => {
                        const unit = unitById(c.unitId);
                        const customer = custById(c.customerId);
                        return `<option value="${c.id}">${unit?.name || ''} - ${customer?.name || ''}</option>`;
                    }).join('')}
                </select>
                <input class="input" id="auto-start-date" type="date" placeholder="تاريخ أول قسط">
                <input class="input" id="auto-amount" placeholder="مبلغ كل قسط">
                <input class="input" id="auto-count" placeholder="عدد الأقساط" type="number">
                <select class="select" id="auto-frequency">
                    <option value="1">شهري</option>
                    <option value="3">ربع سنوي</option>
                    <option value="6">نصف سنوي</option>
                    <option value="12">سنوي</option>
                </select>
                <button class="btn secondary" id="create-auto-installments-btn">إنشاء أقساط تلقائية</button>
            </div>
            <div class="card">
                <h3>الأقساط</h3>
                <div class="tools">
                    <input class="input" id="installment-q" placeholder="بحث..." oninput="draw()" style="width: 200px; margin-bottom: 0;">
                </div>
                <div id="installment-list"></div>
            </div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('add-installment-btn').onclick = async () => {
        const contractId = document.getElementById('installment-contract').value;
        const amount = document.getElementById('installment-amount').value.trim();
        const dueDate = document.getElementById('installment-due-date').value;
        const paymentMethod = document.getElementById('installment-payment-method').value;
        const notes = document.getElementById('installment-notes').value.trim();
        
        if (!contractId || !amount || !dueDate) {
            return alert('الرجاء ملء جميع الحقول المطلوبة.');
        }

        saveState();
        const newInstallment = {
            id: uid('I'),
            contractId,
            amount: parseNumber(amount),
            dueDate,
            paymentMethod,
            paid: false,
            penalty: 0,
            notes,
            createdAt: new Date().toISOString()
        };
        
        if (!state.installments) state.installments = [];
        state.installments.push(newInstallment);
        logAction('إضافة قسط جديد', { 
            id: newInstallment.id, 
            contractId: newInstallment.contractId,
            amount: newInstallment.amount 
        });
        
        await persist();

        // Clear form
        document.getElementById('installment-contract').value = '';
        document.getElementById('installment-amount').value = '';
        document.getElementById('installment-due-date').value = '';
        document.getElementById('installment-payment-method').value = 'نقداً';
        document.getElementById('installment-notes').value = '';
        
        draw();
    };

    // Auto create installments
    document.getElementById('create-auto-installments-btn').onclick = async () => {
        const contractId = document.getElementById('auto-contract').value;
        const startDate = document.getElementById('auto-start-date').value;
        const amount = document.getElementById('auto-amount').value.trim();
        const count = parseInt(document.getElementById('auto-count').value);
        const frequency = parseInt(document.getElementById('auto-frequency').value);
        
        if (!contractId || !startDate || !amount || !count) {
            return alert('الرجاء ملء جميع الحقول المطلوبة.');
        }

        if (count <= 0 || count > 120) {
            return alert('عدد الأقساط يجب أن يكون بين 1 و 120.');
        }

        saveState();
        const installments = [];
        
        for (let i = 0; i < count; i++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + (i * frequency));
            
            const newInstallment = {
                id: uid('I'),
                contractId,
                amount: parseNumber(amount),
                dueDate: dueDate.toISOString().slice(0, 10),
                paymentMethod: 'نقداً',
                paid: false,
                penalty: 0,
                notes: `قسط رقم ${i + 1}`,
                createdAt: new Date().toISOString()
            };
            
            installments.push(newInstallment);
        }
        
        if (!state.installments) state.installments = [];
        state.installments.push(...installments);
        
        logAction('إنشاء أقساط تلقائية', { 
            contractId,
            count: installments.length,
            amount: parseNumber(amount)
        });
        
        await persist();

        // Clear form
        document.getElementById('auto-contract').value = '';
        document.getElementById('auto-start-date').value = '';
        document.getElementById('auto-amount').value = '';
        document.getElementById('auto-count').value = '';
        
        draw();
        alert(`تم إنشاء ${count} قسط بنجاح.`);
    };
}

function renderVouchers() {
    let sort = { idx: 0, dir: 'asc' };

    function draw() {
        const query = (document.getElementById('voucher-q')?.value || '').trim().toLowerCase();
        let list = state.vouchers?.slice() || [];
        
        if (query) {
            list = list.filter(voucher => {
                const searchable = `${voucher.type || ''} ${voucher.description || ''} ${voucher.amount || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const colsA = [a.date || '', a.type || '', a.amount || '', a.safeId || ''];
            const colsB = [b.date || '', b.type || '', b.amount || '', b.safeId || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(voucher => {
            const safe = state.safes?.find(s => s.id === voucher.safeId);
            return [
                voucher.date || '',
                voucher.type || '',
                voucher.description || '',
                egp(voucher.amount),
                safe?.name || '',
                `<button class="btn secondary" onclick="delRow('vouchers', '${voucher.id}')">حذف</button>`
            ];
        });
        
        document.getElementById('voucher-list').innerHTML = table(
            ['التاريخ', 'النوع', 'الوصف', 'المبلغ', 'الخزنة', ''],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة سند جديد</h3>
                <select class="select" id="voucher-type">
                    <option value="إيداع">إيداع</option>
                    <option value="سحب">سحب</option>
                    <option value="تحويل">تحويل</option>
                </select>
                <select class="select" id="voucher-safe">
                    <option value="">اختر الخزنة</option>
                    ${(state.safes || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                </select>
                <input class="input" id="voucher-amount" placeholder="المبلغ">
                <input class="input" id="voucher-date" type="date">
                <textarea class="input" id="voucher-description" placeholder="الوصف" rows="2"></textarea>
                <button class="btn" id="add-voucher-btn">حفظ</button>
            </div>
            <div class="card">
                <h3>السندات</h3>
                <div class="tools">
                    <input class="input" id="voucher-q" placeholder="بحث..." oninput="draw()" style="width: 200px; margin-bottom: 0;">
                </div>
                <div id="voucher-list"></div>
            </div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('add-voucher-btn').onclick = async () => {
        const type = document.getElementById('voucher-type').value;
        const safeId = document.getElementById('voucher-safe').value;
        const amount = document.getElementById('voucher-amount').value.trim();
        const date = document.getElementById('voucher-date').value;
        const description = document.getElementById('voucher-description').value.trim();
        
        if (!safeId || !amount || !date) {
            return alert('الرجاء ملء جميع الحقول المطلوبة.');
        }

        saveState();
        const newVoucher = {
            id: uid('V'),
            type,
            safeId,
            amount: parseNumber(amount),
            date,
            description
        };
        
        if (!state.vouchers) state.vouchers = [];
        state.vouchers.push(newVoucher);
        logAction('إضافة سند جديد', { id: newVoucher.id, type: newVoucher.type, amount: newVoucher.amount });
        
        await persist();

        // Clear form
        document.getElementById('voucher-type').value = 'إيداع';
        document.getElementById('voucher-safe').value = '';
        document.getElementById('voucher-amount').value = '';
        document.getElementById('voucher-date').value = '';
        document.getElementById('voucher-description').value = '';
        
        draw();
    };
}

function renderPartners() {
    let sort = { idx: 0, dir: 'asc' };

    function draw() {
        const query = (document.getElementById('partner-q')?.value || '').trim().toLowerCase();
        let list = state.partners?.slice() || [];
        
        if (query) {
            list = list.filter(partner => {
                const searchable = `${partner.name || ''} ${partner.phone || ''} ${partner.share || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const colsA = [a.name || '', a.phone || '', a.share || '', a.status || ''];
            const colsB = [b.name || '', b.phone || '', b.share || '', b.status || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(partner => [
            partner.name || '',
            partner.phone || '',
            partner.share || '0%',
            partner.status || 'نشط',
            `<button class="btn secondary" onclick="delRow('partners', '${partner.id}')">حذف</button>`
        ]);
        
        document.getElementById('partner-list').innerHTML = table(
            ['اسم الشريك', 'الهاتف', 'نسبة المشاركة', 'الحالة', ''],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة شريك</h3>
                <input class="input" id="partner-name" placeholder="اسم الشريك">
                <input class="input" id="partner-phone" placeholder="رقم الهاتف">
                <input class="input" id="partner-share" placeholder="نسبة المشاركة (%)">
                <select class="select" id="partner-status">
                    <option value="نشط">نشط</option>
                    <option value="موقوف">موقوف</option>
                </select>
                <textarea class="input" id="partner-notes" placeholder="ملاحظات" rows="2"></textarea>
                <button class="btn" id="add-partner-btn">حفظ</button>
            </div>
            <div class="card">
                <h3>الشركاء</h3>
                <div class="tools">
                    <input class="input" id="partner-q" placeholder="بحث..." oninput="draw()" style="width: 200px; margin-bottom: 0;">
                </div>
                <div id="partner-list"></div>
            </div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('add-partner-btn').onclick = async () => {
        const name = document.getElementById('partner-name').value.trim();
        const phone = document.getElementById('partner-phone').value.trim();
        const share = document.getElementById('partner-share').value.trim();
        const status = document.getElementById('partner-status').value;
        const notes = document.getElementById('partner-notes').value.trim();
        
        if (!name || !phone) {
            return alert('الرجاء إدخال اسم الشريك ورقم الهاتف.');
        }

        saveState();
        const newPartner = {
            id: uid('P'),
            name,
            phone,
            share: parseNumber(share),
            status,
            notes
        };
        
        if (!state.partners) state.partners = [];
        state.partners.push(newPartner);
        logAction('إضافة شريك جديد', { id: newPartner.id, name: newPartner.name });
        
        await persist();

        // Clear form
        document.getElementById('partner-name').value = '';
        document.getElementById('partner-phone').value = '';
        document.getElementById('partner-share').value = '';
        document.getElementById('partner-notes').value = '';
        
        draw();
    };
}

function renderTreasury() {
    const totalBalance = state.safes?.reduce((sum, safe) => sum + (safe.balance || 0), 0) || 0;
    const totalDeposits = state.vouchers?.filter(v => v.type === 'إيداع').reduce((sum, v) => sum + (v.amount || 0), 0) || 0;
    const totalWithdrawals = state.vouchers?.filter(v => v.type === 'سحب').reduce((sum, v) => sum + (v.amount || 0), 0) || 0;
    
    view.innerHTML = `
        <div class="grid grid-4" style="margin-bottom: 20px;">
            <div class="card">
                <h3>إجمالي الرصيد</h3>
                <div style="font-size: 24px; font-weight: bold; color: #007bff;">${egp(totalBalance)}</div>
            </div>
            <div class="card">
                <h3>إجمالي الإيداعات</h3>
                <div style="font-size: 24px; font-weight: bold; color: #28a745;">${egp(totalDeposits)}</div>
            </div>
            <div class="card">
                <h3>إجمالي السحوبات</h3>
                <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${egp(totalWithdrawals)}</div>
            </div>
            <div class="card">
                <h3>عدد الخزائن</h3>
                <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${state.safes?.length || 0}</div>
            </div>
        </div>
        
        <div class="grid grid-2">
            <div class="card">
                <h3>إضافة خزنة جديدة</h3>
                <input class="input" id="safe-name" placeholder="اسم الخزنة">
                <input class="input" id="safe-balance" placeholder="الرصيد الافتتاحي">
                <textarea class="input" id="safe-notes" placeholder="ملاحظات" rows="2"></textarea>
                <button class="btn" id="add-safe-btn">حفظ</button>
            </div>
            <div class="card">
                <h3>الخزائن</h3>
                <div id="safe-list">
                    ${(state.safes || []).map(safe => `
                        <div class="card" style="margin-bottom: 10px;">
                            <h4>${safe.name}</h4>
                            <div style="font-size: 20px; font-weight: bold;">${egp(safe.balance || 0)}</div>
                            <button class="btn secondary" onclick="editSafe('${safe.id}')">تعديل</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('add-safe-btn').onclick = async () => {
        const name = document.getElementById('safe-name').value.trim();
        const balance = document.getElementById('safe-balance').value.trim();
        const notes = document.getElementById('safe-notes').value.trim();
        
        if (!name) {
            return alert('الرجاء إدخال اسم الخزنة.');
        }

        saveState();
        const newSafe = {
            id: uid('S'),
            name,
            balance: parseNumber(balance),
            notes
        };
        
        if (!state.safes) state.safes = [];
        state.safes.push(newSafe);
        logAction('إضافة خزنة جديدة', { id: newSafe.id, name: newSafe.name });
        
        await persist();

        // Clear form
        document.getElementById('safe-name').value = '';
        document.getElementById('safe-balance').value = '';
        document.getElementById('safe-notes').value = '';
        
        // Refresh the page
        renderTreasury();
    };
}

function renderReports() {
    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>التقارير التفصيلية</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn" onclick="generateReport('units')">تقرير الوحدات</button>
                    <button class="btn" onclick="generateReport('customers')">تقرير العملاء</button>
                    <button class="btn" onclick="generateReport('contracts')">تقرير العقود</button>
                    <button class="btn" onclick="generateReport('installments')">تقرير الأقساط</button>
                    <button class="btn" onclick="generateReport('treasury')">تقرير الخزينة</button>
                    <button class="btn" onclick="generateReport('partners')">تقرير الشركاء</button>
                </div>
            </div>
            <div class="card">
                <h3>التقارير السريعة</h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn secondary" onclick="generateQuickReport('overdue')">الأقساط المتأخرة</button>
                    <button class="btn secondary" onclick="generateQuickReport('revenue')">الإيرادات الشهرية</button>
                    <button class="btn secondary" onclick="generateQuickReport('units-status')">حالة الوحدات</button>
                    <button class="btn secondary" onclick="generateQuickReport('contracts-summary')">ملخص العقود</button>
                </div>
            </div>
        </div>
    `;
}

function generateReport(type) {
    switch(type) {
        case 'units':
            generateUnitsReport();
            break;
        case 'customers':
            generateCustomersReport();
            break;
        case 'contracts':
            generateContractsReport();
            break;
        case 'installments':
            generateInstallmentsReport();
            break;
        case 'treasury':
            generateTreasuryReport();
            break;
        case 'partners':
            generatePartnersReport();
            break;
        default:
            alert('نوع التقرير غير معروف');
    }
}

function generateQuickReport(type) {
    switch(type) {
        case 'overdue':
            generateOverdueReport();
            break;
        case 'revenue':
            generateRevenueReport();
            break;
        case 'units-status':
            generateUnitsStatusReport();
            break;
        case 'contracts-summary':
            generateContractsSummaryReport();
            break;
        default:
            alert('نوع التقرير السريع غير معروف');
    }
}

function generateUnitsReport() {
    const units = state.units || [];
    const html = `
        <h1>تقرير الوحدات العقارية</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>اسم الوحدة</th>
                    <th>الرمز</th>
                    <th>العمارة</th>
                    <th>الدور</th>
                    <th>المساحة</th>
                    <th>السعر</th>
                    <th>الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${units.map(unit => `
                    <tr>
                        <td>${unit.name || ''}</td>
                        <td>${unit.code || ''}</td>
                        <td>${unit.building || ''}</td>
                        <td>${unit.floor || ''}</td>
                        <td>${unit.area || 0} م²</td>
                        <td>${egp(unit.price)}</td>
                        <td>${unit.status || ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير الوحدات العقارية', html);
}

function generateCustomersReport() {
    const customers = state.customers || [];
    const html = `
        <h1>تقرير العملاء</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>اسم العميل</th>
                    <th>الهاتف</th>
                    <th>الرقم القومي</th>
                    <th>العنوان</th>
                    <th>الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${customers.map(customer => `
                    <tr>
                        <td>${customer.name || ''}</td>
                        <td>${customer.phone || ''}</td>
                        <td>${customer.nationalId || ''}</td>
                        <td>${customer.address || ''}</td>
                        <td>${customer.status || ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير العملاء', html);
}

function generateContractsReport() {
    const contracts = state.contracts || [];
    const html = `
        <h1>تقرير العقود</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>الوحدة</th>
                    <th>العميل</th>
                    <th>النوع</th>
                    <th>تاريخ البداية</th>
                    <th>قيمة العقد</th>
                    <th>الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${contracts.map(contract => {
                    const unit = unitById(contract.unitId);
                    const customer = custById(contract.customerId);
                    return `
                        <tr>
                            <td>${unit?.name || ''}</td>
                            <td>${customer?.name || ''}</td>
                            <td>${contract.type || ''}</td>
                            <td>${contract.startDate || ''}</td>
                            <td>${egp(contract.amount)}</td>
                            <td>${contract.status || ''}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير العقود', html);
}

function generateInstallmentsReport() {
    const installments = state.installments || [];
    const html = `
        <h1>تقرير الأقساط</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>العقد</th>
                    <th>المبلغ</th>
                    <th>تاريخ الاستحقاق</th>
                    <th>الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${installments.map(installment => {
                    const contract = state.contracts?.find(c => c.id === installment.contractId);
                    const unit = unitById(contract?.unitId);
                    const customer = custById(contract?.customerId);
                    return `
                        <tr>
                            <td>${unit?.name || ''} - ${customer?.name || ''}</td>
                            <td>${egp(installment.amount)}</td>
                            <td>${installment.dueDate || ''}</td>
                            <td>${installment.paid ? 'مدفوع' : 'غير مدفوع'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير الأقساط', html);
}

function generateTreasuryReport() {
    const vouchers = state.vouchers || [];
    const safes = state.safes || [];
    const html = `
        <h1>تقرير الخزينة</h1>
        <h2>الخزائن</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>اسم الخزنة</th>
                    <th>الرصيد</th>
                </tr>
            </thead>
            <tbody>
                ${safes.map(safe => `
                    <tr>
                        <td>${safe.name || ''}</td>
                        <td>${egp(safe.balance)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <h2>المعاملات المالية</h2>
        <table class="table">
            <thead>
                <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>الوصف</th>
                    <th>المبلغ</th>
                    <th>الخزنة</th>
                </tr>
            </thead>
            <tbody>
                ${vouchers.map(voucher => {
                    const safe = safes.find(s => s.id === voucher.safeId);
                    return `
                        <tr>
                            <td>${voucher.date || ''}</td>
                            <td>${voucher.type || ''}</td>
                            <td>${voucher.description || ''}</td>
                            <td>${egp(voucher.amount)}</td>
                            <td>${safe?.name || ''}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير الخزينة', html);
}

function generatePartnersReport() {
    const partners = state.partners || [];
    const html = `
        <h1>تقرير الشركاء</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>اسم الشريك</th>
                    <th>الهاتف</th>
                    <th>نسبة المشاركة</th>
                    <th>الحالة</th>
                </tr>
            </thead>
            <tbody>
                ${partners.map(partner => `
                    <tr>
                        <td>${partner.name || ''}</td>
                        <td>${partner.phone || ''}</td>
                        <td>${partner.share || 0}%</td>
                        <td>${partner.status || ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير الشركاء', html);
}

function generateOverdueReport() {
    const overdueInstallments = state.installments?.filter(i => !i.paid && new Date(i.dueDate) < new Date()) || [];
    const html = `
        <h1>تقرير الأقساط المتأخرة</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>العقد</th>
                    <th>المبلغ</th>
                    <th>تاريخ الاستحقاق</th>
                    <th>أيام التأخير</th>
                </tr>
            </thead>
            <tbody>
                ${overdueInstallments.map(installment => {
                    const contract = state.contracts?.find(c => c.id === installment.contractId);
                    const unit = unitById(contract?.unitId);
                    const customer = custById(contract?.customerId);
                    const daysOverdue = Math.floor((new Date() - new Date(installment.dueDate)) / (1000 * 60 * 60 * 24));
                    return `
                        <tr>
                            <td>${unit?.name || ''} - ${customer?.name || ''}</td>
                            <td>${egp(installment.amount)}</td>
                            <td>${installment.dueDate || ''}</td>
                            <td>${daysOverdue} يوم</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير الأقساط المتأخرة', html);
}

function generateRevenueReport() {
    const installments = state.installments || [];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyRevenue = installments
        .filter(i => i.paid && new Date(i.dueDate).getMonth() === currentMonth && new Date(i.dueDate).getFullYear() === currentYear)
        .reduce((sum, i) => sum + (i.amount || 0), 0);
    
    const html = `
        <h1>تقرير الإيرادات الشهرية</h1>
        <h2>إيرادات ${currentMonth + 1}/${currentYear}</h2>
        <p>إجمالي الإيرادات: ${egp(monthlyRevenue)}</p>
    `;
    printHTML('تقرير الإيرادات الشهرية', html);
}

function generateUnitsStatusReport() {
    const units = state.units || [];
    const statusCounts = units.reduce((acc, unit) => {
        acc[unit.status] = (acc[unit.status] || 0) + 1;
        return acc;
    }, {});
    
    const html = `
        <h1>تقرير حالة الوحدات</h1>
        <table class="table">
            <thead>
                <tr>
                    <th>الحالة</th>
                    <th>العدد</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(statusCounts).map(([status, count]) => `
                    <tr>
                        <td>${status}</td>
                        <td>${count}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    printHTML('تقرير حالة الوحدات', html);
}

function generateContractsSummaryReport() {
    const contracts = state.contracts || [];
    const activeContracts = contracts.filter(c => c.status === 'نشط').length;
    const totalValue = contracts.reduce((sum, c) => sum + (c.amount || 0), 0);
    
    const html = `
        <h1>ملخص العقود</h1>
        <p>إجمالي العقود: ${contracts.length}</p>
        <p>العقود النشطة: ${activeContracts}</p>
        <p>إجمالي قيمة العقود: ${egp(totalValue)}</p>
    `;
    printHTML('ملخص العقود', html);
}

function renderPartnerDebts() {
    view.innerHTML = '<div class="card"><h2>ديون الشركاء</h2><p>قريباً...</p></div>';
}

function renderAuditLog() {
    let sort = { idx: 0, dir: 'desc' }; // Default to newest first

    function draw() {
        const query = (document.getElementById('audit-q')?.value || '').trim().toLowerCase();
        let list = state.auditLog?.slice() || [];
        
        if (query) {
            list = list.filter(log => {
                const searchable = `${log.description || ''} ${log.timestamp || ''}`.toLowerCase();
                return searchable.includes(query);
            });
        }
        
        list.sort((a, b) => {
            const colsA = [a.timestamp || '', a.description || ''];
            const colsB = [b.timestamp || '', b.description || ''];
            return (colsA[sort.idx] + '').localeCompare(colsB[sort.idx] + '') * (sort.dir === 'asc' ? 1 : -1);
        });
        
        const rows = list.map(log => [
            new Date(log.timestamp).toLocaleString('ar-EG'),
            log.description || '',
            JSON.stringify(log.details || {}).substring(0, 50) + '...'
        ]);
        
        document.getElementById('audit-list').innerHTML = table(
            ['التاريخ والوقت', 'الوصف', 'التفاصيل'],
            rows,
            sort,
            (newSort) => {
                sort = newSort;
                draw();
            }
        );
    }

    view.innerHTML = `
        <div class="card">
            <h2>سجل التغييرات</h2>
            <div class="tools">
                <input class="input" id="audit-q" placeholder="بحث..." oninput="draw()" style="width: 200px; margin-bottom: 0;">
                <button class="btn" id="clear-audit-btn">مسح السجل</button>
            </div>
            <div id="audit-list"></div>
        </div>`;

    draw();

    // Event Listeners
    document.getElementById('clear-audit-btn').onclick = async () => {
        if (confirm('هل أنت متأكد من مسح سجل التغييرات؟')) {
            saveState();
            state.auditLog = [];
            await persist();
            draw();
        }
    };
}

function renderBackup() {
    view.innerHTML = `
        <div class="grid grid-2">
            <div class="card">
                <h3>تصدير البيانات</h3>
                <p>قم بإنشاء نسخة احتياطية من جميع البيانات</p>
                <button class="btn" id="export-backup-btn">تصدير البيانات</button>
                <button class="btn secondary" id="export-csv-btn">تصدير CSV</button>
            </div>
            <div class="card">
                <h3>استيراد البيانات</h3>
                <p>استعادة البيانات من ملف نسخة احتياطية</p>
                <label class="btn secondary">
                    <input type="file" id="import-backup-input" accept=".json" style="display:none">
                    اختيار ملف
                </label>
                <button class="btn" id="import-backup-btn" disabled>استيراد البيانات</button>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <h3>إحصائيات البيانات</h3>
            <div class="grid grid-4">
                <div>العملاء: ${state.customers?.length || 0}</div>
                <div>الوحدات: ${state.units?.length || 0}</div>
                <div>العقود: ${state.contracts?.length || 0}</div>
                <div>الأقساط: ${state.installments?.length || 0}</div>
            </div>
        </div>
    `;

    // Event Listeners
    document.getElementById('export-backup-btn').onclick = () => {
        const dataStr = JSON.stringify(state, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `estate-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    document.getElementById('export-csv-btn').onclick = () => {
        // Export all data as CSV
        const csvData = exportAllDataAsCSV();
        const dataBlob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `estate-data-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    document.getElementById('import-backup-input').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('import-backup-btn').disabled = false;
        }
    };

    document.getElementById('import-backup-btn').onclick = async () => {
        const file = document.getElementById('import-backup-input').files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (confirm('سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟')) {
                    saveState();
                    Object.assign(state, importedData);
                    await persist();
                    alert('تم استيراد البيانات بنجاح');
                    location.reload();
                }
            } catch (error) {
                alert('خطأ في قراءة الملف');
            }
        };
        reader.readAsText(file);
    };
}

function exportAllDataAsCSV() {
    const csvData = [];
    
    // Add customers
    csvData.push('العملاء');
    csvData.push('الاسم,الهاتف,الرقم القومي,العنوان,الحالة');
    (state.customers || []).forEach(customer => {
        csvData.push(`${customer.name || ''},${customer.phone || ''},${customer.nationalId || ''},${customer.address || ''},${customer.status || ''}`);
    });
    csvData.push('');
    
    // Add units
    csvData.push('الوحدات');
    csvData.push('الاسم,الرمز,العمارة,الدور,المساحة,السعر,الحالة');
    (state.units || []).forEach(unit => {
        csvData.push(`${unit.name || ''},${unit.code || ''},${unit.building || ''},${unit.floor || ''},${unit.area || ''},${unit.price || ''},${unit.status || ''}`);
    });
    csvData.push('');
    
    // Add contracts
    csvData.push('العقود');
    csvData.push('الوحدة,العميل,النوع,تاريخ البداية,قيمة العقد,الحالة');
    (state.contracts || []).forEach(contract => {
        const unit = unitById(contract.unitId);
        const customer = custById(contract.customerId);
        csvData.push(`${unit?.name || ''},${customer?.name || ''},${contract.type || ''},${contract.startDate || ''},${contract.amount || ''},${contract.status || ''}`);
    });
    
    return csvData.join('\n');
}

function renderUnitDetails(unitId) {
    view.innerHTML = '<div class="card"><h2>تفاصيل الوحدة</h2><p>قريباً...</p></div>';
}

function renderPartnerGroupDetails() {
    view.innerHTML = '<div class="card"><h2>تفاصيل مجموعة الشركاء</h2><p>قريباً...</p></div>';
}

function renderBrokerDetails(brokerId) {
    view.innerHTML = '<div class="card"><h2>تفاصيل السمسار</h2><p>قريباً...</p></div>';
}

function renderPartnerDetails(partnerId) {
    view.innerHTML = '<div class="card"><h2>تفاصيل الشريك</h2><p>قريباً...</p></div>';
}

function renderCustomerDetails(customerId) {
    view.innerHTML = '<div class="card"><h2>تفاصيل العميل</h2><p>قريباً...</p></div>';
}

function renderUnitEdit(unitId) {
    view.innerHTML = '<div class="card"><h2>تعديل الوحدة</h2><p>قريباً...</p></div>';
}

async function toggleInstallmentPayment(installmentId) {
    const installment = state.installments?.find(i => i.id === installmentId);
    if (!installment) return;

    if (installment.paid) {
        // Cancel payment
        if (confirm('هل أنت متأكد من إلغاء الدفع؟')) {
            saveState();
            installment.paid = false;
            installment.paymentDate = null;
            installment.penalty = 0;
            logAction('إلغاء دفع قسط', { 
                id: installment.id, 
                amount: installment.amount 
            });
            await persist();
            renderInstallments();
        }
    } else {
        // Record payment
        const paymentDate = prompt('تاريخ الدفع (YYYY-MM-DD):', today());
        const penalty = prompt('الغرامة (إذا وجدت):', '0');
        const paymentMethod = prompt('طريقة الدفع:', installment.paymentMethod || 'نقداً');
        
        if (paymentDate) {
            saveState();
            installment.paid = true;
            installment.paymentDate = paymentDate;
            installment.penalty = parseNumber(penalty);
            installment.paymentMethod = paymentMethod;
            logAction('تسجيل دفع قسط', { 
                id: installment.id, 
                amount: installment.amount,
                paymentDate,
                penalty: installment.penalty
            });
            await persist();
            renderInstallments();
        }
    }
}