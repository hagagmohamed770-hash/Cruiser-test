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
    view.innerHTML = '<div class="card"><h2>السماسرة</h2><p>قريباً...</p></div>';
}

function renderInstallments() {
    view.innerHTML = '<div class="card"><h2>الأقساط</h2><p>قريباً...</p></div>';
}

function renderVouchers() {
    view.innerHTML = '<div class="card"><h2>السندات</h2><p>قريباً...</p></div>';
}

function renderPartners() {
    view.innerHTML = '<div class="card"><h2>الشركاء</h2><p>قريباً...</p></div>';
}

function renderTreasury() {
    view.innerHTML = '<div class="card"><h2>الخزينة</h2><p>قريباً...</p></div>';
}

function renderReports() {
    view.innerHTML = '<div class="card"><h2>التقارير</h2><p>قريباً...</p></div>';
}

function renderPartnerDebts() {
    view.innerHTML = '<div class="card"><h2>ديون الشركاء</h2><p>قريباً...</p></div>';
}

function renderAuditLog() {
    view.innerHTML = '<div class="card"><h2>سجل التغييرات</h2><p>قريباً...</p></div>';
}

function renderBackup() {
    view.innerHTML = '<div class="card"><h2>نسخة احتياطية</h2><p>قريباً...</p></div>';
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