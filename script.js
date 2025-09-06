// ===================================================================
// ====== THÔNG TIN CẤU HÌNH ======
// ===================================================================
const API_KEY = 'AIzaSyAOnCKz1lJjkWvJhWuhc9p0GMXcq3EJ-5U';
const CLIENT_ID = '44689282931-21nb0br3on3v8dscjfibrfutg7isj9fj.apps.googleusercontent.com';
const SPREADSHEET_ID = '1z-LGeQo8w0jzF9mg8LD_bMsXKEvtgc_lgY5F-EkTgBY';
const ADMIN_EMAIL = 'nklinh102@gmail.com';
const INDEX_SHEET_NAME = '_index';
const SETTINGS_SHEET_NAME = 'settings';

// ===================================================================
// ====== Trạng thái & Hằng số ======
// ===================================================================
const THEME_KEY = 'familyTreeTheme.v13';
const GEN1_W = 400, GEN1_H = 90;
const GEN2_W = 330, GEN2_H = 85;
const GEN345_W = 200, GEN345_H = 72;
const GEN6PLUS_W = 60, GEN6PLUS_H = 180;
const VERTICAL_THRESHOLD = 5;
let gapX = 40;
const DEFAULT_GAP_Y = 50;

let currentSheetName = '';
let data = null, scale = 1, panX = 80, panY = 60;
let treeSize = { w: 0, h: 0 };
let yPositions = {};
let history = [], future = [];
let isOwner = false;
let gapiInited = false;
let oauthToken = null;
let hasUnsavedChanges = false;
let highlightedNodeId = null;
let hoveredNodeId = null;
let savedTitle = 'Sơ Đồ Gia Phả';
let treeIndex = [];
let isRenderScheduled = false;

// DOM selectors
const $ = s => document.querySelector(s);
const app = $('.app');
const appTitle = $('#appTitle');
const canvasContainer = $('#canvas-container');
const treeCanvas = $('#tree-canvas');
const ctx = treeCanvas.getContext('2d');
const authContainer = $('#auth-container');
const treeSelector = $('#tree-selector');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function setUnsavedChanges(isDirty) {
    hasUnsavedChanges = isDirty;
    const saveBtn = $('#btnSaveChanges');
    if (saveBtn) { saveBtn.disabled = !isDirty; }
    if (isDirty) {
        if (!document.title.endsWith(' *')) { document.title = savedTitle + ' *'; }
    } else { document.title = savedTitle; }
}

async function saveAllChanges() {
    if (!isOwner) return;
    const saveBtn = $('#btnSaveChanges');
    saveBtn.textContent = 'Đang lưu...';
    saveBtn.disabled = true;
    await Promise.all([saveTreeData(), saveSettingsToSheet()]);
    setUnsavedChanges(false);
    saveBtn.textContent = 'Lưu Thay Đổi';
    alert('Đã lưu tất cả thay đổi thành công!');
}

