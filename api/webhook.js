/**
 * Main Webhook Endpoint
 * Receives webhooks from GAS and routes to appropriate handlers
 * 
 * POST /api/webhook
 * Body: { type: 'consultation' | 'application' | 'workshop', data: {...} }
 */

import { handleConsultation } from './handlers/consultation.js';
import { handleApplication } from './handlers/application.js';
import { handleWorkshop } from './handlers/workshop.js';
import { notifyError, ErrorCategory } from './lib/errorNotify.js';

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify webhook secret (optional but recommended)
    const webhookSecret = req.headers['x-webhook-secret'];
    if (process.env.WEBHOOK_SECRET && webhookSecret !== process.env.WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { type, data, config } = req.body || {};

    // Validate payload
    if (!type || !data) {
        await notifyError({
            caseName: 'Webhook Layer',
            errorCategory: ErrorCategory.WEBHOOK_PAYLOAD,
            errorMessage: 'Missing type or data in request body',
            payload: req.body
        });
        return res.status(400).json({ error: 'Missing type or data in request body' });
    }

    try {
        let result;

        switch (type) {
            case 'consultation':
                // Case 1: Individual Consultation Booking
                result = await handleConsultation(data, config);
                break;

            case 'application':
                // Case 2: Main Course Application
                result = await handleApplication(data, config);
                break;

            case 'workshop':
                // Case 3: Workshop Report
                result = await handleWorkshop(data, config);
                break;

            default:
                await notifyError({
                    caseName: 'Webhook Layer',
                    errorCategory: ErrorCategory.WEBHOOK_PAYLOAD,
                    errorMessage: `Unknown webhook type: ${type}`,
                    payload: data
                });
                return res.status(400).json({ error: `Unknown webhook type: ${type}` });
        }

        return res.status(200).json({ success: true, result });

    } catch (error) {
        console.error('Webhook handler error:', error);

        // Send error notification to admin
        await notifyError({
            caseName: `Webhook: ${type}`,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: error.message,
            rowNumber: data?.rowIndex,
            payload: data
        });

        return res.status(500).json({ error: error.message });
    }
}
