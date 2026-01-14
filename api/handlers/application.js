/**
 * Case 2: Main Course Application Handler
 * 
 * Processing:
 * 1. Format all submitted fields into a message
 * 2. Send notification to two groups
 * 3. Create task for "Congratulatory Video Shoot" in designated room
 * 
 * Error Handling:
 * - Validate task assignee IDs before task creation
 * - Fallback to message-only on task failure
 */

import { sendMessage, createTask, getRoomMembers } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = 'Case 2: 本講座申し込み';

/**
 * Handle main course application
 * @param {Object} data - Application data from GAS webhook
 * @param {Object} injectedConfig - Configuration from GAS payload
 */
export async function handleApplication(data, injectedConfig) {
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
        applicationRoomA,
        applicationRoomB,
        applicationTemplateA,
        applicationTemplateB,
        taskAssigneeIds = []
    } = config;

    // Build payload summary for error reporting
    const applicantName = data.applicantName || data.allFields?.['氏名'] || data.allFields?.['お名前'] || '不明';
    const courseName = data.allFields?.['講座名'] || data.allFields?.['コース'] || '不明';
    const payloadSummary = `Applicant: ${applicantName} / Course: ${courseName}`;

    // Format messages for both rooms
    const defaultTemplate = '【本講座申込通知】\n申込者：{氏名}\n講座：{講座名}\nメール：{メールアドレス}\n電話：{電話番号}';

    // Preparation data for formatMessage
    const formatData = {
        ...data,
        ...data.allFields,
        allFields: data.allFields
    };

    const messageA = applicationTemplateA
        ? formatMessage(applicationTemplateA, formatData)
        : formatMessage(defaultTemplate, formatData);

    const messageB = applicationTemplateB
        ? formatMessage(applicationTemplateB, formatData)
        : formatMessage('【本講座申込】\n申込者：{氏名}\n講座：{講座名}', formatData);

    const results = {
        roomA: null,
        roomB: null,
        task: null,
        taskFailed: false
    };

    // Send to Room A
    if (applicationRoomA) {
        try {
            results.roomA = await sendMessage(chatworkToken, applicationRoomA, messageA);
        } catch (error) {
            await notifyError({
                caseName: CASE_NAME,
                errorCategory: ErrorCategory.UNKNOWN,
                errorMessage: `Failed to send to Room A: ${error.message}`,
                rowNumber: data.rowIndex,
                payload: { roomId: applicationRoomA, ...data }
            });
            // Continue to try Room B
        }
    }

    // Send to Room B
    if (applicationRoomB) {
        try {
            results.roomB = await sendMessage(chatworkToken, applicationRoomB, messageB);
        } catch (error) {
            await notifyError({
                caseName: CASE_NAME,
                errorCategory: ErrorCategory.UNKNOWN,
                errorMessage: `Failed to send to Room B: ${error.message}`,
                rowNumber: data.rowIndex,
                payload: { roomId: applicationRoomB, ...data }
            });
        }

        // Create task in Room B for "Congratulatory Video Shoot"
        if (taskAssigneeIds.length > 0) {
            try {
                // Step 1: Validate assignee IDs by fetching room members
                let roomMembers = [];
                try {
                    roomMembers = await getRoomMembers(chatworkToken, applicationRoomB);
                } catch (memberError) {
                    // Member fetch failure - notify admin about UI configuration issue
                    await notifyError({
                        caseName: CASE_NAME,
                        errorCategory: 'Member Fetch Error',
                        errorMessage: `Failed to retrieve room member list. The UI configuration for task assignment may be broken: ${memberError.message}`,
                        rowNumber: data.rowIndex,
                        payload: payloadSummary
                    });
                    // Continue without task creation
                    results.taskFailed = true;
                }

                if (!results.taskFailed) {
                    // Extract valid member IDs
                    const validMemberIds = roomMembers.map(m => String(m.account_id));
                    console.log('Valid member IDs in room:', validMemberIds);
                    console.log('Target assignee IDs:', taskAssigneeIds);

                    // Check if all assignee IDs are valid
                    const invalidIds = taskAssigneeIds.filter(id => !validMemberIds.includes(String(id)));

                    if (invalidIds.length > 0) {
                        // Invalid assignee ID detected
                        await notifyError({
                            caseName: CASE_NAME,
                            errorCategory: 'Task Assignee Error',
                            errorMessage: `The selected Task Assignee ID (${invalidIds.join(', ')}) is invalid or the user has left the Chatwork room. Task creation failed.`,
                            rowNumber: data.rowIndex,
                            payload: payloadSummary
                        });
                        results.taskFailed = true;
                    }
                }

                // Only create task if validation passed
                if (!results.taskFailed) {
                    const taskBody = `【祝賀動画撮影】\n申込者：${applicantName}\n※動画撮影の手配をお願いします。`;

                    // Set deadline to today
                    const today = new Date();
                    today.setHours(23, 59, 59, 999);

                    results.task = await createTask(
                        chatworkToken,
                        applicationRoomB,
                        taskBody,
                        taskAssigneeIds,
                        today,
                        'date'
                    );
                }
            } catch (taskError) {
                // Task creation failed - send fallback message with warning
                await notifyError({
                    caseName: CASE_NAME,
                    errorCategory: 'Task Creation Error',
                    errorMessage: `Task creation failed: ${taskError.message}`,
                    rowNumber: data.rowIndex,
                    payload: payloadSummary
                });
                results.taskFailed = true;
            }

            // Fallback: Send warning message if task creation failed
            if (results.taskFailed) {
                try {
                    const fallbackMessage = `⚠️ Task Creation Failed ⚠️\n\n${messageB}\n\n※ タスク自動作成に失敗しました。手動でタスクを作成してください。`;
                    await sendMessage(chatworkToken, applicationRoomB, fallbackMessage);
                } catch {
                    // Fallback message also failed - already notified about primary error
                }
            }
        }
    }

    return results;
}
