import { readSheet } from '../lib/sheets.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { spreadsheetId, sheetName } = req.query;

    if (!spreadsheetId || !sheetName) {
        return res.status(400).json({ error: 'Missing spreadsheetId or sheetName' });
    }

    try {
        // Read only the first row (headers)
        const range = `${sheetName}!A1:Z1`;
        const values = await readSheet(spreadsheetId, range);

        if (!values || values.length === 0) {
            return res.json({ headers: [] });
        }

        return res.json({ headers: values[0] });
    } catch (error) {
        console.error('Failed to fetch headers:', error);
        return res.status(500).json({ error: error.message });
    }
}
