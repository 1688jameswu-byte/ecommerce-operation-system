# PostgreSQL 日常运维指南

## 1. 文档目的

本文档用于管理电商运营中心 1688业务 PostgreSQL 数据库的日常备份、检查、恢复和安全注意事项。

当前 1688业务已经使用 PostgreSQL 作为数据库，数据库运行在本机 F 盘 PostgreSQL 实例中。

当前数据库信息：

```text
数据库用途：1688业务
数据库名：ecommerce_ops
数据库用户：ecommerce_ops_user
数据库服务：postgresql-x64-16-f-ecommerce
数据库地址：localhost
数据库端口：5433
数据目录：F:\PostgreSQL\16\data
备份目录：F:\ecommerce-operation-system\backup\postgres
```

注意：

* 不要把数据库密码写进文档。
* 不要提交 `.env` 文件。
* 不要把备份文件提交到 Git。
* 不要直接手动删除 PostgreSQL 数据目录。
* 不要把图片文件存入 PostgreSQL，数据库只保存图片路径、URL、状态和关联关系。

---

## 2. 当前备份命令

项目已经新增手动备份命令：

```bash
npm.cmd run backup:1688-db
```

该命令会：

* 从项目根目录 `.env` 读取 `DATABASE_URL`
* 使用 PostgreSQL 官方 `pg_dump`
* 自动创建备份目录
* 生成带日期时间的 `.sql` 备份文件
* 检查备份文件是否存在
* 检查备份文件大小是否大于 0
* 不输出数据库密码
* 不输出完整数据库连接串

备份文件保存路径：

```text
F:\ecommerce-operation-system\backup\postgres
```

备份文件命名格式：

```text
ecommerce_ops_YYYYMMDD_HHmmss.sql
```

示例：

```text
ecommerce_ops_20260608_155947.sql
```

---

## 3. 每日手动备份流程

每天开始开发前，或者做重要修改前，建议先执行一次备份。

操作步骤：

### 第一步：进入项目目录

```bash
cd /d F:\项目\TEMU运营数据大屏
```

实际路径以你本机项目位置为准。

### 第二步：执行数据库备份

```bash
npm.cmd run backup:1688-db
```

### 第三步：检查输出结果

确认命令输出中包含：

```text
备份成功
备份文件路径
文件大小
备份时间
```

### 第四步：确认备份文件存在

进入目录：

```text
F:\ecommerce-operation-system\backup\postgres
```

确认有最新的 `.sql` 文件，并且大小大于 0。

---

## 4. 重要操作前必须备份

以下操作前必须先备份：

```text
修改数据库表结构
新增迁移脚本
修改 1688 Repository
修改 1688 API
修改产品库核心字段
修改 SKU 字段
修改供应商权限
修改上架任务状态流转
批量导入产品
批量导入 SKU
批量删除数据
上线新版本前
```

建议流程：

```text
先备份
再修改
再运行 verify:1688-db
再运行 npm.cmd run build
```

标准命令：

```bash
npm.cmd run backup:1688-db
npm.cmd run verify:1688-db
npm.cmd run build
```

---

## 5. 每周备份检查

每周至少检查一次备份目录。

检查内容：

```text
是否每天都有备份文件
备份文件大小是否正常
是否存在 0 KB 文件
F盘剩余空间是否充足
是否需要复制一份到其他硬盘或云服务器
```

如果发现某个备份文件是 0 KB，不能作为有效备份使用。

---

## 6. 备份文件保留建议

当前阶段建议：

```text
最近 7 天：每天保留
最近 4 周：每周保留 1 份
每月：保留 1 份月度备份
```

简单做法：

* 不要马上自动删除备份。
* 前期可以手动清理旧备份。
* 等备份文件很多以后，再做自动清理脚本。

不建议现在做复杂自动删除，避免误删重要备份。

---

## 7. 云端备份建议

本地 F 盘备份只能防止数据库误操作，不能防止电脑硬盘损坏。

建议后续增加云端备份：

```text
本地 PostgreSQL
↓
生成 .sql 备份
↓
复制到腾讯云服务器
↓
服务器定期保存最近几天备份
```

可选云端路径：

```text
/var/backups/ecommerce-operation-system/postgres
```

前期可以手动上传备份文件到腾讯云服务器。

后期再考虑自动同步。

---

## 8. 恢复备份说明

恢复数据库属于高风险操作，不要随便执行。

恢复前必须确认：

```text
目标数据库是哪一个
要恢复哪个备份文件
当前数据库是否需要先备份
是否会覆盖现有数据
是否已经停止相关写入操作
```

恢复前必须先再做一次当前数据库备份：

```bash
npm.cmd run backup:1688-db
```

### 参考恢复命令

以下命令只是参考，不要随便直接执行。

如果使用 `.sql` 文件恢复，可以使用：

```bash
"C:\Program Files\PostgreSQL\16\bin\psql.exe" ^
  -h localhost ^
  -p 5433 ^
  -U ecommerce_ops_user ^
  -d ecommerce_ops ^
  -f "F:\ecommerce-operation-system\backup\postgres\ecommerce_ops_备份时间.sql"
```

