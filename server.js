/**
 * 感创 · 项目信息流转平台 — 后端服务器
 * 
 * 启动: node server.js
 * 访问: http://localhost:3000
 * 
 * 数据存储在 data/projects.json（JSON 文件数据库）
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'projects.json');

// ===== 中间件 =====
app.use(express.json({ limit: '10mb' }));

// ===== 健康检查 / 根路径 =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 静态文件：直接提供同目录下的 HTML/CSS/JS
app.use(express.static(__dirname));

// ===== 数据读写 =====
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('读取数据失败:', e.message);
    return [];
  }
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ===== 日志中间件 =====
app.use('/api', (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ===== API 路由 =====

// GET /api/projects — 获取全部项目
app.get('/api/projects', (req, res) => {
  const data = readData();
  res.json(data);
});

// PUT /api/projects — 全量替换项目数据
app.put('/api/projects', (req, res) => {
  const projects = req.body;
  if (!Array.isArray(projects)) {
    return res.status(400).json({ error: '请求体必须是数组' });
  }
  // 基本校验：每个项目必须有 id
  for (const p of projects) {
    if (!p.id) return res.status(400).json({ error: '每个项目必须有 id 字段' });
  }
  writeData(projects);
  res.json({ ok: true, count: projects.length });
});

// GET /api/projects/:id — 获取单个项目
app.get('/api/projects/:id', (req, res) => {
  const data = readData();
  const p = data.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: '项目不存在' });
  res.json(p);
});

// POST /api/projects — 新增项目
app.post('/api/projects', (req, res) => {
  const p = req.body;
  if (!p.id) return res.status(400).json({ error: '缺少 id 字段' });
  const data = readData();
  // 如果 id 已存在则拒绝
  if (data.find(x => x.id === p.id)) {
    return res.status(409).json({ error: '项目ID已存在' });
  }
  data.push(p);
  writeData(data);
  res.status(201).json({ ok: true, project: p });
});

// PUT /api/projects/:id — 更新单个项目
app.put('/api/projects/:id', (req, res) => {
  const data = readData();
  const idx = data.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '项目不存在' });
  data[idx] = { ...data[idx], ...req.body, id: req.params.id }; // id 不可改
  writeData(data);
  res.json({ ok: true, project: data[idx] });
});

// DELETE /api/projects/:id — 删除单个项目
app.delete('/api/projects/:id', (req, res) => {
  const data = readData();
  const idx = data.findIndex(x => x.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '项目不存在' });
  const removed = data.splice(idx, 1)[0];
  writeData(data);
  res.json({ ok: true, deleted: removed.id });
});

// DELETE /api/projects — 清空全部（需要二次确认参数）
app.delete('/api/projects', (req, res) => {
  if (req.query.confirm !== 'yes') {
    return res.status(400).json({ error: '清空全部数据需要 confirm=yes 参数' });
  }
  writeData([]);
  res.json({ ok: true, message: '已清空全部数据' });
});

// GET /api/stats — 数据统计
app.get('/api/stats', (req, res) => {
  const data = readData();
  const stats = { total: data.length, lastModified: null };
  try {
    if (fs.existsSync(DATA_FILE)) {
      stats.lastModified = fs.statSync(DATA_FILE).mtime.toISOString();
    }
  } catch (e) { /* ignore */ }
  res.json(stats);
});

// ===== 全局错误处理 =====
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.message);
  res.status(500).json({ error: '服务器内部错误' });
});

// ===== 启动 =====
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('═══════════════════════════════════');
  console.log('  感创 · 项目信息流转平台 后端已启动');
  console.log(`  端口: ${PORT}`);
  console.log(`  数据文件: ${DATA_FILE}`);
  console.log('═══════════════════════════════════');
});

server.on('error', (err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});
