/**
 * Firestore configuration helper for API routes
 * Uses Firestore REST API (same as frontend) to avoid service account requirements
 * Service account is only used for Google Sheets access
 * 
 * Supports Multi-Promotion architecture:
 * - /promotions/{promotionId} - Each promotion has its own config
 * - /notification_config/main - Legacy fallback for backward compatibility
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
            result[key] = (field.arrayValue.values || []).map(v => {
                if (v.mapValue) return parseFirestoreDocument(v.mapValue.fields);
                if (v.stringValue !== undefined) return v.stringValue;
                if (v.integerValue !== undefined) return parseInt(v.integerValue);
                if (v.booleanValue !== undefined) return v.booleanValue;
                return null;
            }).filter(v => v !== null);
        } else if (field.mapValue !== undefined) {
            result[key] = parseFirestoreDocument(field.mapValue.fields);
        } else if (field.timestampValue !== undefined) {
            result[key] = field.timestampValue;
        }
    }
    return result;
}

/**
 * Get configuration from Firestore
 * Supports both new promotions collection and legacy notification_config
 * 
 * @param {string} promotionId - Promotion ID (default: null for auto-detect)
 * @returns {Promise<Object>} Configuration object with promotionId
 */
export async function getConfig(promotionId = null) {
    let config = {};
    let resolvedPromotionId = promotionId;

    // Try promotions collection first
    if (promotionId) {
        const promoUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/promotions/${promotionId}?key=${FIREBASE_API_KEY}`;
        try {
            const response = await fetch(promoUrl);
            if (response.ok) {
                const doc = await response.json();
                const promoData = parseFirestoreDocument(doc.fields);
                config = promoData.config || promoData;
                console.log(`Loaded config from promotions/${promotionId}`);
            }
        } catch (error) {
            console.warn('Failed to fetch promotion config:', error.message);
        }
    }

    // Fallback to legacy notification_config/main
    if (Object.keys(config).length === 0) {
        const legacyUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/notification_config/main?key=${FIREBASE_API_KEY}`;
        try {
            const response = await fetch(legacyUrl);
            if (response.ok) {
                const doc = await response.json();
                config = parseFirestoreDocument(doc.fields);
                resolvedPromotionId = 'main';
                console.log('Loaded config from legacy notification_config/main');
            }
        } catch (error) {
            console.warn('Failed to fetch legacy config:', error.message);
        }
    }

    // Merge/Fallback with Environment Variables
    return {
        _promotionId: resolvedPromotionId,
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

        // Column mapping for row append (fallback if not configured or empty)
        bookingColumnMapping: (config.bookingColumnMapping && config.bookingColumnMapping.length > 0)
            ? config.bookingColumnMapping
            : [
                '',                // A: No (Empty for ArrayFormula)
                '{dateTime}',      // B: 日時
                '{clientName}',    // C: お名前
                '{allFields.カナ}', // D: カナ
                '{email}',         // E: メールアドレス
                '{allFields.Phone}', // F: 携帯電話番号
                '',                // G: 受講費 (empty)
                '{staff}',         // H: 認定コンサル
                '',                // I: 担当者 (filled later by matching)
                '{allFields.Zoom}' // J: Zoom
            ],

        // Admin Notification
        adminChatworkToken: config.adminChatworkToken || process.env.ADMIN_CHATWORK_TOKEN,
        adminChatworkRoomId: config.adminChatworkRoomId || process.env.ADMIN_ROOM_ID
    };
}

/**
 * List all promotions
 * @returns {Promise<Array>} Array of promotion objects with id, name, createdAt
 */
export async function listPromotions() {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/promotions?key=${FIREBASE_API_KEY}`;

    try {
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            const promotions = (data.documents || []).map(doc => {
                const id = doc.name.split('/').pop();
                const fields = parseFirestoreDocument(doc.fields);
                return {
                    id,
                    name: fields.name || id,
                    createdAt: fields.createdAt || null,
                    updatedAt: fields.updatedAt || fields.createdAt || null
                };
            });
            return promotions;
        }
    } catch (error) {
        console.warn('Failed to list promotions:', error.message);
    }

    return [];
}

/**
 * Find promotion by sheet name (for webhook routing)
 * Searches through all promotions' notificationRules and bookingListSheet
 * 
 * @param {string} sheetName - Sheet name to match
 * @returns {Promise<Object|null>} Matching promotion config or null
 */
export async function findPromotionBySheetName(sheetName) {
    const promotions = await listPromotions();

    const matches = [];

    for (const promo of promotions) {
        const config = await getConfig(promo.id);

        let matchType = null;
        let ruleId = null;

        // Check Case 1 booking list sheet
        if (config.bookingListSheet === sheetName) {
            matchType = 'consultation';
        }

        // Check notification rules
        if (config.notificationRules && Array.isArray(config.notificationRules)) {
            const matchedRule = config.notificationRules.find(r => r.sheetName === sheetName);
            if (matchedRule) {
                matchType = 'universal';
                ruleId = matchedRule.id;
            }
        }

        if (matchType) {
            matches.push({
                promotionId: promo.id,
                config,
                type: matchType,
                ruleId,
                updatedAt: promo.updatedAt || promo.createdAt || ''
            });
        }
    }

    if (matches.length > 0) {
        // Sort by updatedAt descending to favor the latest one
        matches.sort((a, b) => {
            const dateA = new Date(a.updatedAt);
            const dateB = new Date(b.updatedAt);
            return dateB - dateA;
        });

        console.log(`Found ${matches.length} matching promotions for sheet '${sheetName}'. Using latest: ${matches[0].promotionId}`);
        return matches[0];
    }

    // Fallback to legacy config
    const legacyConfig = await getConfig();
    if (legacyConfig.bookingListSheet === sheetName) {
        return { promotionId: 'main', config: legacyConfig, type: 'consultation' };
    }
    if (legacyConfig.notificationRules && Array.isArray(legacyConfig.notificationRules)) {
        const matchedRule = legacyConfig.notificationRules.find(r => r.sheetName === sheetName);
        if (matchedRule) {
            return { promotionId: 'main', config: legacyConfig, type: 'universal', ruleId: matchedRule.id };
        }
    }

    return null;
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
export async function getStaffChatMapping(promotionId = null) {
    const config = await getConfig(promotionId);
    return config?.staffChatMapping || {};
}

/**
 * Get assignment viewer sources configuration
 * @returns {Promise<Object>} Assignment viewer config
 */
export async function getAssignmentViewerConfig(promotionId = null) {
    const config = await getConfig(promotionId);
    return config?.assignmentViewer || null;
}
