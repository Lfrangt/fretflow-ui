# 手机练习与 Focus 模式

2026-09-15：下列移动端验收来自本地生产构建。后续已随测试提示与反馈入口一同发布，部署 ID 为 `dpl_7yhybkYrWARLgV9wVg5XNh1ShrqF`；正式入口 https://www.fretflow.io 的页面、语言切换与后台健康检查通过。真实 iPhone 声音仍未验证。

## 交互

- 竖屏展示修正：普通手机练习也使用纯指板布局，移除指板下方的装饰琴身；退出 Focus 后不会重新出现琴身。竖屏普通模式预留至少 260px 的舞台高度，下方手指编号图继续保留。
- 上方动画指板显示音程，是主要演奏参考。手机 Focus 使用实际像素布局，每品至少 44px；窄竖屏可以横滑，换和弦时只移动指板内部。横屏优先展示完整指板。
- 下方指法图继续显示手指编号。竖屏 Focus 缩至 62 × 60px，横屏约 58 × 64px，并与和弦名、级数及播放控制分别布局。
- 横屏 Focus 收起导航、编辑工具和页脚，保留退出入口。退出 Focus 后恢复导航。旋转、语言切换不会重建练习状态。
- 手机主按钮至少 44px 点击区域。支持安全区和动态视口；极小屏普通模式允许页面纵向滚动，保证播放按钮可到达。
- 弹层的 Escape 只关闭弹层；页面上的 Escape 退出 Focus。桌面保留琴身淡出及指位动画。

## 音频修复

- 和弦音频在 click 事件中请求解锁；原音频和音符合成播放也直接由播放点击启动。
- 支持 Audio Session 的浏览器声明 `playback` 类型；不支持时保留普通播放流程。
- 恢复所有可恢复的 AudioContext 状态，包括 iOS 的 `interrupted`。关闭的上下文可重新创建。
- 恢复拒绝、仍未运行或超时会提示重试。切换后台暂停练习，返回后可点击播放恢复。
- alphaTab 已在自身输出组件中处理 suspended/interrupted；调用其公开播放方法时保留用户点击上下文，并避免随后的 React effect 重复启动。

参考：[WebKit 用户手势播放规则](https://webkit.org/blog/6784/new-video-policies-for-ios/)、[AudioContext 中断状态](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state)、[Audio Session playback 类型](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type)。

## 验证

- `npm run typecheck`、`npm run build`、`git diff --check` 通过。
- `node --test tests/audio-playback.test.cjs tests/i18n.test.cjs`：9 项通过，覆盖手势内同步 resume、interrupted、拒绝、超时及双语目录。
- 本地生产服务器 `http://localhost:3017`：8 个尺寸 × 普通/Focus 共 16 种布局均无页面横向溢出；当前和弦音符位于指板视口内，播放按钮可到达，缩略指法图保留。
- 尺寸：320×568、375×667、390×844、430×932、568×320、667×375、844×390、932×430。
- 横屏 Focus 的动画指板：844×390 屏幕下约 764×194px；932×430 下约 852×216px。
- 16 和弦长进行从首个切至末个：只有和弦条滚动，页面 scrollX/scrollY 均为 0。
- 播放中旋转保持播放及 Focus；弹层切英文保留和弦，Escape 关闭弹层后仍处于 Focus。
- 验证了相同指板宽度下的视口旋转回归：自动定位依赖实际屏宽，避免末端音符留在屏外。
- 1440×900 桌面 Focus 正常，琴身最终 opacity 为 0，Escape 可退出。
- 浏览器 Web Audio 已观测到合成振荡器创建、音频时钟推进。仍需真实 iPhone 验证扬声器输出、静音开关、微信内置浏览器及后台恢复；浏览器尺寸模拟不能证明这些硬件行为。导入音频两种播放器的点击路径已修改，本轮没有真机导入播放验证。

截图及测量记录：local verification artifacts (not included in the repository)，其中 `viewport-checks.json` 为最终测量。

竖屏修正复测：320×568、375×667、390×844、430×932、844×390 默认模式均无琴身、无页面横向溢出，当前指位可见，播放按钮可到达；旋转和进入/退出 Focus 保持 F13 选择。`typecheck`、5 项 i18n 检查及生产构建通过。截图和记录分别为 `portrait-neck-only.png`、`portrait-neck-only-checks.json`。以上为本次修正的本地验收，发布状态以部署任务确认结果为准。

### 竖屏修复正式站验证

修复已发布到 https://www.fretflow.io ，部署 `dpl_7yhybkYrWARLgV9wVg5XNh1ShrqF`。正式站实际 CSS 视口 390×844：动画指板高度 216px，琴身 display:none，4 个手指编号小图保留，无页面横向溢出。切为 844×390 横屏，再进入 Focus、转回竖屏、退出 Focus，F13 保持且琴身仍隐藏。控制台无错误，后台健康检查通过。证据 `verification/portrait-release.json`；此检查仍不代表真 iPhone 声音验证。
