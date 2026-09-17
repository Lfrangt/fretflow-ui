# Scrolling score

The analysis score can switch between a page and a horizontal scrolling view. The scrolling view keeps the current written beat at a reading line while the staff and guitar tabs move through a bounded viewport. The surrounding workspace stays still.

Open an analysis with notes, choose **Staff / tabs (Beta)**, then **Scrolling score** and play the written score. Pause, resume, seek and speed changes use the same score player. Turn **Following playhead** off to browse; choose **Follow playhead** to return to the current beat. Reduced-motion mode follows in discrete steps. Page layout and PDF exports retain the paginated score.

The reading line follows the quantized written rhythm. Original audio and detected-timing playback retain their separate clocks and do not display a misleading synchronized notation cursor. Score edits stop the previous playback. Two-guitar filtering remains available. The existing Beta notice still applies: notes, rhythm and suggested fingerings need review against the recording.

This feature adds practice playback to FretFlow's generated staff and tablature. It does not add PDF/image recognition or scrolling-video export.

Interaction reference: [小夫老师（吉他进阶）, 给乐器博主做的动态曲谱智能体！](https://www.xiaohongshu.com/explore/6aa91ca20000000011032508), inspected on 2026-09-17. FretFlow uses its existing score renderer and native notation code; no code or assets from the reference are included.
