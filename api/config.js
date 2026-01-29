import { getConfig, listPromotions } from './lib/firestore.js';

export default async function handler(req, res) {
    // Allow GET for fetching config
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const mainConfig = await getConfig();
        const promotions = await listPromotions();

        // Aggregate rules from all promotions
        let allRules = [...(mainConfig.notificationRules || [])];
        let bookingSheets = [mainConfig.bookingListSheet];

        for (const promo of promotions) {
            const promoConfig = await getConfig(promo.id);
            if (promoConfig.notificationRules) {
                allRules = [...allRules, ...promoConfig.notificationRules];
            }
            if (promoConfig.bookingListSheet) {
                bookingSheets.push(promoConfig.bookingListSheet);
            }
        }

        // Return aggregated config for GAS to know which sheets to trigger
        return res.status(200).json({
            applicationSheetName: mainConfig.applicationSheetName || '',
            workshopSheetName: mainConfig.workshopSheetName || '',
            bookingListSheet: mainConfig.bookingListSheet, // legacy single sheet
            bookingSheets: bookingSheets.filter(Boolean),  // all sheets that trigger consultation
            notificationRules: allRules.filter(r => r && r.sheetName),
            // Deprecated fields
            applicationRoomA: mainConfig.applicationRoomA || '',
            applicationRoomB: mainConfig.applicationRoomB || '',
            workshopReportRoom: mainConfig.workshopReportRoom || ''
        });
    } catch (error) {
        console.error('Config fetch error:', error);
        return res.status(500).json({ error: error.message });
    }
}
