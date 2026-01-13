/**
 * Case 3: Workshop Report Handler
 * 
 * Processing:
 * 1. Format all report items
 * 2. Post to designated storage/stock chat room
 * 3. No specific recipient (general post)
 */

import { sendMessage } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = 'Case 3: ワークショップ報告';

/**
 * Handle workshop report
 * @param {Object} data - Report data from GAS webhook
 * @param {Object} injectedConfig - Configuration from GAS payload
 */
export async function handleWorkshop(data, injectedConfig) {
    // Merge: Injected Config (Priority) > Env Vars (Fallback)
    const envConfig = await getConfig();
    const config = { ...envConfig, ...injectedConfig };

    if (!config) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CONFIG_MISSING,
            errorMessage: 'Configuration not found in Firestore',
            payload: data
        });
        throw new Error('Configuration not found');
    }

    const {
        chatworkToken,
        workshopReportRoom,
        workshopTemplate
    } = config;

    if (!workshopReportRoom) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CONFIG_MISSING,
            errorMessage: 'Workshop report room not configured',
            payload: data
        });
        throw new Error('Workshop report room not configured');
    }

    // Format message with all fields
    let message = workshopTemplate || '【ワークショップ報告】\n';
    message += '━━━━━━━━━━━━━━━\n';

    if (data.allFields) {
        for (const [key, value] of Object.entries(data.allFields)) {
            if (value) {
                message += `■ ${key}\n${value}\n\n`;
            }
        }
    }

    message += '━━━━━━━━━━━━━━━';

    // Send to workshop report room
    try {
        const result = await sendMessage(chatworkToken, workshopReportRoom, message);
        return { sent: true, messageId: result.message_id };
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: `Failed to send workshop report: ${error.message}`,
            payload: { roomId: workshopReportRoom }
        });
        throw error;
    }
}
