# FretFlow 维护记录 · 2026-09-15

## 改动

- 和弦播放的异步恢复支持取消：暂停、编辑或换和弦后，旧请求不再发声或把新播放状态改成失败；播放中重新开启声音也会触发当前和弦。
- 保留已有 Safari 用户手势解锁、Audio Session playback 和 interrupted 恢复。小红书报告的真实手机无声尚未在同型号真机复现，不能将这次补强视为该报告已彻底解决。
- 接入 Vercel Web Analytics 免费 Hobby 配额。仅统计工作区首页，移除 URL 查询参数和片段，不发送上传文件、音乐内容或任务 URL。
- 分析代理记录最小化的任务状态日志：HMAC 处理后的任务标识、状态、时间及请求错误的 HTTP 状态。无用户 ID、文件名、原始错误、密钥或下载票据。音乐文件直传 worker，仍通过代理的状态轮询观察结果。
- Next.js 从 16.2.6 更新至 16.3.5，并更新受影响的传递依赖。依据 [官方安全公告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)。更新后 `npm audit` 为 0 项已知漏洞；这不代表完整安全审计。

## 查看数据

访客、浏览量、设备：[Vercel Analytics](https://vercel.com/dashboard)。启用后才开始积累，不能恢复过去的独立访客数。Hobby 包含每月 50,000 个事件、30 天可查看历史。

分析状态日志：[Vercel Logs](https://vercel.com/dashboard)，搜索 `FRETFLOW_ANALYSIS`。汇总示例，在项目目录执行：

```sh
vercel logs --environment production --no-branch --since 1h --query FRETFLOW_ANALYSIS --limit 1000 --json > .runtime/analysis-logs.jsonl
node scripts/summarize-analysis.mjs .runtime/analysis-logs.jsonl
```

成功率 = 观察到完成的任务 /（观察到完成 + 分析失败）。取消、仍在进行、缺失最终结果单列。重复轮询按任务去重，HTTP 请求失败另计。关闭页面后的任务可能缺少最终轮询；日志保留期、导出上限也限制覆盖范围。这里是日志窗口内的观察值，不是完整长期后台统计，也不是人数。若需完整长期任务成功率，应在 worker 持久化最终状态后再扩展。

## 验证

- 全部 43 项 Node 回归检查通过，包括音频中断/取消、统计去重及脱敏、双语目录、指型、谱子导入和播放器数据。
- 类型检查、锁文件安装预检、差异格式检查通过。
- 390×844 浏览器视口：首次播放、编辑为 Am G F C、保存后再播放，观察到 Web Audio 上下文 running 和新的合成振荡器。
- 全新本地生产页面：编辑后出现 8 个振荡器，播放状态正常，控制台无错误。静音后继续播放、再打开声音通过；避免与预听同时触发。
- 真实 iPhone 扬声器、静音开关、微信内浏览器输出仍需真机回访。

## 后续优先级

1. 回访手机编辑后无声，按设备/浏览器与具体操作复现；当前反馈保持待真机确认。
2. 按每 4 小时的小红书巡检收集新增问题，避免重复通知。
3. 当前 worker 依赖临时隧道；更高可用性需要稳定域名、进程管理与持久化结果。

## 正式发布验收

- 正式站：https://www.fretflow.io ，部署 `dpl_EcoLXkdFyqtn2gMvHnFRZXSUcbjb`。发布前检查候选部署，随后提升到正式域名；上一版为 `dpl_AvvCWrWCKmQLKsYTu64NjScDvVM2`，可按需回滚。
- 正式站实际 CSS 视口 390×844，无页面横向溢出。编辑保存后再次播放产生 8 个振荡器；播放中从静音恢复只触发一组 8 个振荡器；控制台无错误。中英文切换保留 Dm7 G7 Cmaj7 Am7。
- Analytics 脚本与 `/view` 上报均返回 HTTP 200，统计开始接收访问。验收访问也会计入数据，不能当作新增真实用户。
- 自带 harmony 示例在线分析：2026-09-15T22:16:40Z 完成，耗时 6.03 秒，返回 4 段和弦。实际日志按任务汇总为 1 个完成任务；这是维护验收样本，不代表总体成功率。
- 私有证据：`.runtime/maintenance/production-mobile.png`、`production-analysis.json`、`analysis-summary.json`。原手机反馈保持待真机确认。
