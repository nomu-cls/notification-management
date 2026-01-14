/**
 * Google Sheets API Wrapper
 * Provides utility functions for reading/writing to Google Sheets
 */

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

/**
 * Get Google Sheets API access token using service account
 * @returns {Promise<string>} Access token
 */
async function getAccessToken() {
    // For Vercel, we use a service account JSON stored in environment variable
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    const jwt = await createJWT(serviceAccount);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });

    const data = await tokenResponse.json();
    return data.access_token;
}

/**
 * Create JWT for Google OAuth
 */
async function createJWT(serviceAccount) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    };

    const encodedHeader = btoa(JSON.stringify(header));
    const encodedPayload = btoa(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Import the private key and sign
    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        pemToBinary(serviceAccount.private_key),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKey,
        new TextEncoder().encode(signatureInput)
    );

    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

/**
 * Convert PEM to binary for crypto.subtle
 */
function pemToBinary(pem) {
    const base64 = pem
        .replace('-----BEGIN PRIVATE KEY-----', '')
        .replace('-----END PRIVATE KEY-----', '')
        .replace(/\n/g, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Read values from a sheet
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} range - A1 notation range (e.g., "Sheet1!A:Z")
 * @returns {Promise<string[][]>} 2D array of values
 */
export async function readSheet(spreadsheetId, range) {
    const token = await getAccessToken();
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error(`Sheets API error: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.values || [];
}

/**
 * Write values to a sheet
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} range - A1 notation range
 * @param {string[][]} values - 2D array of values to write
 */
export async function writeSheet(spreadsheetId, range, values) {
    const token = await getAccessToken();
    const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values })
    });

    if (!response.ok) {
        throw new Error(`Sheets API write error: ${response.status} ${await response.text()}`);
    }

    return response.json();
}

/**
 * Find a row by matching a column value
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet name
 * @param {number} searchColumn - Column index (0-based) to search
 * @param {string} searchValue - Value to match
 * @returns {Promise<{rowIndex: number, rowData: string[]} | null>}
 */
export async function findRow(spreadsheetId, sheetName, searchColumn, searchValue) {
    const values = await readSheet(spreadsheetId, `${sheetName}!A:Z`);

    for (let i = 0; i < values.length; i++) {
        if (values[i][searchColumn] === searchValue) {
            return { rowIndex: i + 1, rowData: values[i] }; // 1-indexed for Sheets
        }
    }

    return null;
}

/**
 * Update a specific cell
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {string} sheetName - Sheet name
 * @param {number} row - Row number (1-indexed)
 * @param {number} col - Column number (1-indexed)
 * @param {string} value - Value to write
 */
export async function updateCell(spreadsheetId, sheetName, row, col, value) {
    const colLetter = String.fromCharCode(64 + col); // 1=A, 2=B, etc.
    const range = `${sheetName}!${colLetter}${row}`;
    return writeSheet(spreadsheetId, range, [[value]]);
}