async function saveTreeData() {
    if (!isOwner || !currentSheetName) return;
    try {
        await gapi.client.sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: currentSheetName });
        if (data) {
            const rows = [['id', 'parentId', 'name', 'birth', 'death', 'note', 'avatarUrl']];
            (function walk(node, parentId = '') {
                rows.push([`'${node.id}`, parentId ? `'${parentId}` : '', node.name || '', node.birth || '', node.death || '', node.note || '', node.avatarUrl || '']);
                if (node.children) node.children.forEach(c => walk(c, node.id));
            })(data);
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${currentSheetName}!A1`,
                valueInputOption: 'USER-ENTERED',
                resource: { values: rows }
            });
        }
    } catch (err) {
        console.error("Lỗi khi đồng bộ cây gia phả:", err);
        alert("Đã xảy ra lỗi khi lưu dữ liệu vào Google Sheet: " + (err.result?.error?.message || err.message));
    }
}

const snapshot = () => JSON.stringify(data);

function pushHistory() {
    history.push(snapshot());
    if (history.length > 50) history.shift();
    future = [];
    $('#btnUndo').disabled = history.length === 0;
    $('#btnRedo').disabled = true;
}

function undo() {
    if (!isOwner || !history.length) return;
    future.push(snapshot());
    data = JSON.parse(history.pop());
    highlightedNodeId = null;
    updateSelectionActions();
    updateLayoutAndRender();
    setUnsavedChanges(true);
    $('#btnUndo').disabled = history.length === 0;
    $('#btnRedo').disabled = false;
}

function redo() {
    if (!isOwner || !future.length) return;
    history.push(snapshot());
    data = JSON.parse(future.pop());
    highlightedNodeId = null;
    updateSelectionActions();
    updateLayoutAndRender();
    setUnsavedChanges(true);
    $('#btnRedo').disabled = future.length === 0;
    $('#btnUndo').disabled = false;
}

function findById(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findById(child, id);
            if (found) return found;
        }
    }
    return null;
}

function findParent(startNode, childId, parent = null) {
    if (!startNode) return null;
    if (startNode.id === childId) return parent;
    if (startNode.children) {
        for (const child of startNode.children) {
            const found = findParent(child, childId, startNode);
            if (found) return found;
        }
    }
    return null;
}

function measure(n, depth = 0) {
    let nodeWidth;
    if (depth === 0) nodeWidth = GEN1_W;
    else if (depth === 1) nodeWidth = GEN2_W;
    else if (depth >= VERTICAL_THRESHOLD) nodeWidth = GEN6PLUS_W;
    else nodeWidth = GEN345_W;

    if (!n.children || n.children.length === 0) {
        return nodeWidth;
    }
    const childrenWidth = n.children.map(c => measure(c, depth + 1)).reduce((a, b) => a + b, 0);
    const gapsBetweenChildren = (n.children.length - 1) * gapX;
    return Math.max(nodeWidth, childrenWidth + gapsBetweenChildren);
}

function updateLayout() {
    if (!data) return;
    yPositions = { 0: 100 };
    calculateYPositions(data, 0);

    function position(n, depth, left, y) {
        if (depth === 0) { n._w = GEN1_W; n._h = GEN1_H; }
        else if (depth === 1) { n._w = GEN2_W; n._h = GEN2_H; }
        else if (depth >= VERTICAL_THRESHOLD) { n._w = GEN6PLUS_W; n._h = GEN6PLUS_H; }
        else { n._w = GEN345_W; n._h = GEN345_H; }
        
        n.depth = depth;
        n._y = y;
        const subtreeWidth = measure(n, depth);
        n._x = left + subtreeWidth / 2;

        if (n.children && n.children.length > 0) {
            const childrenTotalWidth = n.children.map(c => measure(c, depth + 1)).reduce((a, b) => a + b, 0) + (n.children.length - 1) * gapX;
            let cursor = n._x - childrenTotalWidth / 2;
            const nextY = yPositions[depth + 1];
            for (const child of n.children) {
                const childSubtreeWidth = measure(child, depth + 1);
                position(child, depth + 1, cursor, nextY);
                cursor += childSubtreeWidth + gapX;
            }
        }
    }
    const totalWidth = measure(data);
    position(data, 0, 50, yPositions[0]);
    const maxDepth = getTreeDepth(data);
    let lastGenHeight = maxDepth >= VERTICAL_THRESHOLD ? GEN6PLUS_H : GEN345_H;
    treeSize = { w: Math.max(totalWidth, 1000) + 100, h: (yPositions[maxDepth] || 100) + lastGenHeight + 50 };
}

function calculateYPositions(n, depth) {
    if (n.children && n.children.length > 0) {
        let parentH = (depth === 0) ? GEN1_H : (depth === 1) ? GEN2_H : (depth >= VERTICAL_THRESHOLD) ? GEN6PLUS_H : GEN345_H;
        let nextDepth = depth + 1;
        let childH = (nextDepth === 1) ? GEN2_H : (nextDepth >= VERTICAL_THRESHOLD) ? GEN6PLUS_H : GEN345_H;
        const nextY = yPositions[depth] + parentH / 2 + childH / 2 + DEFAULT_GAP_Y;
        if (!yPositions[nextDepth] || nextY > yPositions[nextDepth]) {
            yPositions[nextDepth] = nextY;
        }
        n.children.forEach(c => calculateYPositions(c, nextDepth));
    }
}

function getTreeDepth(n) {
    if (!n || !n.children || n.children.length === 0) return 0;
    return 1 + Math.max(...n.children.map(getTreeDepth));
}

function scheduleRender() {
    if (!isRenderScheduled) {
        isRenderScheduled = true;
        requestAnimationFrame(() => {
            render();
            isRenderScheduled = false;
        });
    }
}

function render() {
    resizeCanvas();
    ctx.save();
    ctx.clearRect(0, 0, treeCanvas.width, treeCanvas.height);

    if (!data) {
        ctx.font = "18px sans-serif";
        ctx.fillStyle = getCssVar('--ink');
        ctx.textAlign = 'center';
        ctx.fillText("Không có dữ liệu. Hãy tạo gốc hoặc nhập file CSV.", treeCanvas.width / 2, treeCanvas.height / 2);
        ctx.restore();
        return;
    }

    ctx.translate(panX, panY);
    ctx.scale(scale, scale);
    drawTree(data);
    ctx.restore();
}

function drawTree(node) {
    if (node.children) {
        node.children.forEach(child => drawConnection(node, child));
    }
    drawNode(node);
    if (node.children) {
        node.children.forEach(child => drawTree(child));
    }
}

function drawConnection(parent, child) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(138,160,181,.7)';
    ctx.lineWidth = 4;
    const x1 = parent._x, y1 = parent._y + parent._h / 2;
    const x2 = child._x, y2 = child._y - child._h / 2;
    const midY = (y1 + y2) / 2;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, midY);
    ctx.lineTo(x2, midY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function drawNode(node) {
    const x = node._x - node._w / 2;
    const y = node._y - node._h / 2;
    const isHighlighted = highlightedNodeId === node.id;

    ctx.save();
    ctx.shadowBlur = isHighlighted ? 20 : 15;
    ctx.shadowColor = isHighlighted ? getCssVar('--accent') : 'rgba(0,0,0,.5)';
    ctx.shadowOffsetY = 5;

    ctx.fillStyle = getCssVar('--card');
    ctx.strokeStyle = isHighlighted ? getCssVar('--accent') : getCssVar('--border');
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, node._w, node._h, [15]);
    else ctx.rect(x, y, node._w, node._h);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    const name = node.name || 'Chưa đặt tên';
    const meta = [node.birth || '', node.death ? `– ${node.death}` : ''].join(' ').trim();
    ctx.fillStyle = getCssVar('--ink');
    ctx.textAlign = 'center';

    if (node.depth >= VERTICAL_THRESHOLD) {
        ctx.save();
        ctx.translate(node._x, node._y);
        ctx.rotate(Math.PI / 2);
        ctx.font = `bold 18px sans-serif`;
        ctx.fillText(name, 0, 0);
        ctx.restore();
    } else {
        const fontSize = (node.depth === 0) ? 18 : 15;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(name, node._x, node._y - (meta ? 8 : 0));
        if (meta) {
            ctx.font = `13px sans-serif`;
            ctx.fillStyle = getCssVar('--muted');
            ctx.fillText(meta, node._x, node._y + 12);
        }
    }
    ctx.restore();
}

function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (treeCanvas.width !== rect.width * dpr || treeCanvas.height !== rect.height * dpr) {
        treeCanvas.width = rect.width * dpr;
        treeCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        scheduleRender();
    }
}

function updateSelectionActions() {
    const panel = $('#selection-actions');
    if (highlightedNodeId && isOwner) {
        const node = findById(data, highlightedNodeId);
        if (node) {
            $('#selection-name-value').textContent = node.name;
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    } else {
        panel.classList.add('hidden');
    }
}

function getCoordsFromEvent(e) {
    const rect = treeCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / scale;
    const y = (e.clientY - rect.top - panY) / scale;
    return { x, y };
}

function getNodeAtPoint(worldX, worldY) {
    let found = null;
    function check(node) {
        const x1 = node._x - node._w / 2;
        const y1 = node._y - node._h / 2;
        const x2 = node._x + node._w / 2;
        const y2 = node._y + node._h / 2;
        if (worldX >= x1 && worldX <= x2 && worldY >= y1 && worldY <= y2) {
            found = node;
        }
        if (!found && node.children) {
            node.children.forEach(check);
        }
    }
    if (data) check(data);
    return found;
}

function handleCanvasClick(e) {
    const { x, y } = getCoordsFromEvent(e);
    const node = getNodeAtPoint(x, y);
    highlightedNodeId = node ? (highlightedNodeId === node.id ? null : node.id) : null;
    updateSelectionActions();
    scheduleRender();
}

function openModal(title, init, onSave) {
    const modal = $('#modal');
    $('#mTitle').textContent = title;
    $('#mName').value = init?.name || '';
    $('#mBirth').value = init?.birth || '';
    $('#mDeath').value = init?.death || '';
    $('#mNote').value = init?.note || '';
    modal.classList.add('show');

    const btnSave = $('#mSave');
    const btnCancel = $('#mCancel');

    const saveHandler = () => {
        const name = $('#mName').value.trim();
        if (!name) {
            alert('Vui lòng nhập họ và tên.');
            return;
        }
        onSave({
            name,
            birth: $('#mBirth').value.trim(),
            death: $('#mDeath').value.trim(),
            note: $('#mNote').value.trim(),
        });
        cleanup();
    };

    const cleanup = () => {
        modal.classList.remove('show');
        btnSave.removeEventListener('click', saveHandler);
    };

    btnSave.addEventListener('click', saveHandler);
    btnCancel.onclick = cleanup;
    modal.onclick = (e) => { if (e.target === modal) cleanup(); };
}

function openConfirm(message, onYes) {
    const dialog = $('#confirm');
    $('#cMsg').textContent = message;
    dialog.classList.add('show');
    $('#cYes').onclick = () => { onYes(); dialog.classList.remove('show'); };
    $('#cNo').onclick = () => dialog.classList.remove('show');
    dialog.onclick = (e) => { if (e.target === dialog) dialog.classList.remove('show'); };
}

function onAddRoot() {
    if (!isOwner) return;
    if (data) return alert('Cây đã có gốc.');
    pushHistory();
    data = { id: '1', name: 'Tổ tiên', children: [] };
    setUnsavedChanges(true);
    updateLayoutAndRender();
}

function onAddChild(parentId) {
    if (!isOwner || !parentId) return;
    const parent = findById(data, parentId);
    if (!parent) return;
    openModal('Thêm con cho ' + parent.name, {}, (newNodeData) => {
        pushHistory();
        if (!parent.children) parent.children = [];
        const newId = generateHierarchicalId(parent);
        parent.children.push({ id: newId, ...newNodeData, children: [] });
        setUnsavedChanges(true);
        updateLayoutAndRender();
    });
}

function onEditNode(nodeId) {
    if (!isOwner || !nodeId) return;
    const node = findById(data, nodeId);
    if (!node) return;
    openModal('Chỉnh sửa: ' + node.name, node, (updatedData) => {
        pushHistory();
        Object.assign(node, updatedData);
        setUnsavedChanges(true);
        updateLayoutAndRender();
    });
}

function onDel(node) {
    if (!isOwner || !node) return;
    const msg = data.id === node.id ?
        'Xóa gốc sẽ xóa toàn bộ cây. Bạn chắc chứ?' :
        'Xóa thành viên này và toàn bộ nhánh con của họ?';
    openConfirm(msg, () => {
        pushHistory();
        if (data.id === node.id) {
            data = null;
        } else {
            const parent = findParent(data, node.id);
            if (parent && parent.children) {
                parent.children = parent.children.filter(c => c.id !== node.id);
            }
        }
        if (highlightedNodeId === node.id) {
            highlightedNodeId = null;
        }
        updateSelectionActions();
        setUnsavedChanges(true);
        updateLayoutAndRender();
    });
}

function onExportCSV() {
    if (!data) return alert('Chưa có dữ liệu để xuất.');
    const rows = [['id', 'parentId', 'name', 'birth', 'death', 'note']];
    (function walk(node, parentId = '') {
        rows.push([node.id, parentId, node.name, node.birth, node.death, node.note]
            .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`));
        if (node.children) node.children.forEach(c => walk(c, node.id));
    })(data);
    const csvContent = rows.map(e => e.join(',')).join('\n');
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "gia-pha.csv";
    link.click();
    URL.revokeObjectURL(link.href);
}

