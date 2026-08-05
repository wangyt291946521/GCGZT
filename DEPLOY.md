# 感创 · 项目信息流转平台 — 完整部署指南

## 架构总览

```
┌──────────────┐       HTTPS        ┌──────────────┐
│  Vercel      │ ←────────────────── │  用户浏览器   │
│  (前端静态)   │                     │  (手机/电脑)  │
└──────────────┘                     └──────┬───────┘
                                            │ fetch('/api/...')
                                            ▼
                                     ┌──────────────┐
                                     │   Railway    │
                                     │  (后端 API)   │
                                     └──────┬───────┘
                                            │
                                     ┌──────▼───────┐
                                     │ MongoDB Atlas │
                                     │  (云数据库)    │
                                     └──────────────┘
```

---

## 一、MongoDB Atlas 设置（免费云数据库）

### 1.1 注册

打开 https://www.mongodb.com/atlas → 点 **Try Free** → 用 Google/GitHub 注册

### 1.2 创建免费集群

1. 注册后会提示创建集群 → 选 **M0 FREE**（512MB 存储，够一个团队用几年）
2. Provider 选 **AWS**，Region 选 **Singapore**（离国内最近）
3. 点 **Create Deployment**

### 1.3 创建数据库用户

1. 创建集群期间会弹出创建用户窗口
2. Username: `ganchuang`（自定义）
3. Password: 设置一个复杂密码，**记录下来！**
4. 点 **Create User**

### 1.4 配置网络访问

1. 左侧菜单 → **Network Access**
2. 点 **Add IP Address** → 点 **Allow Access from Anywhere**（或手动添加 `0.0.0.0/0`）
3. 点 **Confirm**

### 1.5 获取连接字符串

1. 左侧菜单 → **Database** → 点集群上的 **Connect**
2. 选 **Drivers**
3. 复制连接字符串，长这样：
   ```
   mongodb+srv://ganchuang:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. 把 `<password>` 替换成你设的密码
5. 在 `?` 前面加上数据库名 `/ganchuang`：
   ```
   mongodb+srv://ganchuang:你的密码@cluster0.xxxxx.mongodb.net/ganchuang?retryWrites=true&w=majority
   ```
6. **保存这个字符串**，下一步要用

---

## 二、Railway 部署（后端）

### 2.1 登录

https://railway.app → Login with GitHub

### 2.2 创建项目

1. 点 **New Project** → **Deploy from GitHub repo**
2. 选 `wangyt291946521/GCGZT`
3. 等待自动构建完成

### 2.3 设置环境变量

1. 点进项目 → 点服务卡片 → **Variables** 标签
2. 添加以下变量：

| 变量名 | 值 |
|--------|-----|
| `MONGODB_URI` | 上面 MongoDB 连接字符串（完整版，含密码） |
| `CORS_ORIGINS` | 先填 `*`（等 Vercel 部署完再改成 Vercel 域名） |

3. 点 **Deploy** 重新部署让变量生效

### 2.4 生成域名

1. **Settings → Networking → Generate Domain**
2. 记下生成的域名（类似 `gcgzt-production-xxxx.up.railway.app`）
3. 验证：浏览器访问 `https://你的域名/health`，看到 `{"status":"ok"}` 就对了

---

## 三、Vercel 部署（前端）

### 3.1 准备工作

1. **先修改 `index.html`**，找到第 405 行左右：
   ```javascript
   var GC_API_BASE = '';
   ```
2. 改成你的 Railway 域名：
   ```javascript
   var GC_API_BASE = 'https://gcgzt-production-xxxx.up.railway.app';
   ```
3. **保存文件**，然后提交推送：
   ```bash
   cd E:\感创\公司工作台
   git add -A
   git commit -m "配置 Vercel 部署"
   git push origin master
   ```

### 3.2 部署到 Vercel

1. 打开 https://vercel.com → **Sign Up** → 用 GitHub 登录
2. 点 **New Project**
3. 导入仓库 `wangyt291946521/GCGZT`
4. 不需要配置任何设置，直接点 **Deploy**
5. 等待 30 秒 → 拿到 Vercel 域名（类似 `gcgzt.vercel.app`）

### 3.3 验证部署

用浏览器打开 Vercel 域名，检查：
- 顶部右上角应该显示 **「远程API」** 蓝色标签
- 能看到示例项目数据
- 能新建、编辑、删除项目

### 3.4 收紧 CORS（安全）

回到 Railway → Variables → 把 `CORS_ORIGINS` 改成 Vercel 域名：
```
https://gcgzt.vercel.app
```
然后重新部署。

---

## 四、自定义域名配置

### 4.1 Vercel 绑定自定义域名

1. Vercel 项目 → **Settings → Domains**
2. 输入你的域名（如 `gc.yourcompany.com`）
3. Vercel 会给出 DNS 配置指引

### 4.2 DNS 解析配置（以阿里云为例）

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|--------|
| CNAME | `gc` | `cname.vercel-dns.com` |

等待 DNS 生效（1-10 分钟），Vercel 会自动签发 SSL 证书。

### 4.3 Railway 绑定自定义域名（可选）

如果需要给后端也绑域名（如 `api-gc.yourcompany.com`）：

1. Railway → Settings → Networking → **Custom Domain**
2. 添加子域名，Railway 会给出 CNAME 目标
3. 去 DNS 服务商添加 CNAME 记录

---

## 五、更新流程

以后改代码后：

```bash
# 1. 改代码
# 2. 提交
git add -A
git commit -m "描述改动"
git push origin master

# 3. Railway 自动重新部署（后端）
# 4. Vercel 自动重新部署（前端）

# 等 1-2 分钟刷新页面即可
```

---

## 六、常见问题

| 问题 | 解决方法 |
|------|----------|
| Vercel 页面空白 | F12 看 Console 是否有 CORS 错误 → 检查 GC_API_BASE 配置 |
| API 返回 502 | Railway 日志里看 MongoDB 连接是否成功 |
| MongoDB 连接失败 | 检查 Atlas 的 Network Access 是否加了 `0.0.0.0/0` |
| 数据不见了 | Railway 免费额度用完 → 重新部署；或检查 MongoDB Atlas 免费额度 |
| 忘记 MongoDB 密码 | Atlas → Database Access → 点用户 → Edit → 改密码 |

---

## 七、费用说明

| 服务 | 免费额度 | 够用吗 |
|------|---------|--------|
| **MongoDB Atlas** | 512MB 存储 | 存几万个项目没问题 |
| **Railway** | $5/月免费额度 | 约 500 小时运行时间/月 |
| **Vercel** | 100GB 带宽/月 | 小团队完全够用 |
| **总计** | **$0/月** | ✅ 完全免费 |
