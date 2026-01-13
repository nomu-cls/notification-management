/**
 * Case 1: Individual Consultation Booking - Direct Webhook Endpoint
 * 
 * POST /api/webhook/booking
 * 
 * This endpoint receives direct POST requests from the booking service's webhook.
 * It implements Bearer token authentication and normalizes the incoming payload.
 * 
 * Authentication: Bearer token in Authorization header
 * Fallback: x-webhook-secret header
 */

import { handleConsultationBooking } from '../handlers/consultation.js';
import { notifyError, ErrorCategory } from '../lib/errorNotify.js';

const CASE_NAME = 'Case 1: 個別相談予約';

/**
 * Normalize incoming webhook payload to internal format
 * Maps external field names to internal Japanese field names
 */
function normalizePayload(rawPayload) {
    // Create mapping from various external formats to internal format
    const fieldMappings = {
        // Date/Time mappings
        'booking_date': '日時',
        'bookingDate': '日時',
        'date_time': '日時',
        'dateTime': '日時',
        'appointment_date': '日時',

        // Consultant/Certification mappings
        'consultant': '資格',
        'certified_consultant': '資格',
        'certifiedConsultant': '資格',
        'certification': '資格',

        // Client name mappings
        'client_name': '氏名',
        'clientName': '氏名',
        'name': '氏名',
        'customer_name': '氏名',
        'full_name': '氏名',

        // Email mappings
        'email': 'メールアドレス',
        'client_email': 'メールアドレス',
        'customerEmail': 'メールアドレス',

        // Phone mappings
        'phone': '電話番号',
        'phone_number': '電話番号',
        'tel': '電話番号',

        // Row index mappings
        'row': 'rowIndex',
        'row_index': 'rowIndex',
        'rowNumber': 'rowIndex'
    };

    const normalized = {
        allFields: {}
    };

    for (const [key, value] of Object.entries(rawPayload)) {
        // Check if this key has a known mapping
        const mappedKey = fieldMappings[key];

        if (mappedKey) {
            // Map to internal field name
            if (mappedKey === 'rowIndex') {
                normalized.rowIndex = value;
            } else {
                normalized.allFields[mappedKey] = value;
            }
        } else {
            // Keep original key in allFields
            normalized.allFields[key] = value;
        }
    }

    // Extract commonly used fields to top level for convenience
    normalized.dateTime = normalized.allFields['日時'] || rawPayload.dateTime || rawPayload.booking_date || '';
    normalized.certifiedConsultant = normalized.allFields['資格'] || rawPayload.consultant || rawPayload.certification || '';
    normalized.clientName = normalized.allFields['氏名'] || rawPayload.name || rawPayload.client_name || '';
    normalized.email = normalized.allFields['メールアドレス'] || rawPayload.email || '';
    normalized.rowIndex = normalized.rowIndex || rawPayload.rowIndex;
    normalized.timestamp = new Date().toISOString();

    return normalized;
}

/**
 * Validate authentication token
 * Supports both Bearer token and x-webhook-secret header
 */
function validateAuth(req) {
    // Check Bearer token first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === process.env.BOOKING_WEBHOOK_TOKEN) {
            return { valid: true };
        }
    }

    // Fallback to x-webhook-secret
    const webhookSecret = req.headers['x-webhook-secret'];
    if (webhookSecret === process.env.BOOKING_WEBHOOK_SECRET) {
        return { valid: true };
    }

    return { valid: false };
}

export default async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Validate authentication
    const authResult = validateAuth(req);
    if (!authResult.valid) {
        // Security alert - send to admin
        await notifyError({
            caseName: CASE_NAME,
            errorCategory: 'Security Alert',
            errorMessage: 'Unauthorized access attempt to booking webhook endpoint. Invalid or missing authentication token.',
            payload: {
                ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown',
                userAgent: req.headers['user-agent']?.substring(0, 50) || 'unknown'
            }
        });
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const rawPayload = req.body;

        if (!rawPayload || Object.keys(rawPayload).length === 0) {
            await notifyError({
                caseName: CASE_NAME,
                errorCategory: ErrorCategory.WEBHOOK_PAYLOAD,
                errorMessage: 'Empty or missing request body',
                payload: 'Empty payload'
            });
            return res.status(400).json({ error: 'Missing request body' });
        }

        // Normalize the payload to internal format
        const normalizedData = normalizePayload(rawPayload);

        // Call the consultation handler
        const result = await handleConsultationBooking(normalizedData);

        return res.status(200).json({
            success: true,
            result,
            normalized: {
                dateTime: normalizedData.dateTime,
                consultant: normalizedData.certifiedConsultant,
                client: normalizedData.clientName
            }
        });

    } catch (error) {
        console.error('Booking webhook error:', error);

        await notifyError({
            caseName: CASE_NAME,
            errorCategory: ErrorCategory.UNKNOWN,
            errorMessage: error.message,
            payload: req.body
        });

        return res.status(500).json({ error: error.message });
    }
}
