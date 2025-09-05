// netlify/functions/submitProposal.js

const { google } = require('googleapis');

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Phương thức không được phép' })
    };
  }

  const SPREADSHEET_ID = '1z-LGeQo8w0jzF9mg8LD_bMsXKEvtgc_lgY5F-EkTgBY';
  const PENDING_SHEET_NAME = 'PendingMembers';

  const { parentId, name, birth, death, note, avatarUrl } = JSON.parse(event.body);

  if (!name || !parentId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Thiếu trường dữ liệu bắt buộc' })
    };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const values = [
      ['', parentId, name, birth, death, note, avatarUrl]
    ];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${PENDING_SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Đề xuất đã được gửi thành công.' })
    };
  } catch (error) {
    console.error('Lỗi API:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Đã xảy ra lỗi khi ghi vào Google Sheet.' })
    };
  }
};