# 手机练习与 Focus 模式

2026-09-15：下列移动端验收来自本地生产构建。后续已随测试提示与反馈入口一同发布，部署 ID 为 `dpl_7yhybkYrWARLgV9wVg5XNh1ShrqF`；正式入口 https://www.fretflow.io 的页面、语言切换与后台健康检查通过。真实 iPhone 声音仍未验证。

## 交互

- 当前手机普通模式显示可换款式的完整吉他；进入 Focus 使用可横向滑动的大指板，退出后恢复吉他。下方手指编号图继续保留。
- 上方动画指板显示音程，是主要演奏参考。完整练习指板从第 1 品保留至第 21 品；品格按真实十二平均律比例逐渐缩窄，手机最窄的第 21 格仍保留约 30px，手机 Focus 屏宽不足时横向裁切并跟随当前把位。
- 下方指法图继续显示手指编号。竖屏 Focus 缩至 62 × 60px，横屏约 58 × 64px，并与和弦名、级数及播放控制分别布局。
- 横屏 Focus 收起导航、编辑工具和页脚，保留退出入口。退出 Focus 后恢复导航。旋转、语言切换不会重建练习状态。
- 手机主按钮至少 44px 点击区域。支持安全区和动态视口；极小屏普通模式允许页面纵向滚动，保证播放按钮可到达。
- 弹层的 Escape 只关闭弹层；页面上的 Escape 退出 Focus。桌面恢复 9 月 15 日的共同场景动画：普通练习显示连接琴身的指板，进入 Focus 放大同一指板并模糊渐隐琴身，退出反向恢复。场景缩放 1.2 秒，材质消散 1.35 秒；减少动态效果时为零时长。详见 `FOCUS-MOTION.md`。

### 高把位与滚动跟随

- 品号原点固定，切换把位不会重新编号或压缩品格。手机视口围绕当前指型留出相邻品格；指型还在安全区域内时不移动，跨区才平滑滚动。
- 2026-09-16 下午按用户新要求，桌面 Focus 也围绕当前指型显示约八品；普通模式的吉他舞台增大，下方指法卡片改为紧凑横向布局。桌面镜头在同一个琴身与指板场景内移动，保留刚恢复的进入/退出消散动画。详细行为见 `FOCUS-MOTION.md`。
- 滚动与指位移动共用缓动和时长，移除原先 240ms 的启动延迟。新的和弦从当前滚动位置接续；手动触摸、滚轮或键盘操作立即停止自动动画，下一次和弦变化再重新判断视野。
- 旋转屏幕后重新判断可见区域；空拍保持位置，开启减少动态效果后加载页面则直接定位。
- 本地验收：320×568、390×844、844×390 的普通/Focus 模式，以及 1440×900 桌面均显示 21 品、当前指法无裁切、页面无横向溢出。F13 的 15、16、17 品指型可见；跨把位逐帧记录为连续滚动，相邻高把位和弦保持视野。手动横滑后无自动回弹，减少动态效果检查通过。
- `npm test`（57 项）、生产构建、类型检查通过。证据保存在本机 `verification/high-fret-pan.json` 与 `verification/high-fret-pan-phone.png`；此轮为浏览器模拟尺寸验证，未核验这项改动的线上发布状态。

2026-09-16 正式发布：部署 `dpl_6XYPEtdPrvnVciE1qkqPkmkTwVUJ` 已 Ready，`fretflow.io`、`www.fretflow.io` 与 `fretflow-ui.vercel.app` 均指向此版本。发布前重新通过 60 项前端测试、生产构建和类型检查；正式站 Chrome 验证电脑指板 1–21 品、手机 F13 的 15/16/17 品均可见且自动移至高把位，无页面横向溢出。验收记录和截图位于本机 `verification/high-fret-production.json`、`high-fret-production-desktop.png`、`high-fret-production-mobile.png`。

### 真实品距与桌面动态取景（2026-09-16 上午，历史记录）

桌面动态取景已在当日下午恢复 Focus 动画时撤回；真实品距与手机滚动保留。当前行为以上方“交互”和 `FOCUS-MOTION.md` 为准。

- 品丝位置按 `1 - 2^(-n/12)` 计算，再归一化到完整指板长度。第 13 格宽度是第 1 格的一半；品号、圆点和音符使用同一对品丝的中点，不能再按等宽列定位。参考 [StewMac 制琴品距规则](https://www.stewmac.com/video-and-ideas/online-resources/learn-about-guitar-and-instrument-fretting-and-fretwork/fret-scale-rule-instructions/)。
- 桌面默认围绕当前指型取约八品的窗口，宽跨度指型会扩大窗口。相邻指型留在窗口内时镜头不动，越过边缘再平滑平移及缩放；空拍保持视野。保留完整 21 品数据，裁切仅作用于视口。
- 桌面镜头与指位共用缓动，通常 580ms，播放时随节拍缩短；高把位放大时音符仍约 30px，文字约 12px，避免被整体缩小或过度放大。第 1 品窗口留出琴枕和空弦标记的位置。
- 手机采用真实品距的完整可横滑指板，按音符的实际位置判断边缘及滚动目标；相邻指型不反复居中。减少动态效果设置下直接定位。
- 本地页面验收覆盖 320×568、390×844、844×390 及 1440×900，普通/Focus 当前高把位音符均可见，无页面横向溢出。DOM 实测第 13/1 格宽度比约 0.50005，品号与指位中心误差小于 1px。最终发布状态见下方追加记录。

2026-09-16 发布核对：源代码提交 `6c6ebef` 已推送。同期正式部署 `dpl_5NMXLf3aAv8KEiyfg2QgsEbJGiZG` 已包含本次改动；从 Vercel 部署文件清单核对 `guitar-stage.tsx`、`guitar-layout.ts`、`practice-workspace.css` 的 SHA1，三份文件均与验收版本完全一致。保留该完整发布，避免覆盖同期音色功能。独立发布目录通过 63 项测试、生产构建和类型检查。生产构建的桌面跨把位记录了 21–29 个连续中间位置，手机记录了 30 个滚动位置，相邻和弦镜头保持不动。正式域名 HTTP 及指板脚本正常；本轮线上浏览器连接超时，交互验收来自本地生产构建。记录：`verification/realistic-fret-camera.json`，截图：`verification/realistic-fret-camera-mobile.png`。

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
