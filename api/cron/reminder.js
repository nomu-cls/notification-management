import { readSheet } from '../lib/sheets.js';
import { sendToMessage, formatMessage } from '../lib/chatwork.js';
import { getConfig, listPromotions } from '../lib/firestore.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = '前日リマインダー';

export default async function handler(req, res) {
    // Verify cron secret for Vercel Cron
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const results = [];

        // 1. Run for all promotions
        const promotions = await listPromotions();
        for (const promo of promotions) {
            try {
                const config = await getConfig(promo.id);
                const result = await sendReminders(config);
                results.push({ promotionId: promo.id, name: promo.name, ...result });
            } catch (err) {
                console.error(`Failed to send reminders for promotion ${promo.id}:`, err);
                results.push({ promotionId: promo.id, name: promo.name, error: err.message });
            }
        }

        // 2. Also run for legacy config if not already covered
        if (!promotions.find(p => p.id === 'main')) {
            try {
                const config = await getConfig('main');
                const result = await sendReminders(config);
                results.push({ promotionId: 'main', name: 'Legacy', ...result });
            } catch (err) {
                console.error(`Failed to send reminders for legacy config:`, err);
                results.push({ promotionId: 'main', error: err.message });
            }
        }

        return res.status(200).json({ success: true, results });
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

/**
 * Send reminders based on provided config
 * @param {Object} config - Configuration object from getConfig()
 */
export async function sendReminders(config) {
    if (!config) throw new Error('Configuration missing');

    const {
        spreadsheetId,
        bookingListSheet,
        staffChatSheet,
        chatworkToken,

        reminderRoomId,
        reminderSpreadsheetId,
        reminderSheetName,
        reminderDateCol,
        reminderTemplate
    } = config;

    // Strict check for required auth but with meaningful error
    if (!chatworkToken) {
        throw new Error('Chatwork APIトークンが設定されていません。接続設定を確認してください。');
    }

    const targetSpreadsheetId = reminderSpreadsheetId || spreadsheetId;
    const targetSheetName = reminderSheetName || bookingListSheet;

    if (!targetSpreadsheetId || !targetSheetName) {
        throw new Error('スプレッドシートIDまたはシート名が未設定です。');
    }

    // Get tomorrow's date in JST
    const now = new Date();
    // JST is UTC+9
    const jstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    const tomorrowJST = new Date(jstNow.getTime() + (24 * 60 * 60 * 1000));

    const targetYear = tomorrowJST.getUTCFullYear();
    const targetMonth = tomorrowJST.getUTCMonth() + 1;
    const targetDate = tomorrowJST.getUTCDate();

    // Read booking list
    let bookings;
    try {
        bookings = await readSheet(targetSpreadsheetId, `${targetSheetName}!A:Z`);
    } catch (error) {
        console.warn(`Could not read sheet ${targetSheetName}: ${error.message}`);
        return { sent: 0, error: `Sheet not found: ${targetSheetName}` };
    }

    if (!bookings || bookings.length < 2) return { sent: 0, message: 'No bookings found' };

    const headers = bookings[0];

    // Find column indices
    let dateColIdx = -1;
    if (reminderDateCol) {
        dateColIdx = headers.findIndex(h => h === reminderDateCol);
    }
    if (dateColIdx === -1) {
        dateColIdx = headers.findIndex(h => h.includes('日付') || h.includes('Date') || h.includes('開催日時') || h.includes('開始日時'));
    }

    const staffColIdx = headers.findIndex(h => h.includes('担当') || h.includes('Staff'));
    const clientColIdx = headers.findIndex(h => h.includes('名前') || h.includes('Client'));
    const timeColIdx = headers.findIndex(h => h.includes('時間') || h.includes('Time'));

    if (dateColIdx === -1) {
        return { sent: 0, error: `Date column not found in ${targetSheetName}.` };
    }

    // Get staff chat mapping
    let staffChatList;
    try {
        staffChatList = await readSheet(spreadsheetId, `${staffChatSheet}!A:B`);
    } catch (error) {
        return { sent: 0, error: `Staff mapping sheet not found: ${staffChatSheet}` };
    }

    const staffChatMap = {};
    for (const row of staffChatList) {
        if (row[0] && row[1]) {
            staffChatMap[row[0]] = row[1];
        }
    }

    const sentReminders = [];
    const failedReminders = [];

    for (let i = 1; i < bookings.length; i++) {
        const row = bookings[i];
        const dateRaw = row[dateColIdx];
        if (!dateRaw) continue;

        // Date match logic
        const normalizedDateStr = dateRaw.replace(/[年月]/g, '/').replace(/日/g, '').trim();
        const d = new Date(normalizedDateStr);
        let isTomorrow = false;

        if (!isNaN(d.getTime())) {
            if (d.getFullYear() < 2000) d.setFullYear(targetYear);
            if (d.getFullYear() === targetYear && (d.getMonth() + 1) === targetMonth && d.getDate() === targetDate) {
                isTomorrow = true;
            }
        }

        if (isTomorrow) {
            const staffName = row[staffColIdx];
            const clientName = row[clientColIdx];
            const time = row[timeColIdx];

            if (staffName && staffChatMap[staffName]) {
                const message = formatMessage(
                    reminderTemplate || '[info]【明日のご予約リマインド】\n日時：{date} {time}\nお客様：{client}\nよろしくお願いいたします。[/info]',
                    {
                        date: dateRaw,
                        time: time || '',
                        client: clientName || ''
                    }
                );

                try {
                    let targetRoomId = reminderRoomId || staffChatMap[staffName];
                    await sendToMessage(chatworkToken, targetRoomId, staffChatMap[staffName], staffName, message);
                    sentReminders.push({ staff: staffName, client: clientName });
                } catch (error) {
                    failedReminders.push({ staff: staffName, error: error.message });
                }
            }
        }
    }

    return { sent: sentReminders.length, reminders: sentReminders, failed: failedReminders };
}
