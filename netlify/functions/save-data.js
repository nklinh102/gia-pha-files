// netlify/functions/save-data.js
const { Octokit } = require("@octokit/rest");

exports.handler = async (event, context) => {
  // 1. Xác thực: Chỉ admin mới được chạy hàm này
  const { user } = context.clientContext;
  if (!user || !user.app_metadata || !user.app_metadata.roles.includes('admin')) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Chỉ admin mới có quyền lưu." }),
    };
  }

  // 2. Lấy GITHUB_TOKEN (bạn sẽ cài ở Bước 5)
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: "Lỗi cấu hình: Thiếu GITHUB_TOKEN." };
  }

  // 3. Lấy dữ liệu mới từ frontend gửi lên
  const newData = JSON.parse(event.body);

  // 4. Cấu hình thông tin kho lưu trữ GitHub của bạn
  const GITHUB_USER = "TEN_GITHUB_CUA_BAN"; // Thay bằng tên user/org GitHub
  const GITHUB_REPO = "TEN_REPO_CUA_BAN";  // Thay bằng tên repo
  const FILE_PATH = "data/tree-data.json"; // Đường dẫn đến file dữ liệu

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const contentBase64 = Buffer.from(JSON.stringify(newData, null, 2)).toString("base64");

  try {
    // 5. Lấy SHA của file cũ (bắt buộc để update)
    const { data: fileData } = await octokit.repos.getContent({
      owner: GITHUB_USER,
      repo: GITHUB_REPO,
      path: FILE_PATH,
    });

    // 6. Ghi đè (commit) file mới
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USER,
      repo: GITHUB_REPO,
      path: FILE_PATH,
      message: `Cập nhật gia phả lúc ${new Date().toISOString()}`,
      content: contentBase64,
      sha: fileData.sha, // Cung cấp SHA để GitHub biết đây là update
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Đã lưu thành công lên GitHub!" }),
    };
  } catch (error) {
    console.error("Lỗi khi lưu vào GitHub:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Lỗi khi lưu: " + error.message }),
    };
  }
};