function onFileImported(event) {
    if (!isOwner) return;
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            pushHistory();
            data = fromCSV(e.target.result);
            setUnsavedChanges(true);
            updateLayoutAndRender();
        } catch (err) {
            alert('Lỗi khi đọc file CSV: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

function fromCSV(text) {
    const lines = text.split(/[\r\n]+/).filter(line => line.trim());
    if (lines.length < 2) throw new Error("File CSV không hợp lệ hoặc trống.");
    const header = lines.shift().split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const map = new Map();
    let root = null;
    lines.forEach(line => {
        const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"'));
        const node = {};
        header.forEach((h, i) => node[h] = values[i]);
        node.children = [];
        map.set(node.id, node);
    });
    map.forEach(node => {
        if (node.parentid && map.has(node.parentid)) {
            map.get(node.parentid).children.push(node);
        } else {
            root = node;
        }
    });
    if (!root) throw new Error("Không tìm thấy nút gốc trong file CSV.");
    return root;
}

function generateHierarchicalId(parent) {
    if (!parent) return '1';
    const children = parent.children || [];
    let maxId = 0;
    children.forEach(child => {
        const parts = child.id.split('.');
        const lastPart = parseInt(parts[parts.length - 1], 10);
        if (lastPart > maxId) maxId = lastPart;
    });
    return `${parent.id}.${maxId + 1}`;
}

async function initializeGapiClient() {
    await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'], });
    gapiInited = true;
    const savedTokenString = sessionStorage.getItem('oauthToken');
    if (savedTokenString) {
        oauthToken = JSON.parse(savedTokenString);
        gapi.client.setToken(oauthToken);
        await loadUserInfo();
    } else {
        loadInitialData();
        updateAuthUI();
    }
}

function handleAuthClick() {
    const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = {
        'client_id': CLIENT_ID,
        'redirect_uri': window.location.href.split('#')[0],
        'response_type': 'token',
        'scope': 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
    };
    window.location = oauth2Endpoint + '?' + new URLSearchParams(params).toString();
}

function handleSignoutClick() {
    sessionStorage.removeItem('oauthToken');
    isOwner = false;
    oauthToken = null;
    if (gapi.client) gapi.client.setToken('');
    disableEditing();
    updateAuthUI();
}

async function loadUserInfo() {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${gapi.client.getToken().access_token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const profile = await res.json();
        if (profile.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            isOwner = true;
            authContainer.innerHTML = `Xin chào, <b>${profile.email}</b> (Quản trị)<br/><button id="signout-button" class="btn" style="width:100%; margin-top: 8px;">Đăng xuất</button>`;
            $('#signout-button').onclick = handleSignoutClick;
            enableEditing();
        } else {
            isOwner = false;
            authContainer.innerHTML = `Xin chào, <b>${profile.email}</b> (Chế độ xem)<br/><button id="signout-button" class="btn" style="width:100%; margin-top: 8px;">Đăng xuất</button>`;
            $('#signout-button').onclick = handleSignoutClick;
            disableEditing();
        }
        loadInitialData();
    } catch (err) {
        console.error("Lỗi tải thông tin người dùng:", err);
        handleSignoutClick();
        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        loadInitialData();
    }
}

function updateAuthUI() {
    if (!isOwner) {
        authContainer.innerHTML = `<button id="signin-button" class="btn" style="width:100%">Đăng nhập để chỉnh sửa</button>`;
        $('#signin-button').onclick = handleAuthClick;
    }
}

async function loadInitialData() {
    if (!gapiInited) return;
    try {
        const sheetData = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: [`${SETTINGS_SHEET_NAME}!A:B`, `${INDEX_SHEET_NAME}!A:B`],
        });
        const valueRanges = sheetData.result.valueRanges;
        const settingsRows = (valueRanges[0] && valueRanges[0].values) || [];
        const indexRows = (valueRanges[1] && valueRanges[1].values) || [];
        
        const settings = settingsRows.reduce((acc, row) => {
            if (row[0]) acc[row[0]] = row[1];
            return acc;
        }, {});
        
        const centralTitle = settings.tree_title || 'Sơ Đồ Gia Phả';
        savedTitle = centralTitle;
        appTitle.textContent = centralTitle;
        document.title = centralTitle;

        if (!indexRows || indexRows.length < 2) throw new Error('Sheet "_index" không đúng định dạng.');
        treeIndex = indexRows.slice(1).map(row => ({ displayName: row[0], sheetName: row[1] })).filter(Boolean);
        populateTreeSelector();

        const lastSheet = localStorage.getItem('lastSheet');
        const initialSheet = (treeIndex.find(t => t.sheetName === lastSheet))?.sheetName || treeIndex[0]?.sheetName;
        if (initialSheet) {
            treeSelector.value = initialSheet;
            await loadTreeData(initialSheet);
        } else {
            throw new Error("Không có cây phả đồ nào hợp lệ.");
        }
    } catch (e) {
        alert('Không thể tải dữ liệu. Chi tiết: ' + (e?.result?.error?.message || e.message));
        data = null;
        scheduleRender();
    }
}

