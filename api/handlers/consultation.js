/**
 * Case 1: Individual Consultation Booking Handler
 * 
 * Matching Logic:
 * 1. Scan "Staff List" sheet using Date/Time and "Certified Consultant" as keys
 * 2. Retrieve "Staff Name (Surname Only)" from matching row
 * 3. Write Surname into Column I (Staff) of booking list
 * 4. Generate and write Viewer URL to Column O
 * 5. Search Chatwork ID by Surname in "Staff Chat" sheet
 * 6. Send immediate notification
 */

import { readSheet, updateCell, appendRow } from '../lib/sheets.js';
import { sendMessage, sendToMessage, formatMessage } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';
import crypto from 'crypto';

const CASE_NAME = 'Case 1: 個別相談予約';

/**
 * Generate unique hashed URL for assignment viewer
 * @param {string} email - Client email
 * @param {string} name - Client name
 * @returns {string} Hashed URL path
 */
function generateViewerUrl(email, name, baseUrl) {
    const salt = process.env.VIEWER_URL_SALT || 'default-salt';
    const input = `${salt}:${email || name}:${Date.now()}`;
    const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
    return `${baseUrl}/viewer/${hash}`;
}

/**
 * Handle individual consultation booking (Direct Webhook Version)
 * Called from /api/webhook/booking
 * @param {Object} data - Normalized booking data
 */
