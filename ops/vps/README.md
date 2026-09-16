# FretFlow 常驻后台迁移

状态：部署文件已准备，尚未租用或连接独立服务器，尚未执行切换。
线上继续使用原云电脑。不要把本目录的配置文件当作已部署证明。

## 目标

- 固定入口 `https://api.fretflow.io`，Caddy 自动管理 HTTPS。
- Linux systemd 管理单个 Python worker；开机自启、退出后自动重启。
- 任务和 SQLite 上传票据持久化到 `/var/lib/fretflow-worker`，模型和程序位于 `/opt/fretflow-worker`。
- 维持当前 1 个执行任务、180 秒片段及 95 MiB 文件限制；不设每日分析次数额度。
- 这是一台常驻服务器，不是多机高可用；维护和故障仍可能短暂中断服务。

## 服务器准备

使用独立的 Ubuntu 24.04 LTS x86_64 VPS，systemd 为 PID 1，有固定公网 IPv4。
初选 24 GiB 内存、8 vCPU、200 GB 磁盘；真实内存峰值和耗时需在目标机实测。
服务商账号、地区、付款周期及税后费用须在购买前确认。不要根据“起价”自动签年度合约。

1. 创建普通服务用户：`useradd --system --user-group --home-dir /var/lib/fretflow-worker --create-home --shell /usr/sbin/nologin fretflow`。
2. 安装 Python 3、FFmpeg、Git、curl、uv 和 Caddy。uv 与 Caddy 使用官方安装源，记录版本。
3. 把经检查的后台代码包解压到 `/opt/fretflow-worker`，由 root 管理。包中不得有真实 env、任务媒体、tokens、浏览器状态或 `.venv-audio`。
4. 在该目录运行 `UV_PYTHON_INSTALL_DIR=/opt/fretflow-worker/.python-runtime bash scripts/setup-cloud.sh` 安装锁定的 CPU 依赖和模型，再运行 `.venv-audio/bin/python -m pytest -q`。Python 安装在 `/opt`，避免虚拟环境链接到 root 家目录后被 systemd 的 ProtectHome 隔离。确保 `fretflow` 用户可读取程序、解释器及模型。安装是一次性工作，不放进系统启动命令。
5. 将 `worker.env.example` 复制为 `/etc/fretflow/worker.env`。通过私有方式填入与 Vercel 相同的 worker token，文件 root 所有、权限 600；不在终端打印。
6. 运行 `bash ops/vps/install-service.sh`。本脚本只安装 worker，不会更改 DNS 或覆盖 Caddy 配置。
7. 防火墙保留已验证的 SSH 管理入口，再开放 TCP 80/443；8771 只监听回环地址，不对公网开放。

## 固定地址和 HTTPS

在 Porkbun 增加 `api.fretflow.io` 的 A 记录，指向新服务器。保留前端现有 apex/www 记录。
没有已验证可用的 IPv6 时，不增加 AAAA。

将本目录 Caddyfile 的站点块加入服务器的 Caddy 配置。若已有站点，保留它们。
先运行 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`，再启用/重载 Caddy 服务。
不要开启带原始查询参数的访问日志；上传与下载票据在 URL 中。

## 切换前验收与数据迁移

1. 核对 DNS、证书、`https://api.fretflow.io/api/health`，确认 hosted 模式及全部模型可用。
2. 使用新后端地址和现有 token 创建一个不接管正式域名的 Vercel 部署，进行带签名的浏览器上传、分析、试听、下载、跨会话 404 和连续多次分析验证；至少包含大于 4.5 MB 的文件。
3. 在目标机记录实际推理峰值内存、耗时和磁盘增长。验证 worker 异常退出后 systemd 自动拉起，随后重启整台 VPS，再验证 API 与分析流程。
4. 正式切换安排短暂维护窗口：暂停新任务，等旧任务完成。停止旧 worker 后，经私有传输复制旧 `.runtime/jobs/` 到新 `/var/lib/fretflow-worker/jobs/`，复制旧 `.runtime/hosting.sqlite3` 到新 `/var/lib/fretflow-worker/hosting.sqlite3`。不要在运行中的 SQLite 上直接复制，勿覆盖旧目录或删除旧数据。
5. 复制后把新数据目录权限交给 `fretflow:fretflow`，启动新 worker，验证已有浏览器会话仍能访问保留期内的记录。迁移时钟与保留期不能重置。
6. 将 Vercel Production 的 `FRETFLOW_WORKER_URL` 更新为 `https://api.fretflow.io`，保持相同 token，重新部署并推广；域名 DNS 本身不会更新已构建的环境变量。
7. 从 `https://fretflow.io` 实测上传、分析、试听、下载，保存不含票据的验证摘要。通过后结束维护。

## 回滚与维护

切换前保留旧服务和 Vercel 部署。若新服务失败，先停止接收任务并评估新任务数据，再恢复旧地址/部署；若已接收新任务，应先停两边并迁回新增数据，避免任务记录或票据状态分叉。不要同时运行两个写入同一数据目录的 worker。

日志：`journalctl -u fretflow-worker --since today`。状态：`systemctl status fretflow-worker`。
连续启动失败会触发 systemd 限速；修复原因后运行 `systemctl reset-failed fretflow-worker` 并启动。
维护重启前等待运行任务结束。备份涉及用户上传内容；若启用服务商快照，需把实际备份保留期纳入用户数据说明，目前页面的 24 小时说明仅适用于在线媒体与结果，不能默默延长保留。

参考：[systemd 服务](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)、[Caddy HTTPS](https://caddyserver.com/docs/automatic-https)、[Caddy 反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。
