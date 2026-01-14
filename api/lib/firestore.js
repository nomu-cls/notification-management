/**
 * Firestore configuration helper for API routes
 * Uses Firebase Admin SDK for server-side access
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
function getAdminApp() {
    if (getApps().length === 0) {
        const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
    }
    return getApps()[0];
}

const app = getAdminApp();
const db = getFirestore(app);

/**
 * Get configuration from Firestore
 * @param {string} configId - Configuration document ID (default: 'main')
 * @returns {Promise<Object>} Configuration object
 */
export async function getConfig(configId = 'main') {
    const doc = await db.collection('notification_config').doc(configId).get();
    if (!doc.exists) {
        return null;
    }
    return doc.data();
}

/**
 * Save configuration to Firestore
 * @param {Object} config - Configuration object
 * @param {string} configId - Configuration document ID (default: 'main')
 */
export async function saveConfig(config, configId = 'main') {
    await db.collection('notification_config').doc(configId).set(config, { merge: true });
}

/**
 * Get staff chat mapping from config
 * @returns {Promise<Object>} Map of staff surname to Chatwork account ID
 */
export async function getStaffChatMapping() {
    const config = await getConfig();
    return config?.staffChatMapping || {};
}

/**
 * Get assignment viewer sources configuration
 * @returns {Promise<Object>} Assignment viewer config
 */
export async function getAssignmentViewerConfig() {
    const config = await getConfig();
    return config?.assignmentViewer || null;
}
