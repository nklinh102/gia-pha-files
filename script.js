// ===================================================================
// ====== THÔNG TIN CẤU HÌNH ======
// ===================================================================
const CLOUDINARY_CLOUD_NAME = 'docowfdvd';
const CLOUDINARY_UPLOAD_PRESET = 'gia_pha_preset';

const API_KEY = 'AIzaSyAOnCKz1lJjkWvJhWuhc9p0GMXcq3EJ-5U';
const CLIENT_ID = '44689282931-21nb0br3on3v8dscjfibrfutg7isj9fj.apps.googleusercontent.com';
const SPREADSHEET_ID = '1z-LGeQo8w0jzF9mg8LD_bMsXKEvtgc_lgY5F-EkTgBY';
const SUBMISSION_SHEET_ID = '1vlg9btMR-kP_m2gbYy4AoJ-Z41qzxpkERMBCx4LyxqU'; // ID của sheet đề xuất mới
const ADMIN_EMAIL = 'nklinh102@gmail.com';
const INDEX_SHEET_NAME = '_index';
const SETTINGS_SHEET_NAME = 'settings';
const MEDIA_SHEET_NAME = 'Media';
const PENDING_SHEET_NAME = 'PendingMembers'; // Tên sheet trong SPREADSHEET_ID cũ

// ===================================================================

// ====== Trạng thái & Hằng số ======
const LS_KEY_PREFIX = 'familyTree.v13.';
const THEME_KEY = 'familyTreeTheme.v13';
const TITLE_KEY = 'familyTreeTitle.v13';
const MINIMAP_KEY = 'familyTreeMinimap.v13';
const ACCENT_KEY = 'familyTreeAccent.v13';
const GAPX_KEY = 'familyTreeGapX.v13';
const GEN1_W = 400, GEN1_H = 90;
const GEN2_W = 330, GEN2_H = 85;
const GEN345_W = 200, GEN345_H = 72;
const GEN6PLUS_W = 60, GEN6PLUS_H = 180;
const VERTICAL_THRESHOLD = 5;
let gapX = 40;
const DEFAULT_GAP_Y = 50;

const MIN_QUERY = 2;
const SEARCH_DEBOUNCE = 450;

let decorationSettings = {
    visible: true,
    size: 150,
    opacity: 1.0,
    distance: 85,
    url: 'https://cdn.jsdelivr.net/gh/nklinh102/gia-pha-files@main/images/Cuonthu.png'
};

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
let allImages = [], allAudios = [];
let currentImageIndex = 0;
let treeIndex = [];
let isRenderScheduled = false;
let domNodeIcons = new Map();
let nodesFlat = [];
let panAnimId = null;

let pendingProposals = [];

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const app = $('.app');
const appTitle = $('#appTitle');
const searchInput = $('#search');
const btnClearSearch = $('#btnClearSearch');
const canvasContainer = $('#canvas-container');
const treeCanvas = $('#tree-canvas');
const treeDecoration = $('#tree-decoration');
const ctx = treeCanvas.getContext('2d');
const authContainer = $('#auth-container');
const treeSelector = $('#tree-selector');
const pendingModal = $('#pending-modal');
const pendingList = $('#pendingList');
const pendingProposalsBtn = $('#pendingProposals');
const pendingCountSpan = $('#pendingCount');

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const norm = s => (s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
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
    await Promise.all([ saveTreeData(), saveSettingsToSheet() ]);
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
                (node.children || []).forEach(c => walk(c, node.id));
            })(data);
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID, range: `${currentSheetName}!A1`, valueInputOption: 'USER_ENTERED',
                resource: { values: rows }
            });
        }
    } catch (err) {
        console.error("Lỗi khi đồng bộ cây gia phả:", err);
        alert("Đã xảy ra lỗi khi lưu dữ liệu vào Google Sheet. Chi tiết: " + (err.result?.error?.message || err.message));
    }
}
const snapshot = () => JSON.stringify(data);
function pushHistory() {
  history.push(snapshot());
  if (history.length > 50) history.shift();
  future = [];
  $('#btnUndo').disabled = history.length === 0; $('#btnRedo').disabled = true;
}
function undo() {
  if (!isOwner || !history.length) return;
  future.push(snapshot()); data = JSON.parse(history.pop());
  highlightedNodeId = null;
  updateSelectionActions();
  updateInfoPanel(null);
  updateLayout();
  scheduleRender();
  setUnsavedChanges(true);
  $('#btnUndo').disabled = history.length === 0; $('#btnRedo').disabled = false;
}
function redo() {
  if (!isOwner || !future.length) return;
  history.push(snapshot()); data = JSON.parse(future.pop());
  highlightedNodeId = null;
  updateSelectionActions();
  updateInfoPanel(null);
  updateLayout();
  scheduleRender();
  setUnsavedChanges(true);
  $('#btnRedo').disabled = future.length === 0; $('#btnUndo').disabled = false;
}

function findById(n, id) { if (!n) return null; if (n.id === id) return n; for (const c of (n.children || [])) { const f = findById(c, id); if (f) return f; } return null; }
function findParent(n, id, p = null) { if (!n) return null; if (n.id === id) return p; for (const c of (n.children || [])) { const f = findParent(c, id, n); if (f) return f; } return null; }
function findPathToRoot(startNodeId) {
  if (!data || !startNodeId) return []; const path = []; let current = findById(data, startNodeId); if (!current) return []; path.push(current);
  while (true) { const parent = findParent(data, current.id); if (!parent) break; path.push(parent); current = parent; } return path;
}

function indexNodes() {
  nodesFlat = [];
  function walk(n){
    if (!n) return;
    n._norm = norm((n.name||'') + (n.birth||'') + (n.death||''));
    nodesFlat.push(n);
    (n.children||[]).forEach(walk);
  }
  walk(data);
}

