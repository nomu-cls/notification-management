
/**
 * スプレッドシート書き込みのテスト関数
 * エディタから直接実行して、書き込みができるか確認します
 */
function testSheetWrite() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = '個別相談予約一覧';
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
        Logger.log(`Error: Sheet "${sheetName}" not found.`);
        // 存在するシート一覧を表示
        const sheets = ss.getSheets();
        Logger.log('Available sheets:');
        sheets.forEach(s => Logger.log(`- ${s.getName()}`));
        return;
    }

    Logger.log(`Found sheet: ${sheetName}`);

    const testRow = [
        new Date().toLocaleString(), // 日時
        'テスト 太郎', // 名前
        'テスト タロウ', // カナ
        'test@example.com', // メール
        '090-0000-0000', // 電話
        '',
        '',
        '野村', // 担当者
        'https://zoom.us/test' // Zoom
    ];

    try {
        sheet.appendRow(testRow);
        Logger.log(`Successfully appended row to ${sheetName}`);

        // Viewer URLの書き込みテストも行う
        const lastRow = sheet.getLastRow();
        Logger.log(`New row index: ${lastRow}`);

        // Column O (15列目)
        sheet.getRange(lastRow, 15).setValue('https://test-viewer-url');
        Logger.log('Successfully wrote Viewer URL to Column O');

    } catch (e) {
        Logger.log(`Error writing to sheet: ${e.toString()}`);
    }
}
