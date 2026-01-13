/**
 * Case 1: Individual Consultation Booking Handler (Notification Only)
 * 
 * GAS-based architecture: Spreadsheet operations are done in GAS.
 * This handler only sends Chatwork notifications.
 */

import { sendToMessage, formatMessage } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = 'Case 1: 個別相談予約';

/**
 * Handle consultation booking notification
 * Receives pre-processed data from GAS (staff already matched, columns written)
 * @param {Object} data - Data from GAS including matched staff and chatworkId
 * @param {Object} injectedConfig - Configuration from GAS payload
 */
export async function handleConsultation(data, injectedConfig) {
    // Use injected config if available, otherwise check Env Vars (legacy/fallback)
    const config = injectedConfig || await getConfig();

    if (!config) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CONFIG_MISSING,
            errorMessage: 'Configuration not found in Firestore',
            rowNumber: data.rowIndex,
            payload: data
        });
        throw new Error('Configuration not found');
    }

    const {
        chatworkToken,
        roomId,
        consultationTemplate
    } = config;

    // GAS has already done:
    // - Staff matching
    // - Column I (Staff) write
    // - Column O (Viewer URL) write
    // - Chatwork ID lookup

    const {
        staff,
        staffChatworkId,
        clientName,
        dateTime,
        viewerUrl,
        allFields
    } = data;

    // Validate required data from GAS
    if (!staff || staff === '未マッチング') {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.STAFF_MATCH_FAILED,
            errorMessage: `Staff matching failed in GAS for DateTime: "${dateTime}"`,
            rowNumber: data.rowIndex,
            payload: data
        });
        return { matched: false, notified: false };
    }

    if (!staffChatworkId) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CHATWORK_ID_MISSING,
            errorMessage: `No Chatwork ID provided for staff: "${staff}"`,
            rowNumber: data.rowIndex,
            payload: { staff }
        });
        return { matched: true, notified: false, staff, viewerUrl };
    }

    // Send notification
    const message = formatMessage(
        consultationTemplate || '【個別相談予約】\n日時：{dateTime}\nお客様：{clientName}\n担当：{staff}',
        {
            ...allFields,
            dateTime,
            clientName,
            staff
        }
    );

    try {
        await sendToMessage(chatworkToken, roomId, staffChatworkId, staff, message);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: `Failed to send Chatwork notification: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { staff, roomId }
        });
        throw error;
    }

    return { matched: true, notified: true, staff, viewerUrl };
}

// Alias for backward compatibility
export { handleConsultation as handleConsultationBooking };