async function loadTreeData(sheetName) {
    if (!sheetName) return;
    currentSheetName = sheetName;
    document.body.style.cursor = 'wait';
    data = null;
    scheduleRender();
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:G`,
        });
        const treeRows = response.result.values;
        if (treeRows && treeRows.length > 0) {
            const csvText = treeRows.map(row => row.join(',')).join('\n');
            data = fromCSV(csvText);
        }
    } catch (e) {
        alert(`Không thể tải phả đồ "${sheetName}".`);
    } finally {
        updateLayoutAndRender();
        localStorage.setItem('lastSheet', sheetName);
        document.body.style.cursor = 'default';
        history = [];
        future = [];
        setUnsavedChanges(false);
        if (isOwner) {
            $('#btnUndo').disabled = true;
            $('#btnRedo').disabled = true;
        }
    }
}

async function saveSettingsToSheet() {
    if (!isOwner) return;
    const newTitle = appTitle.textContent.trim();
    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SETTINGS_SHEET_NAME}!A1:B1`,
            valueInputOption: 'USER-ENTERED',
            resource: { values: [['tree_title', newTitle]] }
        });
    } catch (err) { console.error("Lỗi khi lưu cài đặt:", err); }
}

function populateTreeSelector() {
    treeSelector.innerHTML = treeIndex.map(tree => `<option value="${tree.sheetName}">${tree.displayName}</option>`).join('');
}