function measure(n, depth = 0, path = new Set()) {
    if (!n) return 0; if (path.has(n.id)) { console.error("Phát hiện vòng lặp:", n.id); return 0; } path.add(n.id);
    let nodeWidth;
    if (depth === 0) nodeWidth = GEN1_W; else if (depth === 1) nodeWidth = GEN2_W;
    else if (depth >= VERTICAL_THRESHOLD) nodeWidth = GEN6PLUS_W; else nodeWidth = GEN345_W;
    if (!n.children || n.children.length === 0) { path.delete(n.id); return nodeWidth; }
    const childrenWidth = n.children.map(c => measure(c, depth + 1, new Set(path))).reduce((a, b) => a + b, 0);
    const gapsBetweenChildren = (n.children.length - 1) * gapX;
    path.delete(n.id); return Math.max(nodeWidth, childrenWidth + gapsBetweenChildren);
}
function updateLayout() {
  if (!data) { nodesFlat = []; return; }
  const layoutCache = new Map();
  function cachedMeasure(node, depth = 0) {
      const cacheKey = `${node.id}_${depth}`; if (layoutCache.has(cacheKey)) return layoutCache.get(cacheKey);
      const result = measure(node, depth); layoutCache.set(cacheKey, result); return result;
  }
  yPositions = { 0: 100 }; calculateYPositions(data, 0);
  function position(n, depth, left, y) {
    if (depth === 0) { n._w = GEN1_W; n._h = GEN1_H; } else if (depth === 1) { n._w = GEN2_W; n._h = GEN2_H; }
    else if (depth >= VERTICAL_THRESHOLD) { n._w = GEN6PLUS_W; n._h = GEN6PLUS_H; } else { n._w = GEN345_W; n._h = GEN345_H; }
    n.depth = depth; n._y = y;
    const subtreeWidth = cachedMeasure(n, depth); n._x = left + subtreeWidth / 2;
    if (n.children && n.children.length > 0) {
      const childrenTotalWidth = n.children.map(c => cachedMeasure(c, depth + 1)).reduce((a, b) => a + b, 0) + (n.children.length - 1) * gapX;
      let cursor = n._x - childrenTotalWidth / 2; const nextY = yPositions[depth + 1];
      for (const child of n.children) {
        const childSubtreeWidth = cachedMeasure(child, depth + 1); position(child, depth + 1, cursor, nextY);
        cursor += childSubtreeWidth + gapX;
      }
    }
  }
  const totalWidth = cachedMeasure(data); position(data, 0, 50, yPositions[0]);
  const maxDepth = getTreeDepth(data); let lastGenHeight;
  if (maxDepth === 0) lastGenHeight = GEN1_H; else if (maxDepth === 1) lastGenHeight = GEN2_H;
  else if (maxDepth >= VERTICAL_THRESHOLD) lastGenHeight = GEN6PLUS_H; else lastGenHeight = GEN345_H;
  treeSize = { w: Math.max(totalWidth, 1000) + 100, h: (yPositions[maxDepth] || 100) + lastGenHeight + 50 };
  indexNodes();
}
function calculateYPositions(n, depth) {
  if (n.children && n.children.length > 0) {
    let maxParentHeight; if (depth === 0) maxParentHeight = GEN1_H; else if (depth === 1) maxParentHeight = GEN2_H;
    else if (depth >= VERTICAL_THRESHOLD) maxParentHeight = GEN6PLUS_H; else maxParentHeight = GEN345_H;
    const nextDepth = depth + 1;
    const maxChildHeight = Math.max(...n.children.map(c => { if (nextDepth === 1) return GEN2_H; if (nextDepth >= VERTICAL_THRESHOLD) return GEN6PLUS_H; return GEN345_H; }));
    const nextY = yPositions[depth] + maxParentHeight / 2 + maxChildHeight / 2 + DEFAULT_GAP_Y;
    if (!yPositions[nextDepth] || nextY > yPositions[nextDepth]) { yPositions[nextDepth] = nextY; }
    n.children.forEach(c => calculateYPositions(c, nextDepth));
  }
}
function getTreeDepth(n) { if (!n) return 0; if (!n.children || !n.children.length) return 0; return 1 + Math.max(...n.children.map(getTreeDepth)); }

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
        ctx.fillText("Không có dữ liệu gia phả.", treeCanvas.width / 2, treeCanvas.height / 2);
        ctx.restore();
        updateStats();
        updateNodeIcons();
        return;
    }

    ctx.translate(panX, panY);
    ctx.scale(scale, scale);
    
    drawTree(data);
    drawGenerations();

    ctx.restore(); 

    updateNodeIcons();
    updateDecoration();
    updateStats();
}
function drawTree(node) {
    (node.children || []).forEach(child => { drawConnection(node, child); });
    drawNode(node);
    (node.children || []).forEach(child => { drawTree(child); });
}
function drawConnection(parent, child) {
    const path = findPathToRoot(highlightedNodeId);
    const isHighlighted = highlightedNodeId && path.some(p => p.id === parent.id) && path.some(p => p.id === child.id);

    ctx.beginPath();
    ctx.strokeStyle = isHighlighted ? getCssVar('--accent') : 'rgba(138,160,181,.7)';
    ctx.lineWidth = isHighlighted ? 6 : 4;
    ctx.lineCap = 'round';

    const overlap = 6;
    const x1 = parent._x, y1 = parent._y + parent._h / 2 + overlap;
    const x2 = child._x, y2 = child._y - child._h / 2 - overlap;
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
    const path = findPathToRoot(highlightedNodeId);
    const isHighlighted = highlightedNodeId && path.some(p => p.id === node.id);
    const isSearchFocus = node.isSearchFocus;
    
    ctx.save();
    if (isSearchFocus) {
        ctx.translate(node._x, node._y);
        ctx.scale(1.1, 1.1);
        ctx.translate(-node._x, -node._y);
    }

    ctx.shadowBlur = isHighlighted ? 20 : (isSearchFocus ? 30 : 15);
    ctx.shadowColor = isHighlighted ? getCssVar('--accent') : (isSearchFocus ? getCssVar('--warning') : 'rgba(0,0,0,.5)');
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 5;
    
    const searchTerm = searchInput.value || '';
    if (searchTerm && !node.isSearchMatch) {
        ctx.globalAlpha = 0.40;
    }

    const isSpecialDepth = node.depth === 0 || node.depth === 1;
    if (!isSpecialDepth) {
        ctx.fillStyle = getCssVar('--card');
        ctx.strokeStyle = isHighlighted ? getCssVar('--accent') : (isSearchFocus ? getCssVar('--warning') : getCssVar('--border'));
        ctx.lineWidth = 2;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(x, y, node._w, node._h, [15]); else ctx.rect(x, y, node._w, node._h);
        ctx.fill();
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    
    const name = node.name || 'Chưa đặt tên';
    let meta = '';
    if (node.depth < 2) { 
        meta = [node.birth || '', node.death ? `– ${node.death}` : ''].join(' ').trim();
    }
    ctx.fillStyle = (isSpecialDepth) ? '#c0392b' : getCssVar('--ink');
    ctx.textAlign = 'center';
    
    if (node.depth >= VERTICAL_THRESHOLD) {
        ctx.textBaseline = 'middle';
        ctx.font = `bold 18px sans-serif`;
        ctx.save();
        ctx.translate(node._x, node._y);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(name, 0, 0);
        ctx.restore();
        
        ctx.font = `13px sans-serif`;
        ctx.fillStyle = getCssVar('--muted');
        ctx.fillText(meta, node._x, node._y + node._h / 2 - 15);
    } else {
        const fontSize = (node.depth === 0) ? 18 : 15;
        ctx.font = `bold ${fontSize}px sans-serif`;

        if (isSpecialDepth) {
            const topOfNode = node._y - node._h / 2;
            ctx.textBaseline = 'top';
            ctx.fillText(name, node._x, topOfNode + 28);
            if (meta) {
                ctx.font = `13px sans-serif`;
                ctx.fillText(meta, node._x, topOfNode + 28 + fontSize * 1.3);
            }
        } else {
            ctx.textBaseline = 'middle';
            ctx.fillText(name, node._x, node._y - (meta ? 8 : 0));
            if (meta) {
                ctx.font = `13px sans-serif`;
                ctx.fillStyle = getCssVar('--muted');
                ctx.fillText(meta, node._x, node._y + 12);
            }
        }
    }
    
    ctx.restore();
}
function drawGenerations() {
    if (!data) return;
    const maxDepth = getTreeDepth(data);
    for (let i = 0; i <= maxDepth; i++) {
        if (yPositions[i] === undefined) continue;
        
        ctx.save();
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = getCssVar('--muted');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const text = `Đời ${i + 1}`;
        const textMetrics = ctx.measureText(text);
        const padding = { x: 4, y: 8 };
        const rectW = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent + padding.y * 2;
        const rectH = textMetrics.width + padding.x * 2;
        const rectX = 10;
        const rectY = yPositions[i] - rectH / 2;

        ctx.fillStyle = getCssVar('--panel');
        ctx.strokeStyle = getCssVar('--border');
        ctx.lineWidth = 1;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(rectX, rectY, rectW, rectH, [8]); else ctx.rect(rectX, rectY, rectW, rectH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = getCssVar('--muted');
        ctx.translate(rectX + rectW / 2, yPositions[i]);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(text, 0, 0);
        
        ctx.restore();
    }
}
function updateDecoration() {
    if (!data || !decorationSettings.visible) {
        treeDecoration.style.visibility = 'hidden';
        return;
    }

    const worldX = data._x;
    const worldY = data._y - data._h / 2 - decorationSettings.distance;

    const screenX = (worldX * scale) + panX;
    const screenY = (worldY * scale) + panY;
    
    const decorationSize = decorationSettings.size * scale;
    
    const canvasRect = canvasContainer.getBoundingClientRect();
    if (screenX + decorationSize < 0 || screenX - decorationSize > canvasRect.width || screenY + decorationSize < 0 || screenY > canvasRect.height) {
        treeDecoration.style.visibility = 'hidden';
    } else {
        treeDecoration.style.visibility = 'visible';
        treeDecoration.style.width = decorationSize + 'px';
        treeDecoration.style.opacity = decorationSettings.opacity;
        treeDecoration.style.transform = `translate(${screenX - decorationSize / 2}px, ${screenY}px)`;
    }
}
function updateNodeIcons() {
    const container = $('#node-icons-container');
    if (!container || !data) {
        if(container) container.innerHTML = '';
        domNodeIcons.clear();
        return;
    }

    const visibleNodeIds = new Set();

    function walk(node) {
        if (node.depth === 0 || node.depth === 1) {
            visibleNodeIds.add(node.id);
            let imgEl = domNodeIcons.get(node.id);

            if (!imgEl) {
                imgEl = document.createElement('img');
                imgEl.className = 'node-icon';
                imgEl.src = 'https://cdn.jsdelivr.net/gh/nklinh102/gia-pha-files@main/images/Khungten.png';
                container.appendChild(imgEl);
                domNodeIcons.set(node.id, imgEl);
            }

            const iconW = (node.depth === 0 ? 350 : 300) * scale;
            const iconH = (node.depth === 0 ? 100 : 90) * scale;
            const screenX = (node._x * scale) + panX;
            const screenY = (node._y * scale) + panY;

            imgEl.style.transform = `translate(${screenX - iconW / 2}px, ${screenY - iconH / 2}px)`;
            imgEl.style.width = iconW + 'px';
            imgEl.style.height = iconH + 'px';
        }
        (node.children || []).forEach(walk);
    }
    walk(data);

    for (const [id, el] of domNodeIcons.entries()) {
        if (!visibleNodeIds.has(id)) {
            el.remove();
            domNodeIcons.delete(id);
        }
    }
}
function resizeCanvas() {
    const rect = canvasContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (treeCanvas.width !== rect.width * dpr || treeCanvas.height !== rect.height * dpr) {
        treeCanvas.width = rect.width * dpr;
        treeCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        treeCanvas.style.width = rect.width + 'px';
        treeCanvas.style.height = rect.height + 'px';
        scheduleRender();
    }
}

function updateSelectionActions() {
    const panel = $('#selection-actions');
    if (!panel) return;

    if (highlightedNodeId && isOwner) {
        const node = findById(data, highlightedNodeId);
        if (node) {
            $('#selection-name-value').textContent = node.name;
            
            const avatarEl = $('#selection-avatar');
            if (node.avatarUrl) {
                avatarEl.style.backgroundImage = `url(${node.avatarUrl})`;
                avatarEl.innerHTML = '';
            } else {
                avatarEl.style.backgroundImage = 'none';
                avatarEl.innerHTML = '&#43;';
            }
            
            avatarEl.onclick = () => onEditAvatar(node);

            panel.classList.remove('hidden');
        } else {
             panel.classList.add('hidden');
        }
    } else {
        panel.classList.add('hidden');
    }
}

function getGiap(node) {
    if (!data || !node || node.depth < 1) {
        return 'N/A';
    }

    let current = node;
    let parent = findParent(data, current.id);

    while (parent && current.depth > 1) {
        current = parent;
        parent = findParent(data, current.id);
    }
    
    const gen2Ancestor = current;

    if (gen2Ancestor && gen2Ancestor.depth === 1 && data.children) {
        const giapIndex = data.children.findIndex(child => child.id === gen2Ancestor.id);
        if (giapIndex !== -1) {
            return giapIndex + 1;
        }
    }

    return 'N/A';
}

function updateInfoPanel(nodeId) {
    const panel = $('#info-panel');
    if (!panel) return;

    if (!nodeId || isOwner) {
        panel.classList.add('hidden');
        return;
    }

    const node = findById(data, nodeId);
    if (!node) {
        panel.classList.add('hidden');
        return;
    }

    const name = node.name || 'N/A';
    $('#info-name').textContent = name;

    const avatarContainer = $('#info-avatar');
    if (node.avatarUrl) {
        avatarContainer.style.backgroundImage = `url(${node.avatarUrl})`;
        avatarContainer.style.display = 'block';
    } else {
        avatarContainer.style.display = 'none';
    }

    const giap = getGiap(node);
    const generation = node.depth + 1;
    $('#info-generation').textContent = `Giáp ${giap} / Đời ${generation}`;

    const sonsCount = (node.children || []).length;
    $('#info-sons').textContent = `${sonsCount} con trai`;

    let olderBrothers = 0;
    let youngerBrothers = 0;
    const parent = findParent(data, node.id);
    if (parent && parent.children) {
        const nodeIndex = parent.children.findIndex(child => child.id === node.id);
        if (nodeIndex > -1) {
            olderBrothers = nodeIndex;
            youngerBrothers = parent.children.length - 1 - nodeIndex;
        }
    }
    $('#info-brothers').textContent = `${olderBrothers} anh trai và ${youngerBrothers} em trai`;
    
    const birthItem = $('#info-birth-item');
    if (node.birth) {
        $('#info-birth').textContent = node.birth;
        birthItem.style.display = 'block';
    } else {
        birthItem.style.display = 'none';
    }

    const deathItem = $('#info-death-item');
    if (node.death) {
        $('#info-death').textContent = node.death;
        deathItem.style.display = 'block';
    } else {
        deathItem.style.display = 'none';
    }

    panel.classList.remove('hidden');
}

function getCoordsFromEvent(e) {
    const rect = treeCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;
    const worldX = (canvasX - panX) / scale;
    const worldY = (canvasY - panY) / scale;
    return { worldX, worldY };
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
        if (!found) {
            (node.children || []).forEach(check);
        }
    }
    if (data) check(data);
    return found;
}
function handleCanvasClick(e) {
    e.preventDefault();
    const { worldX, worldY } = getCoordsFromEvent(e);
    const node = getNodeAtPoint(worldX, worldY);

    if (node) {
        highlightedNodeId = (highlightedNodeId === node.id) ? null : node.id;
    } else {
        highlightedNodeId = null;
    }
    
    updateSelectionActions();
    updateInfoPanel(highlightedNodeId);
    scheduleRender();
}
function handleCanvasMouseMove(e) {
    const { worldX, worldY } = getCoordsFromEvent(e);
    const node = getNodeAtPoint(worldX, worldY);
    const newHoveredId = node ? node.id : null;
    if (newHoveredId !== hoveredNodeId) {
        hoveredNodeId = newHoveredId;
        canvasContainer.style.cursor = node ? 'pointer' : 'default';
    }
}

function updateStats() {
  const statsContainer = $('#stats-content');
  if (!data) { statsContainer.innerHTML = ''; return; }
  const counts = [];
  (function traverse(node, depth) { if (!node) return; counts[depth] = (counts[depth] || 0) + 1; (node.children || []).forEach(child => traverse(child, depth + 1)); })(data, 0);
  let html = ''; let total = 0;
  counts.forEach((count, index) => { html += `<div><span>Đời ${index + 1}</span> <strong>${count}</strong></div>`; total += count; });
  html += `<div class="total-row"><span><strong>Tổng cộng</strong></span> <strong>${total}</strong></div>`;
  statsContainer.innerHTML = html;
}

async function uploadImageToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', 'avatar');

    const saveBtn = $('#mSave');
    const originalBtnText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang tải ảnh...';

    const apiUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Tải ảnh lên Cloudinary thất bại. Vui lòng thử lại.');
        }

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error('Lỗi Cloudinary:', error);
        alert(error.message);
        return null;
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalBtnText;
    }
}

