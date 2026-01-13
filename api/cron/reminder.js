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
        spreadsheetId,
        bookingListSheet,
        staffChatSheet,
        chatworkToken,
        roomId,
        reminderTemplate
    } = config;

    // Get tomorrow's date in JST
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateJST(tomorrow);

    // Read booking list
    let bookings;
    try {
        bookings = await readSheet(spreadsheetId, `${bookingListSheet}!A:Z`);
    } catch (error) {
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.SHEET_NOT_FOUND,
            errorMessage: `Failed to read booking list: ${error.message}`,
            payload: { spreadsheetId, bookingListSheet }
        });
        throw error;
    }

    const headers = bookings[0];

    // Find column indices
    const dateColIdx = headers.findIndex(h => h.includes('日付') || h.includes('Date'));
    const staffColIdx = headers.findIndex(h => h.includes('担当') || h.includes('Staff'));
    const clientColIdx = headers.findIndex(h => h.includes('名前') || h.includes('Client'));
    const timeColIdx = headers.findIndex(h => h.includes('時間') || h.includes('Time'));

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
        const bookingDate = row[dateColIdx];

        // Check if booking is for tomorrow
        if (bookingDate && bookingDate.includes(tomorrowStr)) {
            const staffName = row[staffColIdx];
            const clientName = row[clientColIdx];
            const time = row[timeColIdx];

            if (staffName && staffChatMap[staffName]) {
                const message = formatMessage(
                    reminderTemplate || '【明日のご予約リマインド】\n日時：{date} {time}\nお客様：{client}\nよろしくお願いいたします。',
                    {
                        date: bookingDate,
                        time: time || '',
                        client: clientName || ''
                    }
                );

                try {
                    await sendToMessage(
                        chatworkToken,
                        roomId,
                        staffChatMap[staffName],
                        staffName,
                        message
                    );
                    sentReminders.push({ staff: staffName, client: clientName });
                } catch (error) {
                    failedReminders.push({ staff: staffName, error: error.message });
                }
            } else if (staffName && !staffChatMap[staffName]) {
                // Case 4 specific: Staff found but Chatwork ID missing
                await notifyError({
                    caseName: CASE_NAME,
                    errorCategory: ErrorCategory.CHATWORK_ID_MISSING,
                    errorMessage: `Staff found for tomorrow's booking but Chatwork ID missing: "${staffName}"`,
                    rowNumber: i + 1,
                    payload: { staffName, clientName, bookingDate }
                });
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
 * Format date in Japanese style (YYYY/M/D)
 */
function formatDateJST(date) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return `${jst.getUTCFullYear()}/${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`;
}
