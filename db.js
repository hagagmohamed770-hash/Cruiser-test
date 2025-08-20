/* Database operations for the old system */

const OBJECT_STORES = ['customers', 'units', 'contracts', 'installments', 'partners', 'brokers', 'vouchers', 'safes', 'partnerDebts', 'auditLog', 'unitPartners', 'settings', 'keyval'];

let db = null;

async function openDB() {
    if (db) return db;
    
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('estate_pro_final_v3', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            OBJECT_STORES.forEach(storeName => {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            });
        };
    });
}

async function getKeyVal(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['keyval'], 'readonly');
        const store = transaction.objectStore('keyval');
        const request = store.get(key);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result?.value);
    });
}

async function setKeyVal(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['keyval'], 'readwrite');
        const store = transaction.objectStore('keyval');
        const request = store.put({ id: key, value });
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
