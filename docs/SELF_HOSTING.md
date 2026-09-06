# 单用户自托管运行手册

Sprint 1.5 提供由 Next.js Web/API 与 PostgreSQL 组成的 Docker Compose 基线。它面向个人笔记本运行，也保留未来迁移到云主机时不改领域代码的路径。

## 1. 前提

- 安装 Docker Desktop（Windows/macOS）或 Docker Engine + Compose Plugin（Linux）。
- 笔记本重启后要自动恢复服务，需要让 Docker 自身随系统启动；Compose 服务已设置 `restart: unless-stopped`。
- 当前版本没有登录鉴权。默认只监听 `127.0.0.1`，不要直接暴露到公网。

## 2. 首次启动

在仓库根目录执行：

```powershell
Copy-Item .env.selfhost.example .env.selfhost
```

编辑 `.env.selfhost`：

- 为 `POSTGRES_PASSWORD` 生成长随机密码，并同步修改 `DATABASE_URL`；密码含 URI 保留字符时需要 URL 编码。
- 填写真实 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL`。
- 保持 `APP_BIND_ADDRESS=127.0.0.1`，除非明确需要可信局域网设备访问。

启动并构建：

```powershell
docker compose --env-file .env.selfhost up --build -d
docker compose --env-file .env.selfhost ps
docker compose --env-file .env.selfhost logs --tail 100 web
```

Web 容器会等待 PostgreSQL 健康，然后先执行 `npm run db:migrate`，确认迁移成功后才启动 Next.js。打开 `http://127.0.0.1:3000/chat`。

## 3. 健康检查

`GET /api/v1/health` 返回：

- `healthy`：数据库可用，模型配置完整。
- `degraded`：数据库可用，但模型未配置；会话管理仍可使用。
- `unhealthy` + HTTP 503：数据库不可用，容器健康检查会失败。

响应不包含数据库连接串、密码、API Key 或内部异常消息。查看状态：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health
docker compose --env-file .env.selfhost ps
```

## 4. 停止、升级与重启恢复

```powershell
# 停止容器但保留数据库卷
docker compose --env-file .env.selfhost down

# 拉取代码后重新构建；启动过程自动应用待执行迁移
docker compose --env-file .env.selfhost up --build -d
```

不要执行 `docker compose down -v`，它会删除 PostgreSQL 数据卷。代码更新前先备份；涉及 Schema 变化时阅读对应 CHANGELOG 和 rollback 说明。

## 5. 备份

Windows PowerShell：

```powershell
.\scripts\selfhost-backup.ps1
```

Linux/macOS：

```bash
./scripts/selfhost-backup.sh
```

脚本通过容器内 `pg_dump` 生成 `backups/agent-web-<timestamp>.sql`。`backups/` 与真实 `.env.selfhost` 均被 Git 忽略。至少定期把备份复制到另一块磁盘或受保护的云存储；只保存在同一笔记本上不能防范磁盘损坏。

## 6. 还原演练

还原会替换当前数据库，必须显式确认。先停止写入并核对目标环境与文件：

```powershell
.\scripts\selfhost-restore.ps1 -BackupFile .\backups\agent-web-20260906-120000.sql -ConfirmRestore
```

```bash
./scripts/selfhost-restore.sh ./backups/agent-web-20260906-120000.sql --confirm-restore
```

脚本先验证文件存在且非空、停止 Web 写入，再重建 `public` Schema，并让 `psql` 使用 `ON_ERROR_STOP=1`；成功后重新启动 Web，任何 SQL 错误都会返回失败且 Web 保持停止以避免继续写入不完整数据库。还原后检查健康端点和 Chat 会话。正式数据至少做一次“备份 → 独立测试环境还原 → 核对会话数与分支”的演练，不能只验证备份文件存在。

## 7. 手机与局域网访问

如果手机和笔记本处于可信局域网，可将 `APP_BIND_ADDRESS` 改为 `0.0.0.0`，重启 Compose 后通过笔记本局域网 IP 访问。启用前必须：

1. 确认网络可信并限制防火墙来源。
2. 不开放 PostgreSQL 端口；Compose 默认没有映射它。
3. 理解当前没有登录，局域网中能连接该端口的设备都可能访问个人会话。
4. 远程访问优先使用带设备认证的私有组网与 HTTPS；在完成应用鉴权前不建议公网端口转发。

## 8. 迁移到云端

云迁移时保持同一镜像、迁移命令和 PostgreSQL Schema：

1. 在笔记本生成并验证备份。
2. 云端通过 Secrets 注入同名环境变量，不复制真实 `.env.selfhost` 到镜像。
3. 创建受保护的 PostgreSQL，恢复备份并运行 `db:migrate`。
4. Web 只通过私有网络连接数据库；公网入口使用 HTTPS 反向代理并先增加身份认证。
5. 切换域名后核对健康检查、会话树、模型流和备份计划。

当前 Compose 是单机基线，不提供高可用、自动 TLS、自动异地备份、登录或零停机升级。这些能力应在真正需要公网或多用户时进入后续 Sprint。

## 9. 当前验证边界

自动化测试会检查 Compose 的私有数据库、持久卷、依赖健康顺序、localhost 默认绑定、迁移先于启动、Secret 排除和恢复确认。当前开发机未安装 Docker/PostgreSQL CLI，因此 Sprint 1.5 无法在本机真实拉起容器或执行 `pg_dump/psql`；首次在具备 Docker 的机器运行时必须补做完整启动、重启恢复和备份还原演练，并把结果追加到 CHANGELOG。