function openModal(title, init, onSave) {
  const modal = $('#modal'), mTitle = $('#mTitle'), mName = $('#mName'), mBirth = $('#mBirth'), mDeath = $('#mDeath'), mNote = $('#mNote'), mAvatar = $('#mAvatar'), mParentId = $('#mParentId');
  mTitle.textContent = title; mName.value = init?.name || ''; mBirth.value = init?.birth || ''; mDeath.value = init?.death || ''; mNote.value = init?.note || ''; mAvatar.value = init?.avatarUrl || '';
  
  // Chỉ hiển thị trường Parent ID cho admin
  if (isOwner) {
    mParentId.parentElement.style.display = 'flex';
  } else {
    mParentId.parentElement.style.display = 'none';
  }
  mParentId.value = init?.parentId || ''; // Tự động điền parentId

  modal.classList.add('show');
  const btnSave = $('#mSave'), btnCancel = $('#mCancel');
  function cleanup() { modal.classList.remove('show'); btnSave.removeEventListener('click', saveHandler); btnCancel.removeEventListener('click', close); modal.removeEventListener('click', outside); document.removeEventListener('keydown', esc); }
  function saveHandler() {
      const name = mName.value.trim(); if (!name) { mName.focus(); return; }
      onSave({ name, birth: mBirth.value.trim(), death: mDeath.value.trim(), note: mNote.value.trim(), avatarUrl: mAvatar.value.trim(), parentId: mParentId.value.trim() }); cleanup();
  }
  function close() { cleanup(); } function outside(e) { if (e.target === modal) close(); } function esc(e) { if (e.key === 'Escape') close(); }
  btnSave.addEventListener('click', saveHandler); btnCancel.addEventListener('click', close); modal.addEventListener('click', outside); document.addEventListener('keydown', esc);
  setTimeout(() => mName.focus(), 50);
}
function openConfirm(message, onYes) {
  const c = $('#confirm'), msg = $('#cMsg'), yes = $('#cYes'), no = $('#cNo');
  msg.textContent = message; c.classList.add('show');
  function cleanup() { c.classList.remove('show'); yes.removeEventListener('click', on); no.removeEventListener('click', off); c.removeEventListener('click', outside); document.removeEventListener('keydown', esc); }
  function on() { onYes(); cleanup(); } function off() { cleanup(); }
  function outside(e) { if (e.target === c) off(); } function esc(e) { if (e.key === 'Escape') off(); }
  yes.addEventListener('click', on); no.addEventListener('click', off); c.addEventListener('click', outside); document.addEventListener('keydown', esc);
}
function onAdd(n) { if (!isOwner) return;
  openModal('Thêm con cho ' + n.name, { parentId: n.id }, (d) => { pushHistory(); if (!n.children) n.children = []; n.children.push({ id: generateHierarchicalId(n), ...d, children: [] }); setUnsavedChanges(true); updateLayout(); scheduleRender(); });
}
function onEdit(n) { if (!isOwner) return;
  openModal('Chỉnh sửa: ' + n.name, n, (d) => { 
    pushHistory(); 
    Object.assign(n, d); 
    setUnsavedChanges(true);
    updateLayout();
    scheduleRender(); 
  });
}
function onEditAvatar(n) { if (!isOwner) return;
    onEdit(n);
    const fileInput = $('#mAvatarFile');
    fileInput.value = '';
    fileInput.click();
}
function onDel(n) { if (!isOwner) return;
  const msg = data.id === n.id ? 'Xóa gốc sẽ xóa toàn bộ cây. Bạn chắc chứ?' : 'Xóa thành viên này và toàn bộ nhánh con?';
  openConfirm(msg, () => {
    pushHistory();
    if (data.id === n.id) { data = null; }
    else { const p = findParent(data, n.id); if (p && p.children) p.children = p.children.filter(c => c.id !== n.id); }
    highlightedNodeId = null;
    updateSelectionActions();
    updateInfoPanel(null);
    setUnsavedChanges(true);
    updateLayout();
    scheduleRender();
  });
}

