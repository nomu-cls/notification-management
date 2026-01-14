/**
 * Case 4: Day-before Reminder (Cron Job)
 * 
 * Runs daily at 18:00 JST
 * 1. Extract bookings for "Next Day" from booking list
 * 2. Use "Staff Name" to get chat destination
 * 3. Send individual To-specified notifications
 */

import { readSheet } from '../lib/sheets.js';
import { sendToMessage, formatMessage } from '../lib/chatwork.js';
import { getConfig } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = 'Case 4: 前日リマインダー';

export default async function handler(req, res) {
    // Verify cron secret for Vercel Cron
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await sendReminders();
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('Reminder cron error:', error);
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: `Cron job failed: ${error.message}`
        });
        return res.status(500).json({ error: error.message });
    }
}

export async function sendReminders() {
    const config = await getConfig();

    if (!config) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.CONFIG_MISSING,
            errorMessage: 'Configuration not found in Firestore'
        });
        throw new Error('Configuration not found');
    }

    const {
        // Fallback to main config if specific reminder config is missing
        spreadsheetId,
        bookingListSheet,
        staffChatSheet,
        chatworkToken,
        roomId,

        // Reminder specific config
        reminderRoomId,     // Optional: specific room for reminders (though usually sent to staff DM)
        reminderSpreadsheetId, // Optional: specific spreadsheet
        reminderSheetName,    // Optional: specific sheet
        reminderDateCol,      // Optional: specific date column name
        reminderTemplate
    } = config;

    // Determine target settings
    const targetSpreadsheetId = reminderSpreadsheetId || spreadsheetId;
    const targetSheetName = reminderSheetName || bookingListSheet;

    // NOT USED: Reminders are sent to individual staff, not a central room.
    // keeping logic consistent with original implementation which looked up staff IDs.

    // Get tomorrow's date parts for comparison
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetYear = tomorrow.getFullYear();
    const targetMonth = tomorrow.getMonth() + 1;
    const targetDate = tomorrow.getDate();

    // Read booking list
    let bookings;
    try {
        bookings = await readSheet(targetSpreadsheetId, `${targetSheetName}!A:Z`);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.SHEET_NOT_FOUND,
            errorMessage: `Failed to read booking list: ${error.message}`,
            payload: { spreadsheetId: targetSpreadsheetId, sheetName: targetSheetName }
        });
        throw error;
    }

    const headers = bookings[0];

    // Find column indices
    let dateColIdx = -1;
    if (reminderDateCol) {
        dateColIdx = headers.findIndex(h => h === reminderDateCol);
    }
    // Fallback search
    if (dateColIdx === -1) {
        dateColIdx = headers.findIndex(h => h.includes('日付') || h.includes('Date') || h.includes('開催日時') || h.includes('開始日時'));
    }

    const staffColIdx = headers.findIndex(h => h.includes('担当') || h.includes('Staff'));
    const clientColIdx = headers.findIndex(h => h.includes('名前') || h.includes('Client'));
    const timeColIdx = headers.findIndex(h => h.includes('時間') || h.includes('Time'));

    if (dateColIdx === -1) {
        throw new Error(`Date column not found in ${targetSheetName}. Configured: ${reminderDateCol}`);
    }

    // Get staff chat mapping
    let staffChatList;
    try {
        staffChatList = await readSheet(spreadsheetId, `${staffChatSheet}!A:B`);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.SHEET_NOT_FOUND,
            errorMessage: `Failed to read staff chat mapping: ${error.message}`,
            payload: { spreadsheetId, staffChatSheet }
        });
        throw error;
    }

    const staffChatMap = {};
    for (const row of staffChatList) {
        if (row[0] && row[1]) {
            staffChatMap[row[0]] = row[1];
        }
    }

    // Find tomorrow's bookings and send reminders
    const sentReminders = [];
    const failedReminders = [];

    for (let i = 1; i < bookings.length; i++) {
        const row = bookings[i];
        const dateRaw = row[dateColIdx];

        if (!dateRaw) continue;

        // Parse Date
        // Supporting "YYYY/MM/DD", "MM/DD", or ISO strings
        let parsedDate = null;

        // Try parsing assuming Japanese format often used in Sheets
        const normalizedDateStr = dateRaw.replace(/[年月]/g, '/').replace(/日/g, '').trim();
        const d = new Date(normalizedDateStr);

        if (!isNaN(d.getTime())) {
            parsedDate = d;
            // Handle cases where year might be missing (defaults to 2001 etc in some parsers if not careful, 
            // but usually new Date("1/30") gives current year or 2001. 
            // Better to assume if year is < 2000, it might be current year? 
            // For safety, let's rely on standard parsing for now, user requested "Next Day" check.

            // Adjust for year boundary if needed? 
            // Actually, if the sheet has "1/30" and today is "2026/1/29", new Date("1/30") might default to 2001.
            // Let's explicitly handle slash format without year if needed, but let's trust full dates first.

            // Check if matches tomorrow
            if (d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth && d.getDate() === targetDate) {
                // Matched
            } else if (d.getFullYear() < 2000) {
                // Maybe year was missing?
                d.setFullYear(targetYear);
                if ((d.getMonth() + 1) === targetMonth && d.getDate() === targetDate) {
                    // Matched with injected year
                    parsedDate = d;
                } else {
                    parsedDate = null; // didn't match tomorrow even with year fix
                }
            } else {
                parsedDate = null; // Date is valid but not tomorrow
            }
        }

        // As a fallback for simple string matching (legacy behavior), keep string check if parse failed to match
        // But the user asked specifically for "Date judgment", so we prioritize the parsed check.

        // Re-implement legacy string check as backup if date parsing was ambiguous but string contains tomorrow's string
        const tomorrowStr = `${targetYear}/${// zero pad?
            String(targetMonth).padStart(2, '0')}/${String(targetDate).padStart(2, '0')}`;
        const tomorrowStrShort = `${targetMonth}/${targetDate}`;

        let isTomorrow = false;
        if (parsedDate) {
            isTomorrow = true;
        } else if (dateRaw.includes(tomorrowStr)) {
            isTomorrow = true;
        }

        if (isTomorrow) {
            const staffName = row[staffColIdx];
            const clientName = row[clientColIdx];
            const time = row[timeColIdx];

            if (staffName && staffChatMap[staffName]) {
                const message = formatMessage(
                    reminderTemplate || '【明日のご予約リマインド】\n日時：{date} {time}\nお客様：{client}\nよろしくお願いいたします。',
                    {
                        date: dateRaw,
                        time: time || '',
                        client: clientName || ''
                    }
                );

                try {
                    // Note: Case 4 implies sending to the STAFF, not a fixed room.
                    // But if reminderRoomId is set, maybe they want copies?
                    // The requirement says "Specify notification destination chat". 
                    // Usually reminders go to the person.
                    // If reminderRoomId is SPECIFIED, we send there INSTEAD or ALSO?
                    // "通知先のチャットの指定ガできるようにしてください" -> likely means "Send HERE instead of DM" or "Default room if DM fails"?
                    // Given the context of "Staff Schedule", typically it's DM.
                    // However, if the user explicitly sets a Room ID in config, we should probably send it there.

                    let targetRoomId = staffChatMap[staffName]; // Default: Staff's mapped room/DM

                    // If global override is set, use that? Or maybe that's just for errors?
                    // The prompt says "Notification Destination Chat Specification". 
                    // Let's assume if `reminderRoomId` is set, we send to that room, mentioning the staff.

                    if (reminderRoomId) {
                        targetRoomId = reminderRoomId;
                    }

                    await sendToMessage(
                        chatworkToken,
                        targetRoomId,
                        // If we are sending to a common room, we should To the staff. 
                        // sendToMessage handles "[To:xxx] Name" if accountId/name are provided.
                        staffChatMap[staffName], // account ID for To tag
                        staffName,               // Name for To tag
                        message
                    );
                    sentReminders.push({ staff: staffName, client: clientName });
                } catch (error) {
                    failedReminders.push({ staff: staffName, error: error.message });
                }
            } else if (staffName) {
                // specific: Staff found but Chatwork ID missing
                failedReminders.push({ staff: staffName, error: 'Chatwork ID not found' });
            }
        }
    }

    // Report any failed reminders
    if (failedReminders.length > 0) {
        console.warn('Some reminders failed:', failedReminders);
    }

    return { sent: sentReminders.length, reminders: sentReminders, failed: failedReminders };
}

/**
 * Format date in Japanese style (YYYY/M/D) for display/string comparison if needed
 */
function formatDateJST(date) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
}
