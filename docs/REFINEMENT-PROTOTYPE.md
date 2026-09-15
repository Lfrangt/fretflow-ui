# 吉他校正层：第一版自研原型

2026-09-14。已实现一项本地产品改进和一项实验解码器；尚未达到准确逐音转谱的发布标准。

## 已接入：独立演奏时间线

`lib/performance-midi.ts` 直接从可编辑音符生成演奏 MIDI，不经过 MusicXML 的十六分音符量化、建议指法或同弦延音截断。谱面与演奏分别有自己的时间线。

页面新增“按识别时序试听”：从原音当前播放位置开始，采用所选 1× / 0.75× / 0.5× 速度。原音、这一路试听、原有谱面试听互相停止，避免声音重叠。独立试听不显示可能错位的谱面光标；原音的循环区间当前仍只作用于原音播放器。它是一条比较用回放，不声称已还原真实演奏技巧。

相同音高的重叠音符使用不同 MIDI 通道，防止一个 note-off 提前终止另一个音的延音。删除和修改会进入新演奏时间线。只有明确给出的 velocity 才用于力度；没有力度数据时为固定 95，模型 activation 不被冒充成实际强弱。

用用户录音的全部 583 个音符，导出实际 MIDI 再通过独立 MIDI 库解析核对：

- 输出音符 583，音高不一致 0。
- 相对输入识别结果，新增起音/结束时间误差最大均为 0.2584 ms。
- 三个相近起音不再被排谱网格合并；同音重叠不强制截断。

这是传递识别信息的精度，不是相对真实演奏的转谱准确度。证据：`verification/performance-timing/report.json` 和 `user-detected.mid`。

## 实验解码器：逐音结束时间融合

`backend/refinement.py` 的 `release-fusion-v1` 保留主模型 GAPS 的音高、起音和音符数量。通过同音高、起音相距不超过 80 ms 的一对一匹配，使用 Basic Pitch 对音频持续性的检测结果辅助确定结束时间。

这是一种模型证据融合，**尚未实现直接从频谱分析衰减或抑制泛音**。匹配不到的音保留原值，人工编辑、新增、删除标记均保留；每次修改记录原结束时间、候选时间、匹配对象及依据，可以检查和撤回。模型相互同意不等于真实演奏正确。

先在 GuitarSet 的演奏者 00/02/04 上开发，再冻结代码 SHA-256。随后下载另外六段未在前次 12 段基准中出现的录音，来自 01/03/05，才进行这版规则的验证。阈值没有在这六段验证录音上调整。

| 六段新录音上的 micro F1 | 当前 Basic Pitch | GAPS 候选 | GAPS + 自研结束时间校正 |
| --- | ---: | ---: | ---: |
| 音高 + 起音 | 79.1% | 88.7% | 88.7% |
| 音高 + 起音 + 结束时间 | 53.9% | 35.7% | 58.7% |

评价条件沿用原基准：音高 50 cents、起音 50 ms、结束时间 `max(50 ms, 标注时长的 20%)`。新规则相对 GAPS 在六段上均改善结束时间指标；相对当前 Basic Pitch 的整体提升较小，且 `01_Funk1-97-C_comp` 从 72.0% 退步至 67.9%。因此它仍为实验原型，没有替换应用默认识别器。

限制：只有六段干净声学吉他，预训练模型可能接触过 GuitarSet，其他录音的演奏者已出现在早先基准里，标注未重新人工审核。只能证明冻结规则在这些新片段上的表现，不能称为独立产品泛化准确率。没有声称已经进行真人听评。

证据目录：`verification/transcription-quality/validation/`。其中 `rule-freeze.json` 保存规则指纹，`manifest.json` 固定录音和标注指纹，`refined/report.json` 保存三个方案的逐段与总体指标，`*.evidence.json` 记录每音修改。完整复跑命令：

```sh
.venv-audio/bin/python scripts/fetch_refinement_validation.py
.venv-audio/bin/python scripts/benchmark_transcription.py \
  verification/transcription-quality/validation/manifest.json \
  --output verification/transcription-quality/validation/basic-pitch-baseline
.venv-audio/bin/python scripts/evaluate_gaps.py \
  --manifest verification/transcription-quality/validation/manifest.json \
  --output verification/transcription-quality/validation/gaps-predictions
.venv-audio/bin/python scripts/evaluate_refinement.py \
  verification/transcription-quality/validation/manifest.json \
  --primary verification/transcription-quality/validation/gaps-predictions \
  --secondary verification/transcription-quality/validation/basic-pitch-baseline \
  --output verification/transcription-quality/validation/refined
```