// Thay thế YOUR_WEB_APP_URL bằng URL thật của bạn
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby1gn5oJAGfJwqY4K276vUJ-lOaHYOIyKJS-PAhZGbVLEgaJlkrqsGltmMnuY0uejLuoQ/exec';

async function onProposeMember(prefilledParentId = null) {
    openModal('Đề xuất thêm thành viên', { parentId: prefilledParentId }, async (d) => {
        if (!d.name || !d.parentId) {
            alert('Vui lòng nhập Tên và ID của cha/mẹ.');
            return;
        }

        const formData = {
            parentId: d.parentId,
            name: d.name,
            birth: d.birth,
            death: d.death,
            note: d.note,
            avatarUrl: d.avatarUrl,
        };
        
        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                body: JSON.stringify(formData),
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                alert('Đề xuất của bạn đã được gửi thành công và đang chờ quản trị viên duyệt.');
            } else {
                throw new Error('Yêu cầu đến máy chủ thất bại.');
            }
        } catch (err) {
            console.error('Lỗi khi gửi đề xuất:', err);
            alert('Đã xảy ra lỗi khi gửi đề xuất. Vui lòng thử lại.');
        }
    });
}
async function loadPendingProposals() {
    if (!isOwner) return;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: SUBMISSION_SHEET_ID,
            range: `${PENDING_SHEET_NAME}!A:G`
        });
        const rows = response.result.values || [];
        // Giả sử hàng đầu tiên là tiêu đề, bỏ qua
        pendingProposals = rows.slice(1).map(row => ({
            id: row[0],
            parentId: row[1],
            name: row[2],
            birth: row[3],
            death: row[4],
            note: row[5],
            avatarUrl: row[6],
        }));
        updatePendingProposalsUI();
    } catch (err) {
        console.error('Lỗi khi tải đề xuất:', err);
    }
}
function updatePendingProposalsUI() {
    pendingCountSpan.textContent = pendingProposals.length;
    pendingProposalsBtn.style.display = isOwner ? 'flex' : 'none';
    pendingList.innerHTML = '';
    if (pendingProposals.length === 0) {
        pendingList.innerHTML = '<li class="sub" style="text-align:center;">Không có đề xuất nào.</li>';
        return;
    }
    pendingProposals.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = 'pending-item';
        li.innerHTML = `
            <div class="pending-item-header">
                <div>
                    <div class="pending-item-name">${p.name}</div>
                    <div class="pending-item-parent">Con của: ${p.parentId}</div>
                </div>
                <div>ID: ${p.id || 'tự động'}</div>
            </div>
            <div class="pending-item-actions">
                <button class="btn btn-success" data-index="${index}" data-action="approve">Chấp nhận</button>
                <button class="btn btn-danger" data-index="${index}" data-action="reject">Từ chối</button>
            </div>
        `;
        pendingList.appendChild(li);
    });
}
async function handlePendingAction(e) {
    const action = e.target.dataset.action;
    const index = parseInt(e.target.dataset.index, 10);
    if (action === 'approve') {
        const proposal = pendingProposals[index];
        const newId = generateHierarchicalId(findById(data, proposal.parentId));
        const newMember = {
            id: newId,
            parentId: proposal.parentId,
            name: proposal.name,
            birth: proposal.birth,
            death: proposal.death,
            note: proposal.note,
            avatarUrl: proposal.avatarUrl,
            children: []
        };
        const parentNode = findById(data, newMember.parentId);
        if (parentNode) {
            pushHistory();
            if (!parentNode.children) parentNode.children = [];
            parentNode.children.push(newMember);
            await saveTreeData();
            setUnsavedChanges(true);
            updateLayout();
            scheduleRender();
            await gapi.client.sheets.spreadsheets.values.batchClear({
                spreadsheetId: SUBMISSION_SHEET_ID,
                ranges: [`${PENDING_SHEET_NAME}!A${index + 2}:G${index + 2}`]
            });
            await loadPendingProposals();
        } else {
            alert('Lỗi: Không tìm thấy thành viên cha/mẹ. Vui lòng từ chối đề xuất này.');
        }
    } else if (action === 'reject') {
        await gapi.client.sheets.spreadsheets.values.batchClear({
            spreadsheetId: SUBMISSION_SHEET_ID,
            ranges: [`${PENDING_SHEET_NAME}!A${index + 2}:G${index + 2}`]
        });
        await loadPendingProposals();
        alert('Đã từ chối đề xuất.');
    }
}
function download(filename, data, type) {
    const a = document.createElement('a');
    let url;
    if (typeof data === 'string' && (data.startsWith('data:') || data.startsWith('blob:'))) {
        url = data;
    } else {
        const blob = new Blob([data], { type: type || 'application/octet-stream' });
        url = URL.createObjectURL(blob);
    }
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    if (typeof url !== 'string' || !url.startsWith('data:')) {
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    document.body.removeChild(a);
}
function toCSV() {
  if(!data) return ''; const rows = [['id', 'parentId', 'name', 'birth', 'death', 'note']];
  (function walk(node, parentId = '') {
      rows.push([node.id, parentId, node.name, node.birth, node.death, node.note].map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }));
     (node.children || []).forEach(c => walk(c, node.id));
  })(data); return rows.map(row => row.join(',')).join('\n');
}
function fromCSV(text) {
    text = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    const lines = text.split(/[\r\n]+/).filter(line => line.trim()); if (lines.length < 1) return null;
    const headerLine = lines.shift(); if (!headerLine) return null;
    const header = headerLine.toLowerCase().split(',').map(h => h.trim().replace(/"/g, '')); const idx = (name) => header.indexOf(name);
    const map = new Map(); const allNodes = []; let root = null; let hasError = false;
    lines.forEach((line, index) => {
        try {
            const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').replace(/""/g, ''));
            const id = values[idx('id')]; const parentId = values[idx('parentid')]; const name = values[idx('name')];
            if (!id && !parentId) return; if (!id) { console.error(`Lỗi Dòng ${index + 2}: "${name}" không có ID.`); hasError = true; return; }
            if (map.has(id)) { console.error(`Lỗi Dòng ${index + 2}: ID "${id}" trùng lặp.`); hasError = true; return; }
            const node = { id, parentId, name: values[idx('name')], birth: values[idx('birth')], death: values[idx('death')], note: values[idx('note')], avatarUrl: values[idx('avatarurl')], children: [] };
            map.set(id, node); allNodes.push(node);
        } catch (e) { console.warn('Bỏ qua dòng CSV không hợp lệ:', line); }
    });
    allNodes.forEach(node => {
        const { id, parentId, name } = node; if (id === parentId) { console.error(`Lỗi: "${name}" (ID: ${id}) có parentId trỏ về chính nó.`); hasError = true; return; }
        if (parentId) { if (map.has(parentId)) { map.get(parentId).children.push(node); } else { console.warn(`Cảnh báo: "${name}" (ID: ${id}) có parentId "${parentId}" không tồn tại.`); } }
        else { if (root) { console.error('Lỗi: Tìm thấy nhiều hơn một nút gốc.'); hasError = true; } root = node; }
    });
    if (hasError) { alert('Cảnh báo: Dữ liệu có lỗi. Sơ đồ có thể không đúng. Nhấn F12 và xem Console để biết chi tiết.'); }
    if (!root && allNodes.length > 0) { console.error("Không tìm thấy nút gốc. Lấy tạm node đầu tiên."); return allNodes[0]; } return root;
}
$('#btnExportCSV').onclick = () => { if (!data) return alert('Chưa có dữ liệu'); download('gia-pha.csv', '\uFEFF' + toCSV(), 'text/csv;charset=utf-8'); };
$('#btnImportCSV').onclick = () => { if (!isOwner) return; $('#fileImportCSV').click(); };
$('#fileImportCSV').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const text = await f.text(); pushHistory(); data = fromCSV(text); setUnsavedChanges(true); updateLayout(); scheduleRender(); }
  catch(err) { alert('Lỗi khi đọc file CSV/Excel: ' + err.message); console.error(err); }
  finally { e.target.value = ''; }
};
function generateSVGString() {
  if (!data) return null; updateLayout();
  const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  (function findBounds(n) { bb.minX = Math.min(bb.minX, n._x - n._w / 2); bb.maxX = Math.max(bb.maxX, n._x + n._w / 2); bb.minY = Math.min(bb.minY, n._y - n._h / 2); bb.maxY = Math.max(bb.maxY, n._y + n._h / 2); (n.children || []).forEach(findBounds); })(data);
  const pad = 40; const w = bb.maxX - bb.minX + pad * 2; const h = bb.maxY - bb.minY + pad * 2;
  let paths = '', nodesSVG = '';
  (function buildContent(n) {
      (n.children || []).forEach(c => { const x1 = n._x, y1 = n._y + n._h / 2, x2 = c._x, y2 = c._y - c._h / 2, midY = (y1 + y2) / 2; paths += `<path d="M ${x1} ${y1} V ${midY} H ${x2} V ${y2}" />`; });
      const name = (n.name||'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const meta = [n.birth||'', n.death?('– '+n.death):''].join(' ').trim();
      nodesSVG += `<rect x="${n._x - n._w/2}" y="${n._y - n._h/2}" width="${n._w}" height="${n._h}" rx="14" ry="14" />`;
      if (n.depth >= VERTICAL_THRESHOLD) {
         nodesSVG += `<text transform="translate(${n._x}, ${n._y}) rotate(90)" text-anchor="middle" dominant-baseline="central" class="name">${name}</text>`; nodesSVG += `<text x="${n._x}" y="${n._y + n._h/2 - 15}" text-anchor="middle" class="meta">${meta}</text>`;
      } else { nodesSVG += `<text x="${n._x}" y="${n._y - 5}" text-anchor="middle" class="name">${name}</text>`; nodesSVG += `<text x="${n._x}" y="${n._y + 15}" text-anchor="middle" class="meta">${meta}</text>`; }
      (n.children || []).forEach(buildContent);
  })(data);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${bb.minX - pad} ${bb.minY - pad} ${w} ${h}">
    <style> rect { fill: ${getCssVar('--card')}; stroke: ${getCssVar('--border')}; } .name { font: bold 15px sans-serif; fill: ${getCssVar('--ink')}; } .meta { font: 13px sans-serif; fill: ${getCssVar('--muted')}; } path { stroke: rgba(138,160,181,.7); stroke-width: 4; fill: none; } </style>
    <g>${paths}</g><g>${nodesSVG}</g></svg>`;
}

async function convertSVGtoJPG(svgString, quality = 0.9) { // <-- Thêm svgString vào đây
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }); // Dòng này giờ đã đúng
    const url = URL.createObjectURL(svgBlob);
    const loadImagePromise = new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (err) => reject(err);
        img.src = url;
    });
    await loadImagePromise;
    URL.revokeObjectURL(url);
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/jpeg', quality);
}

$('#btnExportSVG').onclick = () => { const svgString = generateSVGString(); if (svgString) download('gia-pha.svg', svgString, 'image/svg+xml'); else alert('Chưa có dữ liệu.'); };
$('#btnExportJPG').onclick = async () => {
    const btn = $('#btnExportJPG');
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';
    try {
        const svgString = generateSVGString();
        if (!svgString) {
            alert('Chưa có dữ liệu để xuất.');
            return;
        }
        const jpgDataUrl = await convertSVGtoJPG(svgString); // <-- Truyền svgString vào đây
        download('gia-pha.jpg', jpgDataUrl);
    } catch (err) {
        console.error('Lỗi chuyển đổi SVG sang JPG:', err);
        alert('Đã xảy ra lỗi khi chuyển đổi file.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Xuất JPG';
    }
};

$('#btnReset').onclick = () => { if (!isOwner) return; openConfirm('Xóa toàn bộ dữ liệu?', () => { pushHistory(); data = null; highlightedNodeId = null; updateSelectionActions(); setUnsavedChanges(true); updateLayout(); scheduleRender(); }); };
$('#btnRoot').onclick = () => { if (!isOwner) return; if(data) return alert('Cây đã có gốc.'); pushHistory(); data = { id: generateHierarchicalId(null), name: 'Tổ tiên', birth: '1900', children: [] }; setUnsavedChanges(true); updateLayout(); scheduleRender(); };
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;

let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const v = (e.target.value || '').trim();
  btnClearSearch.style.display = v ? 'block' : 'none';
  if (v.length < MIN_QUERY) {
    clearSearchFlags();
    scheduleRender();
    return;
  }
  searchTimeout = setTimeout(() => applySearch(false), SEARCH_DEBOUNCE);
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.style.display = 'none';
  clearSearchFlags();
  scheduleRender();
  searchInput.focus();
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
      e.preventDefault();
      applySearch(true);
  }
});

function clearSearchFlags() {
  if (data) {
      nodesFlat.forEach(n => {
          n.isSearchMatch = false;
          n.isSearchFocus = false;
      });
  }
}

function applySearch(shouldCenter) {
  const q = norm(searchInput.value || '');
  let first = null;
  nodesFlat.forEach(n => {
    const m = !!(n._norm && n._norm.includes(q));
    n.isSearchMatch = m;
    n.isSearchFocus = false;
    if (m && !first) {
      first = n;
      n.isSearchFocus = true;
    }
  });
  if (first && shouldCenter) {
      centerOnNode(first, { animate: true });
  }
  scheduleRender();
}

function centerOnNode(node, opts = { animate: true }) {
    if (!node || typeof node._x === 'undefined') return;
    const rect = canvasContainer.getBoundingClientRect();
    const targetScale = 1.2;
    const end = { x: rect.width / 2 - node._x * targetScale, y: rect.height / 2 - node._y * targetScale, s: targetScale };
    if (!opts.animate) {
        panX = end.x; panY = end.y; scale = end.s;
        $('#zoomReset').textContent = Math.round(scale * 100) + '%';
        scheduleRender();
        return;
    }
    if (panAnimId) cancelAnimationFrame(panAnimId);
    const start = { x: panX, y: panY, s: scale };
    let t0 = null; const dur = 500;
    const step = (t) => {
        if (!t0) t0 = t;
        const p = Math.min((t - t0) / dur, 1);
        const e = 0.5 - 0.5 * Math.cos(p * Math.PI);
        panX = start.x + (end.x - start.x) * e;
        panY = start.y + (end.y - start.y) * e;
        scale = start.s + (end.s - start.s) * e;
        $('#zoomReset').textContent = Math.round(scale * 100) + '%';
        scheduleRender();
        if (p < 1) {
            panAnimId = requestAnimationFrame(step);
        } else {
            panAnimId = null;
        }
    };
    panAnimId = requestAnimationFrame(step);
}

function fitToScreen() {
  if (!data) return; updateLayout();
  const rect = canvasContainer.getBoundingClientRect();
  const sx = (rect.width - 100) / treeSize.w; const sy = (rect.height - 100) / treeSize.h;
  scale = clamp(Math.min(sx, sy), 0.1, 1.2);
  panX = (rect.width - treeSize.w * scale) / 2; panY = (rect.height - treeSize.h * scale) / 2 + 50;
  scheduleRender(); $('#zoomReset').textContent = Math.round(scale * 100) + '%';
}
$('#btnFit').onclick = fitToScreen;

async function initializeGapiClient() {
    await gapi.client.init({ apiKey: API_KEY, discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'], });
    gapiInited = true;
    const savedTokenString = sessionStorage.getItem('oauthToken');
    if (savedTokenString) { oauthToken = JSON.parse(savedTokenString); gapi.client.setToken(oauthToken); await loadUserInfo(); }
    else { const tokenFound = handleRedirectCallback(); if (!tokenFound) { loadInitialData(); updateAuthUI(); } }
}
function handleRedirectCallback() {
    const params = new URLSearchParams(window.location.hash.substring(1)); const token = params.get('access_token');
    if (token) {
        oauthToken = { access_token: token, token_type: 'Bearer' }; sessionStorage.setItem('oauthToken', JSON.stringify(oauthToken));
        gapi.client.setToken(oauthToken); window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        loadUserInfo(); return true;
    } return false;
}
function handleAuthClick() {
    const oauth2Endpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = { 'client_id': CLIENT_ID, 'redirect_uri': window.location.href.split('#')[0], 'response_type': 'token', 'scope': 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile', 'include_granted_scopes': 'true', };
    const form = document.createElement('form'); form.setAttribute('method', 'GET'); form.setAttribute('action', oauth2Endpoint);
    for (var p in params) { const input = document.createElement('input'); input.setAttribute('type', 'hidden'); input.setAttribute('name', p); input.setAttribute('value', params[p]); form.appendChild(input); }
    document.body.appendChild(form); form.submit();
}
function handleSignoutClick() { sessionStorage.removeItem('oauthToken'); isOwner = false; oauthToken = null; gapi.client.setToken(''); disableEditing(); updateAuthUI(); }
async function loadUserInfo() {
    let profile;
    try {
        const token = gapi.client.getToken(); if (!token) { throw new Error("User is not authenticated."); }
        const fetchResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { 'Authorization': `Bearer ${token.access_token}` } });
        if (!fetchResponse.ok) { const errorBody = await fetchResponse.json(); throw new Error(JSON.stringify(errorBody)); }
        profile = await fetchResponse.json();
    } catch (err) { console.error("Error loading user info:", err); handleSignoutClick(); alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."); loadInitialData(); return; }
    if (profile.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        isOwner = true; authContainer.innerHTML = `Xin chào, <b>${profile.name}</b> (Quản trị)<br/><button id="signout-button" class="btn" style="width:100%; margin-top: 8px;">Đăng xuất</button>`;
        $('#signout-button').onclick = handleSignoutClick; enableEditing();
    } else { isOwner = false; authContainer.innerHTML = `Xin chào, <b>${profile.name}</b> (Chế độ xem)<br/><button id="signout-button" class="btn" style="width:100%; margin-top: 8px;">Đăng xuất</button>`; $('#signout-button').onclick = handleSignoutClick; disableEditing(); }
    loadInitialData();
}
function updateAuthUI() { 
    if (!isOwner) { 
        authContainer.innerHTML = `<button id="signin-button" class="btn" style="width:100%">Đăng nhập để chỉnh sửa</button>`; 
        $('#signin-button').onclick = handleAuthClick; 
    } 
    pendingProposalsBtn.style.display = isOwner ? 'flex' : 'none';
}
async function loadInitialData() {
    if (!gapiInited) return; let sheetData;
    try {
        sheetData = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: [`${SETTINGS_SHEET_NAME}!A:B`, `${MEDIA_SHEET_NAME}!A:Z`, `${INDEX_SHEET_NAME}!A:B`], });
        const valueRanges = sheetData.result.valueRanges; const settingsRows = (valueRanges[0] && valueRanges[0].values) || [];
        const mediaRows = (valueRanges[1] && valueRanges[1].values) || []; const indexRows = (valueRanges[2] && valueRanges[2].values);
        const settings = settingsRows.reduce((acc, row) => { if(row[0]) acc[row[0]] = row[1]; return acc; }, {});
        if (settings.bg_url) { canvasContainer.style.backgroundImage = `url(${settings.bg_url})`; $('#bgUrlInput').value = settings.bg_url; }
        if (settings.gap_x) { gapX = parseInt(settings.gap_x, 10) || 40; $('#gapXSlider').value = gapX; $('#gapValueLabel').textContent = gapX; }
        const centralTitle = settings.tree_title || 'Sơ Đồ Gia Phả'; savedTitle = centralTitle; appTitle.textContent = centralTitle; document.title = centralTitle;
        decorationSettings.visible = String(settings.decoration_visible).toLowerCase() !== 'false';
        decorationSettings.size = parseInt(settings.decoration_size, 10) || 150;
        decorationSettings.distance = parseInt(settings.decoration_distance, 10) || 85; 
        decorationSettings.url = settings.decoration_url || 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjJlY9mZoOpmFHf5dgVWM9KdN0TjY5InAd2PC8-vRzvjIPTo9eXDqrrSkSPX3k8chiuQFksSRfdcbbFF9bzihTqKcKuFsNMht-rmYCPFJyJ41-sMhExQlFaurQyXxQ1TtIyblsHvysUXcYuwDSiqyTzcV9eT1oGI_drresKj-uuiEF6ak6CZJ9jghGedMo/s1600/Asset%202@4x.png';
        treeDecoration.src = decorationSettings.url; 
        updateControlsUI();
        allImages = []; allAudios = [];
        if (mediaRows && mediaRows.length > 1) {
            const headers = mediaRows[0].map(h => String(h).toLowerCase().trim()); const imgIdx = headers.indexOf('imageurl'); const nameIdx = headers.indexOf('imagename');
            const audioIdx = headers.indexOf('audiourl'); const audioNameIdx = headers.indexOf('audioname');
            for (let i = 1; i < mediaRows.length; i++) {
                const row = mediaRows[i]; const imageUrl = row[imgIdx]; if (imgIdx > -1 && imageUrl) { allImages.push({ url: imageUrl, name: ((nameIdx > -1 && row[nameIdx]) ? row[nameIdx].trim() : `Ảnh ${i}`) }); }
                const audioUrl = row[audioIdx]; if (audioIdx > -1 && audioUrl) { allAudios.push({ url: audioUrl, name: ((audioNameIdx > -1 && row[audioNameIdx]) ? row[audioNameIdx].trim() : `Audio ${i}`) }); }
            }
        }
        populateImageSidebar(); populateAudioSidebar();
        if (!indexRows || indexRows.length < 2) { throw new Error('Sheet "_index" không đúng định dạng.'); }
        treeIndex = indexRows.slice(1).map(row => ({ displayName: row[0], sheetName: row[1] })).filter(t => t.displayName && t.sheetName);
        populateTreeSelector();
        const lastSelectedSheet = localStorage.getItem(LS_KEY_PREFIX + 'lastSelectedSheet');
        const initialSheet = (treeIndex.find(t => t.sheetName === lastSelectedSheet))?.sheetName || (treeIndex[0]?.sheetName);
        if (initialSheet) { treeSelector.value = initialSheet; await loadTreeData(initialSheet); }
        else { throw new Error("Không có cây phả đồ nào hợp lệ trong sheet _index."); }
    } catch (e) {
        const errorMsg = e?.result?.error?.message || e.message || 'Lỗi không xác định.';
        alert('Không thể tải dữ liệu. Chi tiết: ' + errorMsg); data = null; scheduleRender();
    }
    await loadPendingProposals();
}
async function loadTreeData(sheetName) {
    if (!sheetName) return; currentSheetName = sheetName; document.body.style.cursor = 'wait'; data = null; scheduleRender();
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${sheetName}!A:G`, });
        const treeRows = response.result.values; if (treeRows && treeRows.length > 0) { const csvText = treeRows.map(row => row.join(',')).join('\n'); data = fromCSV(csvText); }
    } catch (e) { console.error(`Lỗi khi tải từ sheet "${sheetName}":`, e); alert(`Không thể tải phả đồ "${sheetName}".`); }
    finally {
        try { updateLayout(); } catch (err) {
            console.error("Lỗi layout:", err); if (err.message.toLowerCase().includes("stack")) { alert("Lỗi Hiển Thị: Dữ liệu bị lặp vòng tròn. Vui lòng kiểm tra file Google Sheet."); }
            else { alert("Lỗi khi hiển thị cây: " + err.message); } data = null;
        }
        fitToScreen(); savedTitle = appTitle.textContent; localStorage.setItem(LS_KEY_PREFIX + 'lastSelectedSheet', sheetName);
        document.body.style.cursor = 'default'; history = []; future = []; setUnsavedChanges(false);
        if (isOwner) { $('#btnUndo').disabled = true; $('#btnRedo').disabled = true; }
    }
}
async function saveSettingsToSheet() {
    if (!isOwner) return; const bgUrl = $('#bgUrlInput').value.trim(); const currentGapX = $('#gapXSlider').value; const newTitle = appTitle.textContent.trim();
    try {
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID, range: `${SETTINGS_SHEET_NAME}!A1:B7`, valueInputOption: 'USER_ENTERED',
            resource: { values: [ ['bg_url', bgUrl], ['gap_x', currentGapX], ['tree_title', newTitle], ['decoration_visible', decorationSettings.visible], ['decoration_size', decorationSettings.size], ['decoration_distance', decorationSettings.distance], ['decoration_url', decorationSettings.url] ] }
        });
    } catch(err) { console.error("Lỗi khi lưu cài đặt:", err); }
}
function populateTreeSelector() { treeSelector.innerHTML = treeIndex.map(tree => `<option value="${tree.sheetName}">${tree.displayName}</option>`).join(''); }
function populateImageSidebar() {
    const imageGallery = $('#media-image-gallery'); imageGallery.innerHTML = '';
    if (allImages.length > 0) {
        allImages.forEach((item, index) => {
            const galleryDiv = document.createElement('div'); galleryDiv.className = 'gallery-item'; galleryDiv.title = item.name;
            galleryDiv.innerHTML = `<img src="${item.url}" loading="lazy" alt="${item.name}">`;
            galleryDiv.onclick = () => showMedia('image', index); imageGallery.appendChild(galleryDiv);
        });
    } else { imageGallery.innerHTML = '<div class="sub">Chưa có hình ảnh nào.</div>'; }
}
function populateAudioSidebar() {
    const audioPlaylist = $('#media-audio-playlist'); const globalAudioPlayer = $('#global-audio-player'); audioPlaylist.innerHTML = '';
    if (allAudios.length > 0) {
        allAudios.forEach((item, index) => {
            const listItem = document.createElement('li'); listItem.className = 'playlist-item'; listItem.title = item.name; listItem.dataset.index = index;
            listItem.innerHTML = `<div class="progress-bar"></div><span class="play-icon">▶</span> <span class="track-name">${item.name}</span>`;
            listItem.addEventListener('click', (e) => {
                e.stopPropagation(); const clickedItem = e.currentTarget; const directAudioUrl = item.url;
                if (e.target.matches('.play-icon, .track-name')) {
                    const wasPlaying = clickedItem.classList.contains('playing');
                    if (wasPlaying) { globalAudioPlayer.pause(); } else {
                        $$('.playlist-item.playing').forEach(el => { el.classList.remove('playing'); el.querySelector('.play-icon').textContent = '▶'; });
                        clickedItem.classList.add('playing'); clickedItem.querySelector('.play-icon').textContent = '❚❚';
                        if (globalAudioPlayer.src !== directAudioUrl) { globalAudioPlayer.src = directAudioUrl; }
                        globalAudioPlayer.play().catch(err => { console.error("Lỗi phát audio:", err); alert("Không thể phát file audio này."); clickedItem.classList.remove('playing'); clickedItem.querySelector('.play-icon').textContent = '▶'; });
                    }
                } else {
                    if (!globalAudioPlayer.src || globalAudioPlayer.src !== directAudioUrl || !globalAudioPlayer.duration) return;
                    const rect = clickedItem.getBoundingClientRect(); const clickX = e.clientX - rect.left; const width = clickedItem.clientWidth;
                    const seekRatio = clickX / width; globalAudioPlayer.currentTime = seekRatio * globalAudioPlayer.duration;
                }
            });
            audioPlaylist.appendChild(listItem);
        });
    } else { audioPlaylist.innerHTML = '<div class="sub">Chưa có âm thanh nào.</div>'; }
}
function showMedia(type, index) {
    if (type !== 'image' || allImages.length === 0) return; currentImageIndex = index;
    const mediaViewer = $('#media-viewer'); const mediaContent = $('#media-content');
    function updateImageViewer() {
        const item = allImages[currentImageIndex]; const img = document.createElement('img');
        img.style.maxHeight = '80vh'; img.style.maxWidth = '100%'; img.style.objectFit = 'contain';
        const nav = document.createElement('div'); nav.id = 'gallery-nav'; nav.innerHTML = `<button id="gallery-prev">&lt;</button><button id="gallery-next">&gt;</button>`;
        mediaContent.innerHTML = ''; mediaContent.append(img, nav);
        $('#gallery-prev').onclick = (e) => { e.stopPropagation(); currentImageIndex = (currentImageIndex - 1 + allImages.length) % allImages.length; updateImageViewer(); };
        $('#gallery-next').onclick = (e) => { e.stopPropagation(); currentImageIndex = (currentImageIndex + 1) % allImages.length; updateImageViewer(); };
        img.onerror = () => { mediaContent.innerHTML = `<div style="padding: 2rem; color: var(--danger);">Không thể tải hình ảnh.</div>`; };
        img.src = item.url; $('#media-title').textContent = item.name;
    }
    mediaViewer.classList.add('show'); updateImageViewer();
}
function enableEditing() { document.body.classList.add('owner-mode'); appTitle.setAttribute('contenteditable', 'true'); }
function disableEditing() { document.body.classList.remove('owner-mode'); }
function getCssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

