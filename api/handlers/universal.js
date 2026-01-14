import { sendMessage, createTask, getRoomMembers, formatMessage, formatValue } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = 'Universal Notification';

// Helper to format values (especially GAS dates/times)
function formatValue(val) {
    if (typeof val !== 'string') return val;

    // Case 1: Date only (ends with 00:00:00)
    if (val.endsWith(' 00:00:00')) {
        return val.replace(' 00:00:00', '');
    }

    // Case 2: Time only (starts with 1899/12/30)
    if (val.startsWith('1899/12/30 ')) {
        // e.g. "1899/12/30 10:00:00" -> "10:00"
        const timePart = val.split(' ')[1];
        if (timePart) {
            const [h, m] = timePart.split(':');
            return `${h}:${m}`;
        }
    }

    return val;
}

/**
 * Handle universal/custom notifications based on sheet matches
 * @param {Object} data - Webhook data (sheetName, allFields, etc.)
 * @param {Object} injectedConfig - Config
 */
export async function handleUniversalNotification(data, injectedConfig) {
    // Merge Config
    const envConfig = await getConfig();
    const config = { ...envConfig, ...injectedConfig };

    // Find matching rules for this sheet
    // rules structure: [{ id, sheetName, notifications: [], task: {} }]
    const rules = (config.notificationRules || []).filter(r => r && r.sheetName);
    const matchedRules = rules.filter(r => r.sheetName === data.sheetName);

    if (matchedRules.length === 0) {
        const availableSheets = rules.map(r => r.sheetName).join(', ');
        console.log(`No notification rules found for sheet: '${data.sheetName}'. Available sheets: [${availableSheets}]`);
        return {
            success: true,
            message: `No rules matched. Requested: '${data.sheetName}', Available: [${availableSheets}]`
        };
    }

    const results = {
        notifications: [],
        tasks: []
    };

    // Prepare data for formatting
    const formatData = {
        ...data,
        ...data.allFields,
        allFields: data.allFields
    };

    // Process each matched rule
    for (const rule of matchedRules) {

        // 1. Process Notifications
        if (rule.notifications && Array.isArray(rule.notifications)) {
            for (const notif of rule.notifications) {
                if (!notif.roomId) continue;

                try {
                    // Build message
                    let message = '';
                    if (notif.template) {
                        message += formatMessage(notif.template, formatData);
                    }

                    // Append selected columns if any
                    // columns: ["氏名", "講座名"]
                    if (notif.columns && notif.columns.length > 0 && data.allFields) {
                        let details = '';
                        for (const col of notif.columns) {
                            const val = data.allFields[col];
                            if (val !== undefined) {
                                details += `${col}：${formatValue(val)}\n`;
                            }
                        }

                        if (details) {
                            if (message) message += '\n'; // Separator
                            message += `[info][title]詳細情報[/title]${details}[/info]`;
                        }
                    }

                    if (message) {
                        const res = await sendMessage(config.chatworkToken, notif.roomId, message);
                        results.notifications.push({ roomId: notif.roomId, status: 'sent', id: res.message_id });
                    }
                } catch (error) {
                    console.error('Notification failed:', error);
                    await notifyError({
                        caseName: `${CASE_NAME}: ${rule.sheetName}`,
                        errorCategory: ErrorCategory.UNKNOWN,
                        errorMessage: `Failed to send to Room ${notif.roomId}: ${error.message}`,
                        rowNumber: data.rowIndex,
                        payload: data
                    });
                    results.notifications.push({ roomId: notif.roomId, status: 'failed', error: error.message });
                }
            }
        }

        // 2. Process Task
        if (rule.task && rule.task.enabled && rule.task.roomId) {
            try {
                // Validate Assignees
                const assigneeIds = rule.task.assigneeIds || [];
                if (assigneeIds.length === 0) {
                    throw new Error('No assignee IDs configured for task');
                }

                // Check room members to validate/normalize
                // This also converts rid-based IDs if needed by getRoomMembers internal fix
                const members = await getRoomMembers(config.chatworkToken, rule.task.roomId);
                const validIds = members.map(m => String(m.account_id));
                const targetIds = assigneeIds.map(id => String(id).trim());

                // Filter only valid ones (or just pass through if we trust user input vs API lag)
                // Let's being permissive but warn
                const finalAssignees = targetIds.filter(id => validIds.includes(id));

                if (finalAssignees.length === 0) {
                    throw new Error(`No valid assignees found in room ${rule.task.roomId}. Input: ${targetIds.join(',')}`);
                }

                // Build Body
                let taskBody = '';
                if (rule.task.bodyTemplate) {
                    taskBody = formatMessage(rule.task.bodyTemplate, formatData);
                } else {
                    taskBody = `【タスク】${data.sheetName}に行が追加されました`;
                }

                // Set deadline (Today end of day)
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                const taskRes = await createTask(
                    config.chatworkToken,
                    rule.task.roomId,
                    taskBody,
                    finalAssignees,
                    today
                );

                results.tasks.push({ roomId: rule.task.roomId, status: 'created', taskIds: taskRes.task_ids });

            } catch (error) {
                console.error('Task creation failed:', error);
                await notifyError({
                    caseName: `${CASE_NAME} Task: ${rule.sheetName}`,
                    errorCategory: 'Task Creation Error',
                    errorMessage: error.message,
                    rowNumber: data.rowIndex,
                    payload: data
                });
                results.tasks.push({ roomId: rule.task.roomId, status: 'failed', error: error.message });

                // Fallback message
                try {
                    await sendMessage(config.chatworkToken, rule.task.roomId,
                        `⚠️ Task Creation Failed: ${error.message}\n\n対象シート: ${data.sheetName}`);
                } catch (e) { /* ignore */ }
            }
        }
    }

    return results;
}
