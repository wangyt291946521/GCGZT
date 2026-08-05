/**
 * 感创 · 项目信息流转平台 — 后端 API 服务器
 * 
 * 启动: node server.js
 * 端口: process.env.PORT || 3000
 * 
 * 数据库: MongoDB Atlas (MONGODB_URI 环境变量)
 *         降级方案: JSON 文件存储 (data/projects.json)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'projects.json');

// ===== CORS 中间件 =====
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // 允许来自 Vercel 前端、本地开发、以及无 origin 的请求
    if (!origin || ALLOWED_ORIGINS.length === 0) return callback(null, true);
    if (ALLOWED_ORIGINS.some(function (o) { return origin.startsWith(o); })) {
      return callback(null, true);
    }
    // 宽松策略：打印警告但仍允许（避免首次部署时被 CORS 卡住）
    console.log('[CORS] 放行非白名单请求:', origin);
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ===== MongoDB 连接 =====
let db = null;
let mongoClient = null;
const MONGO_URI = process.env.MONGODB_URI || '';

async function connectMongo() {
  if (!MONGO_URI) return false;
  try {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    await mongoClient.connect();
    db = mongoClient.db(process.env.MONGO_DB || 'ganchuang');
    // 验证连接
    await db.command({ ping: 1 });
    console.log('✅ MongoDB 已连接');
    return true;
  } catch (e) {
    console.log('⚠️  MongoDB 连接失败，降级为 JSON 文件存储:', e.message);
    db = null;
    return false;
  }
}

// ===== 数据读写 =====
function readDataJSON() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('读取 JSON 数据失败:', e.message);
    return [];
  }
}

function writeDataJSON(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function readData() {
  if (db) {
    try {
      return await db.collection('projects').find({}).toArray();
    } catch (e) {
      console.error('MongoDB 读取失败:', e.message);
      return readDataJSON();
    }
  }
  return readDataJSON();
}

async function writeFullData(projects) {
  if (db) {
    try {
      await db.collection('projects').deleteMany({});
      if (projects.length > 0) {
        await db.collection('projects').insertMany(projects);
      }
      return;
    } catch (e) {
      console.error('MongoDB 写入失败:', e.message);
    }
  }
  writeDataJSON(projects);
}

async function upsertProject(project) {
  if (db) {
    try {
      await db.collection('projects').replaceOne(
        { id: project.id }, project, { upsert: true }
      );
      return;
    } catch (e) {
      console.error('MongoDB 更新失败:', e.message);
    }
  }
  // JSON file fallback
  const data = readDataJSON();
  const idx = data.findIndex(function (x) { return x.id === project.id; });
  if (idx >= 0) data[idx] = project;
  else data.push(project);
  writeDataJSON(data);
}

async function deleteProjectById(id) {
  if (db) {
    try {
      return await db.collection('projects').deleteOne({ id: id });
    } catch (e) {
      console.error('MongoDB 删除失败:', e.message);
    }
  }
  const data = readDataJSON();
  const idx = data.findIndex(function (x) { return x.id === id; });
  if (idx >= 0) {
    data.splice(idx, 1);
    writeDataJSON(data);
    return { deletedCount: 1 };
  }
  return { deletedCount: 0 };
}

// ===== 日志中间件 =====
app.use(function (req, res, next) {
  const start = Date.now();
  res.on('finish', function () {
    const ms = Date.now() - start;
    if (req.originalUrl.startsWith('/api')) {
      console.log('[' + new Date().toLocaleTimeString() + '] ' + req.method + ' ' + req.originalUrl + ' → ' + res.statusCode + ' (' + ms + 'ms)');
    }
  });
  next();
});

// ===== API 路由 =====

// GET /api/projects — 获取全部项目
app.get('/api/projects', async function (req, res) {
  try {
    const data = await readData();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/projects — 全量替换项目数据
app.put('/api/projects', async function (req, res) {
  try {
    const projects = req.body;
    if (!Array.isArray(projects)) {
      return res.status(400).json({ error: '请求体必须是数组' });
    }
    for (var i = 0; i < projects.length; i++) {
      if (!projects[i].id) {
        return res.status(400).json({ error: '每个项目必须有 id 字段' });
      }
    }
    await writeFullData(projects);
    res.json({ ok: true, count: projects.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id — 获取单个项目
app.get('/api/projects/:id', async function (req, res) {
  try {
    const data = await readData();
    const p = data.find(function (x) { return x.id === req.params.id; });
    if (!p) return res.status(404).json({ error: '项目不存在' });
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects — 新增项目
app.post('/api/projects', async function (req, res) {
  try {
    const p = req.body;
    if (!p.id) return res.status(400).json({ error: '缺少 id 字段' });
    const data = await readData();
    if (data.find(function (x) { return x.id === p.id; })) {
      return res.status(409).json({ error: '项目ID已存在' });
    }
    await upsertProject(p);
    res.status(201).json({ ok: true, project: p });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/projects/:id — 更新单个项目
app.put('/api/projects/:id', async function (req, res) {
  try {
    const data = await readData();
    const idx = data.findIndex(function (x) { return x.id === req.params.id; });
    if (idx < 0) return res.status(404).json({ error: '项目不存在' });
    const updated = Object.assign({}, data[idx], req.body, { id: req.params.id });
    await upsertProject(updated);
    res.json({ ok: true, project: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/projects/:id — 删除单个项目
app.delete('/api/projects/:id', async function (req, res) {
  try {
    const result = await deleteProjectById(req.params.id);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: '项目不存在' });
    }
    res.json({ ok: true, deleted: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/projects — 清空全部
app.delete('/api/projects', async function (req, res) {
  if (req.query.confirm !== 'yes') {
    return res.status(400).json({ error: '清空全部数据需要 confirm=yes 参数' });
  }
  try {
    await writeFullData([]);
    res.json({ ok: true, message: '已清空全部数据' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats — 数据统计
app.get('/api/stats', async function (req, res) {
  try {
    const data = await readData();
    const stats = { total: data.length, storage: db ? 'MongoDB' : 'JSON', lastModified: null };
    try {
      if (!db && fs.existsSync(DATA_FILE)) {
        stats.lastModified = fs.statSync(DATA_FILE).mtime.toISOString();
      }
    } catch (e) { /* ignore */ }
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== API 文档页 (Swagger 风格) =====
app.get('/docs', function (req, res) {
  res.sendFile(path.join(__dirname, 'docs.html'));
});