function loadGoogleAPIs() {
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.defer = true;
  gapiScript.onload = () => {
    if (typeof gapiLoaded === 'function') {
      gapiLoaded();
    }
  };
  document.head.appendChild(gapiScript);

  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.defer = true;
  gsiScript.onload = () => {
    if (typeof gisLoaded === 'function') {
      gisLoaded();
    }
  };
  document.head.appendChild(gsiScript);
}

function init() {
  loadGoogleAPIs();
  new ResizeObserver(scheduleRender).observe(canvasContainer);
  treeCanvas.addEventListener('click', handleCanvasClick);
  treeCanvas.addEventListener('mousemove', handleCanvasMouseMove);

  const overlay = $('#overlay');
  const toggleSidebar = () => app.classList.toggle('sidebar-collapsed');
  $('#btnToggleSidebar').onclick = toggleSidebar;

  const searchContainer = $('#search-container');
  const btnToggleSearch = $('#btnToggleSearch');

  btnToggleSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = searchContainer.classList.toggle('search-expanded');
      if (isExpanded) {
          searchInput.focus();
      }
  });
  
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchContainer.classList.remove('search-expanded');
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
      searchContainer.classList.remove('search-expanded');
    }
  });

  
  $('#gapXSlider').addEventListener('input', (e) => {
      gapX = parseInt(e.target.value, 10);
      $('#gapValueLabel').textContent = gapX;
      updateLayout(); scheduleRender(); setUnsavedChanges(true);
  });
  $('#zoomIn').onclick = () => { scale = clamp(scale * 1.2, .1, 5); $('#zoomReset').textContent = Math.round(scale * 100) + '%'; scheduleRender(); };
  $('#zoomOut').onclick = () => { scale = clamp(scale / 1.2, .1, 5); $('#zoomReset').textContent = Math.round(scale * 100) + '%'; scheduleRender(); };
  $('#zoomReset').onclick = () => { scale = 1; panX = 80; panY = 60; $('#zoomReset').textContent = '100%'; scheduleRender(); };
  
  disableEditing();
  $('#btnSaveChanges').onclick = saveAllChanges;
  treeSelector.addEventListener('change', (e) => {
      const newSheetName = e.target.value;
      if (newSheetName !== currentSheetName) {
          if (hasUnsavedChanges && !confirm('Bạn có thay đổi chưa lưu. Chắc chắn chuyển?')) { e.target.value = currentSheetName; return; }
          loadTreeData(newSheetName);
      }
  });
  
  treeCanvas.addEventListener('wheel', (e) => {
    e.preventDefault(); const rect = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const worldXBefore = (mouseX - panX) / scale, worldYBefore = (mouseY - panY) / scale;
    const newScale = clamp(scale * (1 + e.deltaY * -0.001), .1, 5);
    panX = mouseX - worldXBefore * newScale; panY = mouseY - worldYBefore * newScale;
    scale = newScale; $('#zoomReset').textContent = Math.round(scale * 100) + '%';
    scheduleRender();
  }, { passive: false });
  const hammer = new Hammer(treeCanvas); hammer.get('pinch').set({ enable: true });
  let startPanX = 0, startPanY = 0, startScale = 1;
  hammer.on('panstart', (e) => { startPanX = panX; startPanY = panY; });
  hammer.on('panmove', (e) => { panX = startPanX + e.deltaX; panY = startPanY + e.deltaY; scheduleRender(); });
  hammer.on('pinchstart', (e) => { startScale = scale; });
  hammer.on('pinchmove', (e) => {
      const newScale = clamp(startScale * e.scale, 0.1, 5); const rect = canvasContainer.getBoundingClientRect();
      const pX = e.center.x - rect.left, pY = e.center.y - rect.top;
      const wX = (pX - panX) / scale, wY = (pY - panY) / scale;
      panX = pX - wX * newScale; panY = pY - wY * newScale; scale = newScale;
      $('#zoomReset').textContent = Math.round(scale * 100) + '%'; scheduleRender();
  });

  $('#themeSelector').addEventListener('change', (e) => applyTheme(e.target.value));
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);
  
  $('#bgUrlInput').addEventListener('input', () => setUnsavedChanges(true));
  $('#appTitle').addEventListener('blur', () => { if(isOwner) setUnsavedChanges(true); });
  
  const decorationSizeSlider = $('#decorationSizeSlider'), decorationSizeLabel = $('#decorationSizeLabel');
  const decorationDistanceSlider = $('#decorationDistanceSlider'), decorationDistanceLabel = $('#decorationDistanceLabel');
  updateControlsUI();
  $('#toggleDecoration').onchange = (e) => { decorationSettings.visible = e.target.checked; setUnsavedChanges(true); scheduleRender(); };
  decorationSizeSlider.addEventListener('input', (e) => { decorationSettings.size = parseInt(e.target.value, 10); decorationSizeLabel.textContent = decorationSettings.size; setUnsavedChanges(true); scheduleRender(); });
  decorationDistanceSlider.addEventListener('input', (e) => {
    decorationSettings.distance = parseInt(e.target.value, 10);
    decorationDistanceLabel.textContent = decorationSettings.distance; // Sửa lỗi ở đây
    setUnsavedChanges(true);
    scheduleRender();
  });
  $('#decorationUrlInput').addEventListener('input', (e) => { 
    decorationSettings.url = e.target.value; 
    treeDecoration.src = e.target.value;
    setUnsavedChanges(true); 
  });
  
  const imageSidebar = $('#image-sidebar'), audioSidebar = $('#audio-sidebar'), globalAudioPlayer = $('#global-audio-player');
  const closeAllMediaSidebars = () => { imageSidebar.classList.remove('show'); audioSidebar.classList.remove('show'); overlay.classList.remove('show-for-media'); };
  $('#btnToggleImageAlbum').onclick = () => { audioSidebar.classList.remove('show'); imageSidebar.classList.toggle('show'); if (imageSidebar.classList.contains('show')) overlay.classList.add('show-for-media'); else overlay.classList.remove('show-for-media'); };
  $('#btnToggleAudioAlbum').onclick = () => { imageSidebar.classList.remove('show'); audioSidebar.classList.toggle('show'); if (audioSidebar.classList.contains('show')) overlay.classList.add('show-for-media'); else overlay.classList.remove('show-for-media'); };
  $('#btnCloseImage').onclick = () => { imageSidebar.classList.remove('show'); if (!audioSidebar.classList.contains('show')) overlay.classList.remove('show-for-media'); };
  $('#btnCloseAudio').onclick = () => { audioSidebar.classList.remove('show'); if (!imageSidebar.classList.contains('show')) overlay.classList.remove('show-for-media'); };
  $('#media-close').onclick = () => $('#media-viewer').classList.remove('show');
  $('#media-viewer').onclick = (e) => { if (e.target.id === 'media-viewer') $('#media-viewer').classList.remove('show'); };
  globalAudioPlayer.addEventListener('timeupdate', () => { const playingItem = $('.playlist-item.playing'); if (playingItem && globalAudioPlayer.duration) { const progress = (globalAudioPlayer.currentTime / globalAudioPlayer.duration) * 100; playingItem.querySelector('.progress-bar').style.width = `${progress}%`; } });
  globalAudioPlayer.addEventListener('ended', () => { const playingItem = $('.playlist-item.playing'); if (playingItem) { playingItem.classList.remove('playing'); playingItem.querySelector('.play-icon').textContent = '▶'; playingItem.querySelector('.progress-bar').style.width = '0%'; } });
  globalAudioPlayer.addEventListener('pause', () => { const playingItem = $('.playlist-item.playing'); if (playingItem) { playingItem.classList.remove('playing'); playingItem.querySelector('.play-icon').textContent = '▶'; } });
  overlay.onclick = () => { if (overlay.classList.contains('show-for-media')) { closeAllMediaSidebars(); } else { toggleSidebar(); } };

  $('#act-add-child').addEventListener('click', () => { if (highlightedNodeId) { const node = findById(data, highlightedNodeId); if (node) onAdd(node); } });
  $('#act-edit-node').addEventListener('click', () => { if (highlightedNodeId) { const node = findById(data, highlightedNodeId); if (node) onEdit(node); } });
  $('#act-delete-node').addEventListener('click', () => { if (highlightedNodeId) { const node = findById(data, highlightedNodeId); if (node) onDel(node); } });

  const proposeChildBtn = $('#propose-child-btn');
  if (proposeChildBtn) {
      proposeChildBtn.addEventListener('click', () => {
          if (highlightedNodeId) {
              const node = findById(data, highlightedNodeId);
              if (node) {
                  onProposeMember(node.id);
              }
          }
      });
  }
}

