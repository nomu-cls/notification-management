import { handleConsultationBooking } from './handlers/consultation.js';
import { handleUniversalNotification } from './handlers/universal.js';
import { sendReminders } from './cron/reminder.js';
import { notifyError, ErrorCategory } from './lib/errorNotify.js';
import { getConfig, findPromotionBySheetName } from './lib/firestore.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify webhook secret
    const webhookSecret = req.headers['x-webhook-secret'] || req.query.secret;
    if (process.env.WEBHOOK_SECRET && webhookSecret !== process.env.WEBHOOK_SECRET) {
        console.warn('Webhook Unauthorized: Secret mismatch or missing');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    let { type, data, config: injectedConfig, promotionId: bodyPromoId, sheetName: explicitSheetName } = req.body || {};
    const promotionId = bodyPromoId || req.query.promotionId;

    // Auto-detect External System (UTAGE) Payload
    if (!type && !data && (req.body.event_schedule || req.body.event_member_name || req.body.schedule || req.body['担当者名'])) {
        console.log('Detected External System Payload (Utage)');
        type = 'consultation';
        data = {
            timestamp: new Date().toISOString(),
            rowIndex: null,
            clientName: req.body.name || req.body['氏名'] || req.body['お名前'],
            email: req.body.mail || req.body['メールアドレス'],
            dateTime: req.body.event_schedule || req.body.schedule || req.body['スケジュール'] || req.body['日時'],
            staff: req.body.event_member_name || req.body['担当者名'] || req.body.member_name,
            phone: req.body.phone || req.body.tel || req.body['電話番号'],
            zoom: req.body.zoom || req.body.zoom_url || req.body['ZoomURL'],
            allFields: req.body
        };
        // UTAGE usually doesn't send sheetName, but if it's consultation, we'll try to match by config
    }

    const targetSheetName = explicitSheetName || data?.sheetName || (type === 'consultation' ? '個別相談予約一覧' : null);

    // Resolve Promotion Context
    let resolvedConfig = injectedConfig || null;
    let resolvedPromotionId = promotionId;

    if (!resolvedConfig) {
        if (promotionId) {
            resolvedConfig = await getConfig(promotionId);
        } else if (targetSheetName) {
            const match = await findPromotionBySheetName(targetSheetName);
            if (match) {
                resolvedConfig = match.config;
                resolvedPromotionId = match.promotionId;
                if (match.type === 'universal' && !type) type = 'universal';
                console.log(`Resolved promotion ${resolvedPromotionId} via sheet name: ${targetSheetName}`);
            }
        }
    }

    // Fallback to legacy config
    if (!resolvedConfig) {
        resolvedConfig = await getConfig();
        resolvedPromotionId = resolvedConfig._promotionId;
        console.log('Using fallback config (legacy)');
    }

    if (!type || !data) {
        console.error('Invalid Payload:', JSON.stringify(req.body));
        await notifyError({
            caseName: 'Webhook Layer',
            errorCategory: ErrorCategory.WEBHOOK_PAYLOAD,
            errorMessage: 'Missing type or data',
            payload: req.body
        });
        return res.status(400).json({ error: 'Missing type or data' });
    }

    try {
        let result;
        switch (type) {
            case 'consultation':
                result = await handleConsultationBooking(data, resolvedConfig);
                break;
            case 'universal':
                result = await handleUniversalNotification(data, resolvedConfig);
                break;
            case 'reminder':
                result = await sendReminders(resolvedConfig);
                break;
            default:
                throw new Error(`Unknown webhook type: ${type}`);
        }

        return res.status(200).json({ success: true, promotionId: resolvedPromotionId, result });

    } catch (error) {
        console.error('Webhook Error:', error);
        await notifyError({
            caseName: `Webhook: ${type}`,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: error.message,
            payload: data
        }, resolvedConfig);
        return res.status(500).json({ error: error.message });
    }
}
