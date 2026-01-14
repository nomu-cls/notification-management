/**
 * Firestore configuration helper for API routes
 * Uses Firestore REST API (same as frontend) to avoid service account requirements
 * Service account is only used for Google Sheets access
 */

// Firebase config for 'challengemanage' project (same as frontend)
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'challengemanage';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyB55BdrbCUKU172fvtcNaqdGtjDIR-fvP4';

/**
 * Parse Firestore document fields to plain object
 */
function parseFirestoreDocument(fields) {
    if (!fields) return {};

    const result = {};
    for (const key in fields) {
        const field = fields[key];
        if (field.stringValue !== undefined) {
            result[key] = field.stringValue;
        } else if (field.integerValue !== undefined) {
            result[key] = parseInt(field.integerValue);
        } else if (field.booleanValue !== undefined) {
            result[key] = field.booleanValue;
        } else if (field.arrayValue !== undefined) {
            result[key] = (field.arrayValue.values || []).map(v => v.stringValue || v.integerValue);
        } else if (field.mapValue !== undefined) {
            result[key] = parseFirestoreDocument(field.mapValue.fields);
        }
    }
    return result;
}

/**
 * Get configuration from Firestore using REST API
 * @param {string} configId - Configuration document ID (default: 'main')
 * @returns {Promise<Object>} Configuration object
 */
export async function getConfig(configId = 'main') {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/notification_config/${configId}?key=${FIREBASE_API_KEY}`;

    let config = {};
    try {
        const response = await fetch(url);

        if (response.ok) {
            const doc = await response.json();
            config = parseFirestoreDocument(doc.fields);
            console.log('Firestore config loaded successfully');
        } else {
            const errorText = await response.text();
            console.warn('Firestore fetch failed:', response.status, errorText);
        }
    } catch (error) {
        console.warn('Failed to fetch config from Firestore:', error.message);
    }

    // Merge/Fallback with Environment Variables
    return {
        ...config,
        // Spreadsheet Configuration (fallback to env vars if not in Firestore)
        spreadsheetId: config.spreadsheetId || process.env.SPREADSHEET_ID,
        staffListSheet: config.staffListSheet || process.env.STAFF_LIST_SHEET || 'スタッフリスト',
        bookingListSheet: config.bookingListSheet || process.env.BOOKING_LIST_SHEET || '個別相談予約一覧',
        staffChatSheet: config.staffChatSheet || process.env.STAFF_CHAT_SHEET || '担当者チャット',

        // Fallback for Case 1 (Consultation)
        chatworkToken: config.chatworkToken || process.env.ADMIN_CHATWORK_TOKEN,
        roomId: config.roomId || process.env.CONSULTATION_ROOM_ID,
        consultationTemplate: config.consultationTemplate || process.env.CONSULTATION_TEMPLATE,

        // Admin Notification
        adminChatworkToken: config.adminChatworkToken || process.env.ADMIN_CHATWORK_TOKEN,
        adminChatworkRoomId: config.adminChatworkRoomId || process.env.ADMIN_ROOM_ID
    };
}

/**
 * Save configuration to Firestore (Not supported in REST API mode without auth)
 * Use the Admin Dashboard for configuration changes
 */
export async function saveConfig(config, configId = 'main') {
    console.warn('saveConfig is not supported in REST API mode. Use the Admin Dashboard.');
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