function updateControlsUI() {
    const toggleDecoration = $('#toggleDecoration'), decorationSizeSlider = $('#decorationSizeSlider'), decorationSizeLabel = $('#decorationSizeLabel');
    const decorationDistanceSlider = $('#decorationDistanceSlider'), decorationDistanceLabel = $('#decorationDistanceLabel');
    const decorationUrlInput = $('#decorationUrlInput');
    if (toggleDecoration) {
        toggleDecoration.checked = decorationSettings.visible;
        decorationSizeSlider.value = decorationSettings.size;
        decorationSizeLabel.textContent = decorationSettings.size;
        decorationDistanceSlider.value = decorationSettings.distance;
        // Dòng này đã được sửa lỗi chính tả
        decorationDistanceLabel.textContent = decorationSettings.distance;
        decorationUrlInput.value = decorationSettings.url;
    }
}
function generateHierarchicalId(parent) {
    if (!parent || !parent.id) return '1'; const kids = Array.isArray(parent.children) ? parent.children : [];
    const taken = new Set();
    for (let i = 0; i < kids.length; i++) {
        const ch = kids[i]; if (!ch || typeof ch.id !== 'string') continue;
        if (ch.id.startsWith(parent.id + '.')) {
            const tail = ch.id.slice(parent.id.length + 1); const n = parseInt(tail, 10);
            if (Number.isInteger(n) && n > 0) taken.add(n);
        }
    }
    let suffix = 1; while (taken.has(suffix)) suffix++; return parent.id + '.' + suffix;
}
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,h1')) return;
  if(isOwner){
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  }
  if (e.key.toLowerCase() === 'f') { e.preventDefault(); fitToScreen(); }
  if (highlightedNodeId && isOwner) {
      const node = findById(data, highlightedNodeId);
      if (e.key.toLowerCase() === 'a') { e.preventDefault(); onAdd(node); }
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); onEdit(node); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDel(node); }
  }
  if (e.key === 'Escape') {
      appTitle.blur();
      highlightedNodeId = null;
      updateSelectionActions();
      updateInfoPanel(null);
      scheduleRender();
  }
});

function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const themeSelector = $('#themeSelector');
    if (themeSelector) themeSelector.value = theme;
    scheduleRender();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}
