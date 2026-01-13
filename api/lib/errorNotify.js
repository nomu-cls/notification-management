/**
 * Global Error Notification Utility
 * 
 * Sends formatted error notifications to Admin Chatwork Room
 * using the mandatory [info] tag format.
 */

import { sendMessage } from './chatwork.js';
import { getConfig } from './firestore.js';

/**
 * Error categories for classification
 */
export const ErrorCategory = {
    WEBHOOK_PAYLOAD: 'Webhook Payload Error',
    API_TIMEOUT: 'API Timeout',
    AUTH_FAILURE: 'Authentication Failure',
    SHEET_NOT_FOUND: 'Spreadsheet Not Found',
    PERMISSION_DENIED: 'Permission Denied',
    STAFF_MATCH_FAILED: 'Staff Matching Failed',
    CHATWORK_ID_MISSING: 'Chatwork ID Missing',
    INVALID_DATE: 'Invalid Date Format',
    CONFIG_MISSING: 'Configuration Missing',
    TASK_ASSIGNEE_ERROR: 'Task Assignee Error',
    MEMBER_FETCH_ERROR: 'Member Fetch Error',
    TASK_CREATION_ERROR: 'Task Creation Error',
    UNKNOWN: 'Unknown Error'
};

/**
 * Format timestamp in JST
 */
function getJSTTimestamp() {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().replace('T', ' ').substring(0, 19) + ' JST';
}

/**
 * Build error message using mandatory Chatwork [info] format
 */
function buildErrorMessage({ caseName, errorCategory, errorMessage, rowNumber, payloadSummary }) {
    const timestamp = getJSTTimestamp();

    let message = `[info][title]⚠️ System Automation Error[/title]\n`;
    message += `【Timestamp】: ${timestamp}\n`;
    message += `【Case】: ${caseName || 'Unknown'}\n`;
    message += `【Error Type】: ${errorCategory || ErrorCategory.UNKNOWN}\n`;
    message += `【Detail】: ${errorMessage || 'No details available'}\n`;

    if (rowNumber) {
        message += `【Source Row】: ${rowNumber}\n`;
    }

    if (payloadSummary) {
        message += `【Payload Reference】: ${payloadSummary}\n`;
    }

    message += `[/info]`;

    return message;
}

/**
 * Get admin notification credentials
 * Priority: Firestore config > Environment variables
 */
async function getAdminCredentials() {
    try {
        const config = await getConfig();
        if (config?.adminChatworkToken && config?.adminChatworkRoomId) {
            return {
                token: config.adminChatworkToken,
                roomId: config.adminChatworkRoomId
            };
        }
    } catch (e) {
        console.error('Failed to get config for admin credentials:', e);
    }

    // Fallback to environment variables
    const token = process.env.ADMIN_CHATWORK_TOKEN;
    const roomId = process.env.ADMIN_ROOM_ID;

    if (token && roomId) {
        return { token, roomId };
    }

    return null;
}

/**
 * Send error notification to Admin Chatwork Room
 * 
 * @param {Object} params - Error parameters
 * @param {string} params.caseName - Case identifier (e.g., "Case 1: 個別相談予約")
 * @param {string} params.errorCategory - Category from ErrorCategory enum
 * @param {string} params.errorMessage - Detailed error message
 * @param {string|number} [params.rowNumber] - Source row number if applicable
 * @param {Object|string} [params.payload] - Original payload for reference
 * @returns {Promise<boolean>} Whether notification was sent successfully
 */
export async function notifyError({ caseName, errorCategory, errorMessage, rowNumber, payload }) {
    try {
        const credentials = await getAdminCredentials();

        if (!credentials) {
            console.error('Admin notification credentials not configured. Error not reported:', {
                caseName,
                errorCategory,
                errorMessage
            });
            return false;
        }

        // Create payload summary (truncate if too long)
        let payloadSummary = '';
        if (payload) {
            if (typeof payload === 'string') {
                payloadSummary = payload.substring(0, 100);
            } else {
                const keys = Object.keys(payload).slice(0, 5).join(', ');
                payloadSummary = `Keys: ${keys}${Object.keys(payload).length > 5 ? '...' : ''}`;
            }
        }

        const message = buildErrorMessage({
            caseName,
            errorCategory,
            errorMessage,
            rowNumber,
            payloadSummary
        });

        await sendMessage(credentials.token, credentials.roomId, message);
        console.log('Error notification sent to admin room');
        return true;

    } catch (notifyError) {
        // Log but don't throw - we don't want error notification to cause more errors
        console.error('Failed to send error notification:', notifyError);
        return false;
    }
}

/**
 * Wrapper to execute a function with error handling and notification
 * 
 * @param {string} caseName - Case identifier for error reporting
 * @param {Function} fn - Async function to execute
 * @param {Object} [context] - Additional context for error reporting
 * @returns {Promise<{success: boolean, result?: any, error?: Error}>}
 */
export async function withErrorHandling(caseName, fn, context = {}) {
    try {
        const result = await fn();
        return { success: true, result };
    } catch (error) {
        // Determine error category based on error message/type
        let errorCategory = ErrorCategory.UNKNOWN;
        const errorMsg = error.message || String(error);

        if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
            errorCategory = ErrorCategory.API_TIMEOUT;
        } else if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('auth')) {
            errorCategory = errorMsg.includes('403') ? ErrorCategory.PERMISSION_DENIED : ErrorCategory.AUTH_FAILURE;
        } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
            errorCategory = ErrorCategory.SHEET_NOT_FOUND;
        } else if (errorMsg.includes('staff') || errorMsg.includes('match')) {
            errorCategory = ErrorCategory.STAFF_MATCH_FAILED;
        } else if (errorMsg.includes('chatwork') && errorMsg.includes('id')) {
            errorCategory = ErrorCategory.CHATWORK_ID_MISSING;
        } else if (errorMsg.includes('date') || errorMsg.includes('invalid')) {
            errorCategory = ErrorCategory.INVALID_DATE;
        } else if (errorMsg.includes('config')) {
            errorCategory = ErrorCategory.CONFIG_MISSING;
        }

        await notifyError({
            caseName,
            errorCategory,
            errorMessage: errorMsg,
            rowNumber: context.rowNumber,
            payload: context.payload
        });

        return { success: false, error };
    }
}
