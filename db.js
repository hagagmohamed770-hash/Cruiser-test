/*
 * Database Configuration and Operations
 * Real Estate Management App
 * Author: Jules
 * Date: 2025-08-19
 * Description: IndexedDB operations for the real estate management application
 */

// ===== DATABASE CONFIGURATION =====
const DB_NAME = 'estate_pro_db';
const DB_VERSION = 1;
let db;

// Object stores for different data types
const OBJECT_STORES = [
    'customers',      // Customer information
    'units',          // Property units
    'partners',       // Business partners
    'unitPartners',   // Unit-partner relationships
    'contracts',      // Rental/sale contracts
    'installments',   // Payment installments
    'partnerDebts',   // Partner debt tracking
    'safes',          // Treasury safes
    'transfers',      // Money transfers
    'auditLog',       // System audit trail
    'vouchers',       // Financial vouchers
    'brokerDues',     // Broker commission tracking
    'brokers',        // Real estate brokers
    'partnerGroups',  // Partner groupings
    'settings',       // Application settings
    'keyval'          // Key-value storage for misc data
];

// ===== DATABASE CONNECTION =====
function openDB() {
    return new Promise((resolve, reject) => {
        // Return existing connection if available
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
            console.log('Running database upgrade...');

            OBJECT_STORES.forEach(storeName => {
                if (!dbInstance.objectStoreNames.contains(storeName)) {
                    if (storeName === 'settings' || storeName === 'keyval') {
                        // For stores that hold single objects or key-value pairs
                        dbInstance.createObjectStore(storeName, { keyPath: 'key' });
                    } else {
                        // For stores that hold arrays of objects with unique 'id'
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

// ===== GENERIC DATABASE OPERATIONS =====

/**
 * Get all items from a specific store
 * @param {string} storeName - Name of the object store
 * @returns {Promise<Array>} Array of items from the store
 */
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

/**
 * Add or update an item in a store
 * @param {string} storeName - Name of the object store
 * @param {Object} item - Item to add/update
 * @returns {Promise<any>} Result of the operation
 */
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

/**
 * Bulk insert/update multiple items in a store
 * @param {string} storeName - Name of the object store
 * @param {Array} items - Array of items to insert/update
 * @returns {Promise<void>}
 */
function bulkPut(storeName, items) {
    return new Promise((resolve, reject) => {
        if (!items || items.length === 0) {
            return resolve();
        }
        
        openDB().then(db => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            const promises = items.map(item => {
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

/**
 * Delete an item from a store
 * @param {string} storeName - Name of the object store
 * @param {string|number} key - Key of the item to delete
 * @returns {Promise<void>}
 */
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

// ===== KEY-VALUE STORE OPERATIONS =====

/**
 * Get a value from the keyval store
 * @param {string} key - Key to retrieve
 * @returns {Promise<any>} Value associated with the key
 */
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

/**
 * Set a value in the keyval store
 * @param {string} key - Key to set
 * @param {any} value - Value to store
 * @returns {Promise<any>} Result of the operation
 */
async function setKeyVal(key, value) {
    return put('keyval', { key, value });
}

// ===== UTILITY FUNCTIONS =====

/**
 * Clear all data from a specific store
 * @param {string} storeName - Name of the object store
 * @returns {Promise<void>}
 */
function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        openDB().then(db => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                console.error(`Error clearing store ${storeName}:`, event.target.error);
                reject(event.target.error);
            };
        }).catch(reject);
    });
}

/**
 * Get database statistics
 * @returns {Promise<Object>} Statistics about the database
 */
async function getDatabaseStats() {
    const stats = {};
    
    for (const storeName of OBJECT_STORES) {
        try {
            const items = await getAll(storeName);
            stats[storeName] = items.length;
        } catch (error) {
            console.error(`Error getting stats for ${storeName}:`, error);
            stats[storeName] = 'error';
        }
    }
    
    return stats;
}

/**
 * Export all data from the database
 * @returns {Promise<Object>} All data from all stores
 */
async function exportAllData() {
    const exportData = {};
    
    for (const storeName of OBJECT_STORES) {
        try {
            exportData[storeName] = await getAll(storeName);
        } catch (error) {
            console.error(`Error exporting data from ${storeName}:`, error);
            exportData[storeName] = [];
        }
    }
    
    return exportData;
}

/**
 * Import data into the database
 * @param {Object} data - Data to import
 * @returns {Promise<void>}
 */
async function importData(data) {
    for (const [storeName, items] of Object.entries(data)) {
        if (OBJECT_STORES.includes(storeName) && Array.isArray(items)) {
            try {
                await bulkPut(storeName, items);
                console.log(`Imported ${items.length} items to ${storeName}`);
            } catch (error) {
                console.error(`Error importing data to ${storeName}:`, error);
                throw error;
            }
        }
    }
}

// ===== ERROR HANDLING =====

/**
 * Handle database errors gracefully
 * @param {Error} error - The error that occurred
 * @param {string} operation - Description of the operation that failed
 */
function handleDatabaseError(error, operation) {
    console.error(`Database error during ${operation}:`, error);
    
    // Log to audit trail if available
    if (typeof logAction === 'function') {
        logAction(`خطأ في قاعدة البيانات: ${operation}`, {
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// ===== EXPORT FUNCTIONS =====
// Make functions available globally for use in app.js
window.openDB = openDB;
window.getAll = getAll;
window.put = put;
window.bulkPut = bulkPut;
window.deleteItem = deleteItem;
window.getKeyVal = getKeyVal;
window.setKeyVal = setKeyVal;
window.clearStore = clearStore;
window.getDatabaseStats = getDatabaseStats;
window.exportAllData = exportAllData;
window.importData = importData;
window.handleDatabaseError = handleDatabaseError;
