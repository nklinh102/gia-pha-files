// netlify/functions/upload-media.js
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
    if (!payload.path || !payload.content) {
      throw new Error("Dữ liệu file không hợp lệ.");
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ message: e.message }) };
  }
  const base64Data = payload.content.split(',')[1];
  if (!base64Data) {
    return { statusCode: 400, body: JSON.stringify({ message: "Định dạng Base64 không hợp lệ." }) };
  }
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  try {
    await octokit.repos.createOrUpdateFileContents({
      owner: GITHUB_USER, repo: GITHUB_REPO, path: payload.path, branch: GIT_BRANCH,
      message: `Tải lên file: ${payload.path}`,
      content: base64Data, encoding: 'base64'
    });
    const jsDelivrUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${GIT_BRANCH}/${payload.path}`;
    return { statusCode: 200, body: JSON.stringify({ message: "Tải lên thành công!", url: jsDelivrUrl }) };
  } catch (error) {
    console.error("Lỗi khi tải file lên GitHub:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Lỗi khi tải file: " + error.message }) };
  }
};