import { readSheet } from '../lib/sheets.js';
import { getConfig } from '../lib/firestore.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query; // email or hash
    if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
    }

    try {
        const config = await getConfig();
        const viewerConfig = config.assignmentViewer;
        const salt = process.env.VIEWER_URL_SALT || 'default-salt';

        if (!viewerConfig || !viewerConfig.questionnaire?.ssId) {
            return res.status(404).json({ error: 'Viewer not configured' });
        }

        // 1. Fetch Master Data (Questionnaire)
        const masterSsId = viewerConfig.questionnaire.ssId;
        const masterSheetName = viewerConfig.questionnaire.sheetName || '事前アンケート';
        const masterData = await readSheet(masterSsId, `${masterSheetName}!A:Z`);

        if (masterData.length === 0) {
            return res.status(404).json({ error: 'Master sheet is empty' });
        }

        const headers = masterData[0];
        const emailColIdx = headers.findIndex(h => h && (h.includes('メール') || h.toLowerCase().includes('email')));
        const nameColIdx = headers.findIndex(h => h && (h.includes('氏名') || h.includes('名前') || h.includes('お名前')));

        if (emailColIdx === -1 && nameColIdx === -1) {
            return res.status(500).json({ error: 'Identifiable columns not found in master sheet' });
        }

        // Search for user by ID (could be email or hash)
        let userRow = null;
        for (let i = 1; i < masterData.length; i++) {
            const row = masterData[i];
            const email = row[emailColIdx];
            const name = row[nameColIdx];

            // Check email match
            if (email === id) {
                userRow = row;
                break;
            }

            // Check hash match
            const input = `${salt}:${email || name}`;
            const hash = crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
            if (hash === id) {
                userRow = row;
                break;
            }
        }

        if (!userRow) {
            return res.status(404).json({ error: 'User not found in master sheet' });
        }

        const userName = userRow[nameColIdx] || '不明';
        const userEmail = userRow[emailColIdx];

        // 2. Fetch Assignments Status
        const assignmentSsId = viewerConfig.spreadsheetId; // If empty, fallback to questionnaire SS?
        const assignments = viewerConfig.assignments || [];
        const results = [];

        for (const assignment of assignments) {
            const sheetName = assignment.name;
            try {
                const sheetData = await readSheet(assignmentSsId || masterSsId, `${sheetName}!A:Z`);
                const h = sheetData[0] || [];
                const eIdx = h.findIndex(col => col && (col.includes('メール') || col.toLowerCase().includes('email')));

                // If email column not found, try name
                const nIdx = h.findIndex(col => col && (col.includes('氏名') || col.includes('名前')));

                let submitted = false;
                if (eIdx !== -1) {
                    submitted = sheetData.some(row => row[eIdx] === userEmail);
                } else if (nIdx !== -1) {
                    submitted = sheetData.some(row => row[nIdx] === userName);
                }

                results.push({
                    name: sheetName,
                    submitted,
                    lastUpdated: submitted ? '提出済み' : '未提出'
                });
            } catch (err) {
                console.warn(`Failed to fetch assignment sheet ${sheetName}:`, err.message);
                results.push({
                    name: sheetName,
                    submitted: false,
                    error: 'シートが読み込めませんでした'
                });
            }
        }

        return res.status(200).json({
            userName,
            userEmail,
            assignments: results
        });

    } catch (error) {
        console.error('Viewer Data API Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
