const DB_NAME = 'estate_pro_db';
const DB_VERSION = 1;
let db;

const OBJECT_STORES = [
    'customers', 'units', 'partners', 'unitPartners', 'contracts', 'installments',
    'partnerDebts', 'safes', 'transfers', 'auditLog', 'vouchers', 'brokerDues',
    'brokers', 'partnerGroups', 'settings', 'keyval' // 'keyval' for misc data like migration status
];

function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject('Database error: ' + event.target.error);
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = event.target.result;
            console.log('Running onupgradeneeded');

            OBJECT_STORES.forEach(storeName => {
                if (!dbInstance.objectStoreNames.contains(storeName)) {
                    if (storeName === 'settings' || storeName === 'keyval') {
                        // For stores that will hold single objects or key-value pairs
                        dbInstance.createObjectStore(storeName, { keyPath: 'key' });
                    } else {
                        // For stores that hold arrays of objects with a unique 'id'
                        dbInstance.createObjectStore(storeName, { keyPath: 'id' });
                    }
                    console.log(`Object store created: ${storeName}`);
                }
            });
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('Database opened successfully.');
            resolve(db);
        };
    });
}

// Generic function to get all items from a store
function getAll(storeName) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                console.error(`Error getting all from ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        }).catch(reject);
    });
}

// Generic function to put (add/update) an item in a store
function put(storeName, item) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = (event) => {
                console.error(`Error putting item in ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        }).catch(reject);
    });
}

// Function to bulk put items in a store
function bulkPut(storeName, items) {
    return new Promise((resolve, reject) => {
        if (!items || items.length === 0) {
            return resolve();
        }
        openDB().then(db => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            let promises = items.map(item => {
                return new Promise((resolveItem, rejectItem) => {
                    const request = store.put(item);
                    request.onsuccess = () => resolveItem();
                    request.onerror = (e) => rejectItem(e.target.error);
                });
            });

            Promise.all(promises)
                .then(() => resolve())
                .catch(err => {
                    console.error(`Error in bulk put for ${storeName}:`, err);
                    transaction.abort(); // Abort transaction on error
                    reject(err);
                });

        }).catch(reject);
    });
}

// Generic function to delete an item from a store
function deleteItem(storeName, key) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                console.error(`Error deleting item from ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        }).catch(reject);
    });
}

// Function to get a single value from the keyval store
async function getKeyVal(key) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction('keyval', 'readonly');
            const store = transaction.objectStore('keyval');
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result ? request.result.value : undefined);
            };
            request.onerror = (event) => {
                reject(event.target.error);
            };
        }).catch(reject);
    });
}

// Function to set a single value in the keyval store
async function setKeyVal(key, value) {
    return put('keyval', { key, value });
}
