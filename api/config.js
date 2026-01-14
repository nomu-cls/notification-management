import { getConfig } from './lib/firestore.js';

export default async function handler(req, res) {
    // Allow GET for fetching config
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const config = await getConfig();

        // Return only the necessary fields for GAS
        return res.status(200).json({
            applicationSheetName: config.applicationSheetName || '',
            workshopSheetName: config.workshopSheetName || '',
            applicationRoomA: config.applicationRoomA || '',
            applicationRoomB: config.applicationRoomB || '',
            workshopReportRoom: config.workshopReportRoom || ''
        });
    } catch (error) {
        console.error('Config fetch error:', error);
        return res.status(500).json({ error: error.message });
    }
}
