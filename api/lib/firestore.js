/**
 * Configuration helper for API routes
 * Now using Environment Variables instead of Firestore to avoid Service Account issues.
 */

/**
 * Get configuration from Environment Variables
 * @returns {Promise<Object>} Configuration object
 */
export async function getConfig() {
    return {
        // Essential Secrets
        chatworkToken: process.env.ADMIN_CHATWORK_TOKEN,

        // Case 1 (Consultation)
        roomId: process.env.CONSULTATION_ROOM_ID,
        consultationTemplate: process.env.CONSULTATION_TEMPLATE,

        // Case 2 (Application)
        applicationRoomA: process.env.APPLICATION_ROOM_A,
        applicationRoomB: process.env.APPLICATION_ROOM_B,
        applicationTemplateA: process.env.APPLICATION_TEMPLATE_A,
        applicationTemplateB: process.env.APPLICATION_TEMPLATE_B,
        taskAssigneeIds: process.env.TASK_ASSIGNEE_IDS ? process.env.TASK_ASSIGNEE_IDS.split(',') : []
    };
}

/**
 * Save configuration (No-op in environment-variable mode)
 */
export async function saveConfig() {
    console.warn('saveConfig is not supported in Environment Variable mode.');
}

/**
 * Get staff chat mapping (Fallback to empty)
 */
export async function getStaffChatMapping() {
    return {};
}

/**
 * Get assignment viewer sources (Fallback to empty)
 */
export async function getAssignmentViewerConfig() {
    return null;
}
