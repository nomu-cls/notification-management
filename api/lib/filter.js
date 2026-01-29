/**
 * Evaluate a filter condition against data
 * @param {Object} filter - { targetColumn, operator, targetValue }
 * @param {Object} allFields - Data from spreadsheet row
 * @returns {boolean} - True if action should proceed
 */
export function evaluateFilter(filter, allFields = {}) {
    if (!filter || !filter.targetColumn) {
        return true; // No filter set, always execute
    }

    const { targetColumn, operator = 'equals', targetValue = '' } = filter;

    // Get the value from the data
    const actualValue = String(allFields[targetColumn] || '').trim();
    const expectedValue = String(targetValue || '').trim();

    if (operator === 'equals') {
        return actualValue === expectedValue;
    } else if (operator === 'not_equals') {
        return actualValue !== expectedValue;
    }

    return true; // Fallback for unknown operators
}