function enableEditing() {
    document.body.classList.add('owner-mode');
    appTitle.setAttribute('contenteditable', 'true');
}

function disableEditing() {
    document.body.classList.remove('owner-mode');
    appTitle.removeAttribute('contenteditable');
}

function getCssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function loadGoogleAPIs() {
    const gapiScript = document.createElement('script');
    gapiScript.src = 'https://apis.google.com/js/api.js';
    gapiScript.defer = true;
    gapiScript.onload = () => window.gapiLoaded && window.gapiLoaded();
    document.head.appendChild(gapiScript);

    const gsiScript = document.createElement('script');
    gsiScript.src = 'https://accounts.google.com/gsi/client';
    gsiScript.defer = true;
    document.head.appendChild(gsiScript);
}

function handleRedirectCallbackAndLoad() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        oauthToken = { access_token: token };
        sessionStorage.setItem('oauthToken', JSON.stringify(oauthToken));
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        gapi.client.setToken(oauthToken);
        loadUserInfo();
        return true;
    }
    return false;
}

function updateLayoutAndRender() {
    updateLayout();
    scheduleRender();
}

function init() {
    loadGoogleAPIs();
    new ResizeObserver(scheduleRender).observe(canvasContainer);
    treeCanvas.addEventListener('click', handleCanvasClick);
    treeCanvas.addEventListener('mousemove', (e) => {
        const { x, y } = getCoordsFromEvent(e);
        const node = getNodeAtPoint(x, y);
        canvasContainer.style.cursor = node ? 'pointer' : 'default';
    });

    $('#btnToggleSidebar').onclick = () => app.classList.toggle('sidebar-collapsed');
    
    // Attach event listeners for main buttons
    $('#btnSaveChanges').onclick = saveAllChanges;
    $('#btnRoot').onclick = onAddRoot;
    $('#btnUndo').onclick = undo;
    $('#btnRedo').onclick = redo;
    $('#btnImportCSV').onclick = () => $('#fileImportCSV').click();
    $('#btnExportCSV').onclick = onExportCSV;
    $('#btnReset').onclick = () => {
        if (!isOwner) return;
        openConfirm('Hành động này sẽ xóa toàn bộ cây gia phả hiện tại. Bạn chắc chắn?', () => {
            pushHistory();
            data = null;
            highlightedNodeId = null;
            setUnsavedChanges(true);
            updateSelectionActions();
            updateLayoutAndRender();
        });
    };

    // Attach event listeners for selection actions
    $('#act-add-child').onclick = () => {
        if (highlightedNodeId) onAddChild(highlightedNodeId);
    };
    $('#act-edit-node').onclick = () => {
        if (highlightedNodeId) onEditNode(highlightedNodeId);
    };
    $('#act-delete-node').onclick = () => {
        if (highlightedNodeId) {
            const node = findById(data, highlightedNodeId);
            if (node) onDel(node);
        }
    };

    // File import logic
    $('#fileImportCSV').onchange = onFileImported;

    // Pan and zoom
    const hammer = new Hammer(treeCanvas);
    hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });
    hammer.get('pinch').set({ enable: true });
    let startPanX = 0, startPanY = 0, startScale = 1;
    hammer.on('panstart', () => { startPanX = panX; startPanY = panY; });
    hammer.on('panmove', (e) => {
        panX = startPanX + e.deltaX;
        panY = startPanY + e.deltaY;
        scheduleRender();
    });
    hammer.on('pinchstart', () => startScale = scale);
    hammer.on('pinchmove', (e) => {
        const newScale = clamp(startScale * e.scale, 0.1, 5);
        const rect = treeCanvas.getBoundingClientRect();
        const pX = e.center.x - rect.left, pY = e.center.y - rect.top;
        const wX = (pX - panX) / scale, wY = (pY - panY) / scale;
        panX = pX - wX * newScale;
        panY = pY - wY * newScale;
        scale = newScale;
        scheduleRender();
    });
    treeCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = treeCanvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
        const worldXBefore = (mouseX - panX) / scale;
        const worldYBefore = (mouseY - panY) / scale;
        const newScale = clamp(scale * (1 - e.deltaY * 0.001), 0.1, 5);
        panX = mouseX - worldXBefore * newScale;
        panY = mouseY - worldYBefore * newScale;
        scale = newScale;
        scheduleRender();
    }, { passive: false });

    // Theme selector
    $('#themeSelector').onchange = (e) => applyTheme(e.target.value);
    const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(savedTheme);

    appTitle.addEventListener('blur', () => { if (isOwner) setUnsavedChanges(true); });

    treeSelector.addEventListener('change', (e) => {
        if (hasUnsavedChanges && !confirm('Bạn có thay đổi chưa lưu. Chắc chắn muốn chuyển?')) {
            e.target.value = currentSheetName;
            return;
        }
        loadTreeData(e.target.value);
    });
    
    window.gapiLoaded = async () => {
        await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'] });
        gapiInited = true;
        if (!handleRedirectCallbackAndLoad()) {
            const savedToken = sessionStorage.getItem('oauthToken');
            if (savedToken) {
                gapi.client.setToken(JSON.parse(savedToken));
                loadUserInfo();
            } else {
                updateAuthUI();
                loadInitialData();
            }
        }
    };
}

function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    $('#themeSelector').value = theme;
    scheduleRender();
}

init();