GAPS 使用前次评估已经隔离安装的模型/推理源码，未增加产品的强制依赖。以后修改规则必须建立新版本和新的冻结验证记录，不能偷偷覆盖本次成绩。

## 接下来适合自研的模块

1. **声学结束时间判断。** 用基频及谐波随时间的变化判断拨弦后的持续与衰减，区分下一次起音、混响和真正延音；先解决目前扫弦长短仍错误的问题。
2. **假音候选筛选。** 将独立拨弦证据、频谱残差、音域与可演奏性结合，判断高八度的候选是独立弹奏还是低音泛音。八度双音可能是真实演奏，不能一律删除。保留不确定标记与原候选。
3. **奏法和指位校正。** 对连续音高分析滑音、推弦与颤音；视频清楚时，用琴颈位置和手指接触辅助选择弦/品。手被遮挡时回退到音频推断，不强行给唯一指法。
4. **经复核的纠错数据。** 保存原候选、修改内容、音频片段及错误类型，建立自己的吉他误差集，用于训练/校准纠错模型。未经核实的用户编辑不自动当作正确标签。

先推进结束时间与假音筛选，达到真实录音上的稳定改善后，再投入视频手型和奏法识别。每项模块独立比较前后结果，以最终演奏与可用谱为验收对象。

## 工程验证

- 37 项 Python 测试通过，其中 4 项覆盖新校正层的匹配、保留编辑、边界和变更证据。
- 4 项实际 alphaTab MIDI 测试通过，覆盖细微起音、重叠同音、修改/删除和非法时间。
- TypeScript 与 production build 通过。
- 本地浏览器用用户的 142.199 秒录音验证：两路合成回放就绪；互斥切换；从原音 17.45 秒附近开始半速时序试听；停止与中文说明；浏览器 error 日志为空。此次没有在浏览器中修改用户原始音符，修改传递由测试覆盖。

本轮没有发布到公网。准确度验收仍依照 `TRANSCRIPTION-QUALITY.md`。

## 2026-09-14：纯吉他音色与有声前后对比

用户指出试听带有钢琴般的听感后，核对两路 MIDI 均为 GM 24，并将
两路播放器的通用 SONiVOX 音色库替换为 FreePats 真实古典吉他采样。
新音色库只有一个吉他预置（bank 0 / program 24），不包含钢琴或其他
乐器。原始采样未修改；来源、授权及重映射哈希见
`public/soundfonts/freepats-classical-guitar.json` 和 `THIRD_PARTY_NOTICES.md`。
该资源约 19.8 MB；当前只在进入谱面播放功能时加载。

- `tests/performance-midi.test.mjs` 的 5 项检查通过；增加了音色库哈希、
  唯一吉他预置以及每个发声 MIDI 通道均选择该预置的校验。
- TypeScript 检查通过；实际浏览器资源记录确认两路加载此 SF2。
- Playwright 操作真实页面，CDP 截帧，MediaRecorder 采集原音播放器与
  两路合成器实际输出；未使用离线配音冒充浏览器播放。
- 录屏用同一用户录音 0–12 秒、1×，顺序为原音参考、旧谱面时序、
  新识别时序。两个合成回放使用同一份吉他采样。
- 导出前仅对三个阶段应用固定增益以匹配响度；未更改音高、速度或音符。
- 产物：`verification/recordings/FretFlow-guitar-timing-before-after.mp4`。
  采集元数据、合成脚本和响度处理记录位于同级 `timing-comparison/`。
- 录屏只验证时序回放和音色路由；识别错音、编配及演奏表现力仍需改进。

## 单音与双音专项复核

已接入的起音分组、延音显示和逐音回听编辑入口，以及尚未启用的自动删音实验，见 `SINGLE-DOUBLE-NOTES.md`。实验仍会误删少量真实多音起音，因此未改变默认识别与回放的音符集合。