// ===== 静态文件（同时提供前端页面，方便 Railway 一体部署） =====
app.use(express.static(__dirname));

// 根路径
app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 健康检查
app.get('/health', function (req, res) {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    storage: db ? 'MongoDB' : 'JSON',
    mongo: db ? 'connected' : 'disconnected'
  });
});

// ===== 全局错误处理 =====
app.use(function (err, req, res, next) {
  console.error('服务器错误:', err.message);
  res.status(500).json({ error: '服务器内部错误: ' + err.message });
});

// ===== 启动 =====
async function start() {
  // 确保 data 目录存在
  var dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // 尝试连接 MongoDB
  await connectMongo();

  const server = app.listen(PORT, '0.0.0.0', function () {
    console.log('═══════════════════════════════════');
    console.log('  感创 · 项目信息流转平台 已启动');
    console.log('  端口: ' + PORT);
    console.log('  存储: ' + (db ? 'MongoDB' : 'JSON 文件'));
    console.log('  CORS: ' + (ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.length + ' 个白名单' : '全部允许'));
    console.log('═══════════════════════════════════');
  });

  server.on('error', function (err) {
    console.error('启动失败:', err.message);
    process.exit(1);
  });
}

start().catch(function (err) {
  console.error('启动过程出错:', err.message);
  process.exit(1);
});
