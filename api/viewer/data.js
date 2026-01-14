import { readSheet } from '../lib/sheets.js';
import { getConfig } from '../lib/firestore.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id, promotionId } = req.query; // email or hash, and optional promotionId
    if (!id) {
        return res.status(400).json({ error: 'Missing ID' });
    }

    try {
        const config = await getConfig(promotionId);
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

        // 2. Fetch Assignments Status and Details
        const assignmentSsId = viewerConfig.spreadsheetId;
        const assignments = viewerConfig.assignments || [];

        // Always include Pre-Survey at the top
        const masterDetails = [];
        headers.forEach((header, index) => {
            if (!header) return;
            const isName = header.includes('氏名') || header.includes('名前') || header.includes('お名前');
            const isEmail = header.includes('メール') || header.toLowerCase().includes('email');
            const isTimestamp = header.includes('タイムスタンプ') || header.toLowerCase().includes('timestamp') || header === 'Timestamp';
            const isNo = header.trim().toLowerCase() === 'no' || header === 'No.' || header === 'NO' || header.trim().toUpperCase() === 'ID';

            // Skip index 0 (No/Timestamp column) as per user request, and other filtered columns
            if (index !== 0 && !isName && !isEmail && !isTimestamp && !isNo) {
                masterDetails.push({
                    label: header,
                    value: userRow[index] || ''
                });
            }
        });

        const results = [{
            name: masterSheetName,
            submitted: true,
            lastUpdated: '回答済み',
            details: masterDetails
        }];

        for (const assignment of assignments) {
            const sheetName = assignment.name;
            try {
                const sheetData = await readSheet(assignmentSsId || masterSsId, `${sheetName}!A:Z`);
                const h = sheetData[0] || [];
                const eIdx = h.findIndex(col => col && (col.includes('メール') || col.toLowerCase().includes('email')));

                // If email column not found, try name
                const nIdx = h.findIndex(col => col && (col.includes('氏名') || col.includes('名前')));

                let submissionRow = null;
                if (eIdx !== -1) {
                    submissionRow = sheetData.find(row => row[eIdx] === userEmail);
                } else if (nIdx !== -1) {
                    submissionRow = sheetData.find(row => row[nIdx] === userName);
                }

                if (submissionRow) {
                    // Extract details
                    const details = [];
                    h.forEach((header, index) => {
                        if (!header) return;
                        // Exclude Name and Email and Timestamp from details
                        const isName = header.includes('氏名') || header.includes('名前') || header.includes('お名前');
                        const isEmail = header.includes('メール') || header.toLowerCase().includes('email');
                        const isTimestamp = header.includes('タイムスタンプ') || header.toLowerCase().includes('timestamp') || header === 'Timestamp';
                        const isNo = header.trim().toLowerCase() === 'no' || header === 'No.' || header === 'NO' || header.trim().toUpperCase() === 'ID';

                        if (index !== 0 && !isName && !isEmail && !isTimestamp && !isNo) {
                            details.push({
                                label: header,
                                value: submissionRow[index] || ''
                            });
                        }
                    });

                    results.push({
                        name: sheetName,
                        submitted: true,
                        lastUpdated: '提出済み',
                        details: details
                    });
                } else {
                    results.push({
                        name: sheetName,
                        submitted: false,
                        lastUpdated: '未提出',
                        details: []
                    });
                }
            } catch (err) {
                console.warn(`Failed to fetch assignment sheet ${sheetName}:`, err.message);
                results.push({
                    name: sheetName,
                    submitted: false,
                    error: 'シートが読み込めませんでした',
                    details: []
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