执行恢复时会要求输入数据库密码。

不要把密码写在命令里。

---

## 9. 恢复操作注意事项

恢复操作可能覆盖或改变当前数据库数据。

恢复前必须做到：

```text
确认备份文件正确
确认数据库名正确
确认连接端口正确
确认当前数据库已额外备份
确认没有人在使用系统写入数据
```

如果不确定，不要执行恢复。

建议先在测试数据库中恢复验证，再恢复正式数据库。

---

## 10. 服务检查命令

F盘 PostgreSQL 已注册为 Windows 服务。

服务名：

```text
postgresql-x64-16-f-ecommerce
```

检查服务状态：

```powershell
Get-Service -Name postgresql-x64-16-f-ecommerce
```

启动服务：

```powershell
Start-Service -Name postgresql-x64-16-f-ecommerce
```

停止服务：

```powershell
Stop-Service -Name postgresql-x64-16-f-ecommerce
```

重启服务：

```powershell
Restart-Service -Name postgresql-x64-16-f-ecommerce
```

检查 PostgreSQL 是否可连接：

```powershell
"C:\Program Files\PostgreSQL\16\bin\pg_isready.exe" -h localhost -p 5433
```

正常结果应类似：

```text
localhost:5433 - accepting connections
```

---

## 11. 项目验证命令

数据库服务正常后，进入项目目录执行：

```bash
npm.cmd run verify:1688-db
```

该命令应通过，并显示：

```text
1688 PostgreSQL verification passed
7 tables migrated
API CRUD passed
```

然后执行构建：

```bash
npm.cmd run build
```

如果只有 Vite chunk 体积警告，不算失败。

---

## 12. 常见问题

### 12.1 数据库连接失败

检查：

```text
F盘 PostgreSQL 服务是否运行
.env 是否指向 localhost:5433
DATABASE_URL 是否正确
数据库密码是否正确
端口是否被占用
```

先运行：

```powershell
Get-Service -Name postgresql-x64-16-f-ecommerce
"C:\Program Files\PostgreSQL\16\bin\pg_isready.exe" -h localhost -p 5433
```

再运行：

```bash
npm.cmd run verify:1688-db
```

---

### 12.2 备份失败

检查：

```text
.env 是否存在
DATABASE_URL 是否配置
pg_dump.exe 是否存在
备份目录是否可写
F盘空间是否足够
数据库服务是否运行
```

pg_dump 默认路径：

```text
C:\Program Files\PostgreSQL\16\bin\pg_dump.exe
```

---

### 12.3 备份文件太小

如果备份文件明显很小，需要检查：

```text
数据库是否为空
备份是否中断
命令是否报错
文件是否为 0 KB
```

如果是 0 KB，不可作为有效备份。

---

### 12.4 电脑重启后系统报数据库错误

检查 F盘 PostgreSQL 服务是否自动启动：

```powershell
Get-Service -Name postgresql-x64-16-f-ecommerce
```

如果不是 Running，执行：

```powershell
Start-Service -Name postgresql-x64-16-f-ecommerce
```

然后再运行：

```bash
npm.cmd run verify:1688-db
```

---

## 13. 安全原则

必须遵守：

```text
不要提交 .env
不要提交数据库备份文件
不要在代码里写数据库密码
不要在文档里写真实密码
不要把 PostgreSQL 5433 暴露公网
不要把图片文件直接存进 PostgreSQL
不要直接删除数据库 data 目录
不要随便执行恢复命令
```

当前数据库只应该由本机项目访问：

```text
localhost:5433
```

如果以后部署到腾讯云服务器，应在云服务器上单独安装 PostgreSQL，不建议让云服务器直接连接你本机数据库。

---

## 14. 推荐日常操作顺序

每天开发前：

```bash
npm.cmd run backup:1688-db
npm.cmd run verify:1688-db
```

开发完成后：

```bash
npm.cmd run verify:1688-db
npm.cmd run build
```

重要功能上线前：

```bash
npm.cmd run backup:1688-db
npm.cmd run verify:1688-db
npm.cmd run build
```

---

## 15. 后续可升级方向

当前已经完成手动备份。

后续可以继续升级：

```text
自动每日备份
保留最近 7 天备份
每周长期备份
自动压缩 .sql 文件
备份同步到腾讯云服务器
备份失败提醒
恢复到测试库验证
```

当前阶段先保持手动备份即可，不要过早做复杂自动化。

---

## 16. 总结

当前 PostgreSQL 备份策略：

```text
本地 F盘 PostgreSQL 正式存储 1688业务数据
手动备份命令：npm.cmd run backup:1688-db
备份位置：F:\ecommerce-operation-system\backup\postgres
备份格式：.sql
恢复需人工确认
不自动恢复
不把密码写入代码
不影响旧 JSON 模块
```

1688业务每次大改前，必须先备份数据库。