export async function handleConsultationBooking(data) {
    const config = await getConfig();

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
        spreadsheetId,
        staffListSheet,
        bookingListSheet,
        staffChatSheet,
        chatworkToken,
        roomId,
        consultationTemplate,
        bookingColumnMapping = [], // New: Column mapping configuration
        staffColumn = 8,      // Column H (1-indexed) - User specified "担当者" is at index 7 (0-based)
        viewerUrlColumn = 15, // Column O (1-indexed)
        viewerBaseUrl = process.env.VERCEL_URL || 'https://your-app.vercel.app'
    } = config;

    // Step 0: Append row if rowIndex is missing (External Webhook / UTAGE case)
    if (!data.rowIndex) {
        console.log('rowIndex missing, attempting to append row using mapping:', JSON.stringify(bookingColumnMapping));

        if (!bookingColumnMapping || bookingColumnMapping.length === 0) {
            console.warn('No bookingColumnMapping configured. Skipping row append.');
        } else {
            try {
                // Construct row values based on mapping
                const rowValues = bookingColumnMapping.map(template => {
                    return formatMessage(template, {
                        ...data.allFields,
                        dateTime: data.dateTime,
                        clientName: data.clientName
                    });
                });

                // Append to spreadsheet
                const appendResult = await appendRow(spreadsheetId, bookingListSheet, rowValues);

                // Parse new rowIndex from response (e.g., "Sheet1!A10:Z10")
                if (appendResult.updates && appendResult.updates.updatedRange) {
                    const range = appendResult.updates.updatedRange;
                    const match = range.match(/!A(\d+)/) || range.match(/!.*(\d+)/); // Extract row number
                    if (match && match[1]) {
                        data.rowIndex = parseInt(match[1]);
                        console.log('Appended new row at index:', data.rowIndex);
                    }
                }
            } catch (error) {
                await notifyError({
                    caseName: CASE_NAME,
                    errorCategory: ErrorCategory.UNKNOWN,
                    errorMessage: `Failed to append new row: ${error.message}`,
                    rowNumber: null,
                    payload: data
                });
                // We proceed even if append fails, though notification might miss row context
            }
        }
    }

    // Step 1: Find matching staff from Staff List
    let staffList;
    try {
        staffList = await readSheet(spreadsheetId, `${staffListSheet}!A:Z`);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: error.message.includes('404') ? ErrorCategory.SHEET_NOT_FOUND : ErrorCategory.UNKNOWN,
            errorMessage: `Failed to read Staff List sheet: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { spreadsheetId, staffListSheet }
        });
        throw error;
    }

    const headers = staffList[0];

    // Find column indices
    // Column 0: 日時, Column 1+: 認定コンサル1, 認定コンサル2, etc.
    const dateTimeColIdx = headers.findIndex(h => h && (h.includes('日時') || h.includes('DateTime')));

    // The consultant columns are named like "認定コンサル1", "認定コンサル2"
    // data.staff contains the column name (e.g., "認定コンサル1")
    const consultantColIdx = headers.findIndex(h => h && h === data.staff);

    let matchedStaff = null;

    if (dateTimeColIdx >= 0 && consultantColIdx >= 0) {
        for (let i = 1; i < staffList.length; i++) {
            const row = staffList[i];
            // Match by date/time only, then get staff name from the consultant column
            if (row[dateTimeColIdx] === data.dateTime) {
                matchedStaff = row[consultantColIdx];
                break;
            }
        }
    } else {
        console.warn('Column not found - dateTimeColIdx:', dateTimeColIdx, 'consultantColIdx:', consultantColIdx, 'Looking for:', data.staff);
    }

    if (!matchedStaff) {
        // Case 1 specific: Staff match failed
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.STAFF_MATCH_FAILED,
            errorMessage: `No matching staff found for DateTime: "${data.dateTime}", Consultant: "${data.certifiedConsultant}"`,
            rowNumber: data.rowIndex,
            payload: data
        });
        console.warn('No matching staff found for:', data.dateTime, data.certifiedConsultant);
        return { matched: false };
    }

    // Step 2: Write staff name to Column I (Staff)
    if (data.rowIndex) {
        try {
            await updateCell(spreadsheetId, bookingListSheet, parseInt(data.rowIndex), staffColumn, matchedStaff);
        } catch (error) {
            await notifyError({
                caseName: CASE_NAME,
                errorCategory: ErrorCategory.UNKNOWN,
                errorMessage: `Failed to write staff name to Column I: ${error.message}`,
                rowNumber: data.rowIndex,
                payload: { matchedStaff, staffColumn }
            });
            // Continue anyway - notification is more important
        }
    }

    // Step 3: Generate and write Viewer URL to Column O
    let viewerUrl = null;
    if (data.rowIndex) {
        try {
            viewerUrl = generateViewerUrl(data.email, data.clientName, viewerBaseUrl);
            await updateCell(spreadsheetId, bookingListSheet, parseInt(data.rowIndex), viewerUrlColumn, viewerUrl);
        } catch (error) {
            await notifyError({
                caseName: CASE_NAME,
                errorCategory: ErrorCategory.UNKNOWN,
                errorMessage: `Failed to write Viewer URL to Column O: ${error.message}`,
                rowNumber: data.rowIndex,
                payload: { viewerUrl, viewerUrlColumn }
            });
            // Continue anyway
        }
    }

    // Step 4: Get Chatwork ID from Staff Chat sheet
    let staffChatList;
    try {
        staffChatList = await readSheet(spreadsheetId, `${staffChatSheet}!A:B`);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.SHEET_NOT_FOUND,
            errorMessage: `Failed to read Staff Chat sheet: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { spreadsheetId, staffChatSheet }
        });
        throw error;
    }

    let chatworkAccountId = null;
    for (const row of staffChatList) {
        if (row[0] === matchedStaff) {
            chatworkAccountId = row[1];
            break;
        }
    }

    if (!chatworkAccountId) {
        // Case 1 specific: Chatwork ID missing
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CHATWORK_ID_MISSING,
            errorMessage: `No Chatwork ID found for staff: "${matchedStaff}"`,
            rowNumber: data.rowIndex,
            payload: { matchedStaff }
        });
        console.warn('No Chatwork ID found for staff:', matchedStaff);
        return { matched: true, notified: false, staff: matchedStaff, viewerUrl };
    }

    // Step 5: Send notification
    // Step 5: Send notification
    // chatworkAccountId contains the full [To:xxx]Name format from the spreadsheet
    const messageTemplate = consultationTemplate || '【個別相談予約】\n日時：{dateTime}\nお客様：{clientName}\n担当：{staff}';
    const message = formatMessage(messageTemplate, {
        ...data.allFields,
        dateTime: data.dateTime,
        clientName: data.clientName,
        staff: matchedStaff
    });

    // Build the full message with the [To:xxx] mention from the spreadsheet
    const fullMessage = `${chatworkAccountId}\n${message}`;

    try {
        await sendMessage(chatworkToken, roomId, fullMessage);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: `Failed to send Chatwork notification: ${error.message}`,
            rowNumber: data.rowIndex,
            payload: { matchedStaff, roomId }
        });
        throw error;
    }

    return { matched: true, notified: true, staff: matchedStaff, viewerUrl };
}

/**
 * Legacy handler for GAS webhook (for backward compatibility)
 * @deprecated Use handleConsultationBooking instead
 */
export async function handleConsultation(data) {
    return handleConsultationBooking(data);
}
