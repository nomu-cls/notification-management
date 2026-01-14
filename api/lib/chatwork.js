/**
 * Chatwork API Wrapper
 * Provides utility functions for sending messages and creating tasks
 */

const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

/**
 * Get Chatwork API headers
 * @param {string} token - Chatwork API token
 */
function getHeaders(token) {
    return {
        'X-ChatWorkToken': token,
        'Content-Type': 'application/x-www-form-urlencoded'
    };
}

/**
 * Send a message to a Chatwork room
 * @param {string} token - Chatwork API token
 * @param {string} roomId - Room ID
 * @param {string} message - Message body
 * @param {boolean} selfUnread - Mark as unread for sender (default: false)
 * @returns {Promise<{message_id: string}>}
 */
export async function sendMessage(token, roomId, message, selfUnread = false) {
    // Normalize roomId - strip 'rid' prefix if present
    const normalizedRoomId = String(roomId).replace(/^rid/, '');
    const url = `${CHATWORK_API_BASE}/rooms/${normalizedRoomId}/messages`;

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(token),
        body: new URLSearchParams({
            body: message,
            self_unread: selfUnread ? '1' : '0'
        })
    });

    if (!response.ok) {
        throw new Error(`Chatwork API error: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

/**
 * Send a message with [To:xxx] mention
 * @param {string} token - Chatwork API token
 * @param {string} roomId - Room ID
 * @param {string} accountId - Account ID to mention
 * @param {string} accountName - Account name for display
 * @param {string} message - Message body (without To tag)
 */
export async function sendToMessage(token, roomId, accountId, accountName, message) {
    const body = `[To:${accountId}] ${accountName}さん\n${message}`;
    return sendMessage(token, roomId, body);
}

/**
 * Create a task in a Chatwork room
 * @param {string} token - Chatwork API token
 * @param {string} roomId - Room ID
 * @param {string} body - Task description
 * @param {string[]} assigneeIds - Array of account IDs to assign
 * @param {Date|null} limitDate - Due date (optional)
 * @param {string} limitType - 'none', 'date', or 'time' (default: 'date')
 * @returns {Promise<{task_ids: number[]}>}
 */
export async function createTask(token, roomId, body, assigneeIds, limitDate = null, limitType = 'date') {
    const url = `${CHATWORK_API_BASE}/rooms/${roomId}/tasks`;

    const params = new URLSearchParams({
        body: body,
        to_ids: assigneeIds.join(',')
    });

    if (limitDate) {
        params.append('limit', Math.floor(limitDate.getTime() / 1000).toString());
        params.append('limit_type', limitType);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: getHeaders(token),
        body: params
    });

    if (!response.ok) {
        throw new Error(`Chatwork Task API error: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

/**
 * Get room members (useful for finding account IDs)
 * @param {string} token - Chatwork API token
 * @param {string} roomId - Room ID
 * @returns {Promise<Array<{account_id: number, name: string, role: string}>>}
 */
export async function getRoomMembers(token, roomId) {
    const normalizedRoomId = String(roomId).replace(/^rid/, '');
    const url = `${CHATWORK_API_BASE}/rooms/${normalizedRoomId}/members`;

    const response = await fetch(url, {
        headers: getHeaders(token)
    });

    if (!response.ok) {
        throw new Error(`Chatwork Members API error: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

/**
 * Format a message using a template and data
 * @param {string} template - Message template with {key} placeholders
 * @param {Object} data - Key-value pairs to substitute
 * @returns {string} Formatted message
 */
export function formatMessage(template, data) {
    // Handle undefined or null template
    if (!template) return '';

    let result = String(template);
    for (const [key, value] of Object.entries(data)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
    }

    // Also handle nested keys like {allFields.Phone} or {allFields.カナ}
    result = result.replace(/\{allFields\.([^}]+)\}/g, (match, key) => {
        return data.allFields?.[key] || '';
    });

    return result;
}
