# 部署说明

## 1. 服务器推荐配置

- 系统：Ubuntu 22.04 LTS 或同等级 Linux 发行版
- CPU：2 核起步
- 内存：4 GB 起步
- 磁盘：40 GB 起步，按 `data/` 数据量和备份保留周期扩容
- 运行环境：Node.js 20 LTS、npm、PM2、Nginx

## 2. 需要开放的端口

- `80`：HTTP，供 Nginx 反向代理使用
- `443`：HTTPS，后续配置证书后使用
- `4173`：应用本地端口，只建议服务器内网或本机访问，由 Nginx 转发

## 3. 环境变量说明

复制 `.env.example` 为 `.env`，只在服务器上填写真实值，不提交 `.env`。

| 变量 | 示例 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 运行环境 |
| `PORT` | `4173` | 应用监听端口 |
| `AI_PROVIDER` | `mock` | AI 提供方，未配置密钥时建议用 `mock` |
| `OPENAI_API_KEY` | `replace-with-openai-api-key-server-only` | 仅服务端读取，不能写进前端代码 |
| `DATA_DIR` | `./data` | 数据根目录 |
| `DATABASE_PATH` | `./data/database.sqlite` | 后续数据库文件位置 |
| `BACKUP_DIR` | `./data/backup` | 数据备份目录 |
| `SESSION_SECRET` | `replace-with-a-long-random-string` | 会话密钥，生产环境需替换 |

## 4. 安装依赖

```bash
npm ci
```

## 5. Build

```bash
npm run build
```

## 6. PM2 启动

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
```

查看状态：

```bash
pm2 status
pm2 logs ecommerce-ops-system
```

## 7. Nginx 反向代理示例

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 8. HTTPS 后续配置说明

上线域名解析到服务器后，可使用 Certbot 或云厂商证书配置 HTTPS。证书配置完成后，保留 `80` 到 `443` 的跳转，并让 Nginx 继续反向代理到 `127.0.0.1:4173`。

## 9. 数据备份方法

命令行备份：

```bash
npm run backup
```

默认会把 `DATA_DIR` 下的数据复制到 `BACKUP_DIR/backup-YYYY-MM-DD-HHMMSS/`，不删除原始数据。

应用内备份接口也会使用同一个 `BACKUP_DIR`。

## 10. 常见问题

- 页面能打开但数据接口失败：确认 `npm run start` 正在运行，并检查 PM2 日志。
- 端口访问失败：确认服务器安全组和防火墙开放了 `80/443`，应用端口由 Nginx 本机转发即可。
- AI 不走真实模型：确认服务器 `.env` 中 `AI_PROVIDER=openai` 且 `OPENAI_API_KEY` 已设置；不要在前端写密钥。
- 数据没有持久化：确认 `DATA_DIR` 指向可写目录，PM2 运行用户有读写权限。
- 备份过大：`data/` 已加入 `.gitignore`，备份文件不要提交到 Git；按服务器磁盘空间定期清理旧备份。
