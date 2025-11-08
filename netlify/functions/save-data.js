// netlify/functions/save-data.js
const { Octokit } = require("@octokit/rest");

const GITHUB_USER = "nklinh102";
const GITHUB_REPO = "gia-pha-files";
const GIT_BRANCH = "main";

exports.handler = async (event, context) => {
  const { user } = context.clientContext;
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ message: "Bạn cần đăng nhập." }) };
  }
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return { statusCode: 500, body: "Lỗi cấu hình: Thiếu GITHUB_TOKEN." };
  }
  let payload;
  try {
    payload = JSON.parse(event.body);
    if (!payload.filePath || payload.data === undefined) {
      throw new Error("Dữ liệu gửi lên không hợp lệ.");
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ message: e.message }) };
  }
  const { filePath, data } = payload;
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const contentBase64 = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");
  try {
    let currentSha;
    try {
      const { data: fileData } = await octokit.repos.getContent({
        owner: GITHUB_USER, repo: GITHUB_REPO, path: filePath, ref: GIT_BRANCH,
      });
      currentSha = fileData.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USER, repo: GITHUB_REPO, path: filePath, branch: GIT_BRANCH,
      message: `Cập nhật file ${filePath} lúc ${new Date().toISOString()}`,
      content: contentBase64, sha: currentSha,
    });
    return { statusCode: 200, body: JSON.stringify({ message: `Đã lưu ${filePath} thành công!` }) };
  } catch (error) {
    console.error("Lỗi khi lưu vào GitHub:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Lỗi khi lưu: " + error.message }) };
  }
};