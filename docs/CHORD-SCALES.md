# Current-chord scale suggestions

`chordScaleCandidates(chord, { key?, chordPitchClasses? })` in `lib/harmony.ts` is a deterministic practice aid. It does not listen to audio, identify the original solo's scale, or change the existing key estimate / Roman-numeral logic.

- Parse a supported whole chord symbol, preserving its root spelling. Unknown symbols and `N.C.` return no candidates. A slash bass adds a required pitch without becoming the scale root.
- Use explicit chord formulas, including minor-major sevenths, diminished sevenths, altered fifths and extensions. Compact 9/11/13, `7b9`, `7#9`, `7b13`, and `7alt` formulas follow the app's existing voicing vocabulary: an omitted fifth is not assumed perfect. Extra actual sounding pitch classes (integers 0–11) add constraints; they never erase the symbol's required tones.
- An accidental extension replaces its unaltered tone from the base formula, but preserves other explicitly added tones. Thus `C9b9` changes the ninth, while `Cmaj7add11#11` requires both fourths and gets no suggestion in this vocabulary.
- Choose from 19 fixed patterns: the seven diatonic modes, the seven ascending melodic-minor modes, harmonic minor, Phrygian dominant, both diminished patterns, and whole tone. Family-specific priorities give a short useful order, then **every required pitch must be contained in each candidate**. Return at most three. `7alt` uses only the altered collection; this avoids adding an unaltered ninth or fifth to an unspecified altered dominant.
- Spell notes from root letter plus each displayed degree. Consequently C Ionian is C D E F G A B, F-sharp Ionian has E-sharp, and C-flat Ionian correctly has F-flat. Symmetrical and altered patterns use explicit, sometimes enharmonic degrees; for example a diminished seventh's B-double-flat can appear as A / degree 6 in C whole-half diminished.
- `id` identifies the scale pattern; `nameKey` is the English translation key; `root`, `notes`, `degrees`, `intervals`, and `chordToneFlags` describe parallel note rows. `intervals` are semitones relative to the chord root. Flags include symbolic requirements, slash bass, and supplied sounding pitches. Returned arrays are independent copies.
- Pass `key` only for a manually chosen **major** key. `keyMatch` is an optional exact pitch-collection comparison, never a confidence value or sort preference. Do not pass the automatic key estimate as established fact. Guitar pitch classes must already include the current tuning and physical fret/capo exactly once.

## Fixed examples

| Chord | Candidate pattern IDs, in order |
| --- | --- |
| Cmaj7 | ionian, lydian |
| Fmaj7#11 | lydian |
| G7 | mixolydian, lydian-dominant, mixolydian-b6 |
| G7alt | altered |
| Dm7 | dorian, aeolian, phrygian |
| Em7b5 | locrian, locrian-natural-2 |
| Cdim7 | whole-half-diminished |
| CmMaj7 | melodic-minor, harmonic-minor |
| Cmaj7#5 | lydian-augmented |
| C7b9#11 | half-whole-diminished, altered |
| Cmaj7/F# | lydian, still rooted on C |

## Translation keys

| English key | Chinese suggestion |
| --- | --- |
| Ionian (major) | 伊奥尼亚（大调） |
| Dorian | 多利亚 |
| Phrygian | 弗里几亚 |
| Lydian | 利底亚 |
| Mixolydian | 混合利底亚 |
| Aeolian (natural minor) | 爱奥利亚（自然小调） |
| Locrian | 洛克里亚 |
| Melodic minor (ascending) | 旋律小调（上行） |
| Dorian b2 | 多利亚降二级 |
| Lydian augmented | 增利底亚 |
| Lydian dominant | 利底亚属音阶 |
| Mixolydian b6 | 混合利底亚降六级 |
| Locrian natural 2 | 洛克里亚还原二级 |
| Altered | 变化音阶 |
| Harmonic minor | 和声小调 |
| Phrygian dominant | 弗里几亚属音阶 |
| Whole-half diminished | 全半减音阶 |
| Half-whole diminished | 半全减音阶 |
| Whole tone | 全音阶 |
| Contains the chord tones and extensions | 包含和弦音及扩展音 |
| Matches the altered dominant tones | 匹配变化属和弦音 |

## Musical scope and verification

Chord-scale choices describe possible colors, not guaranteed melodies or equally stable notes. Voice leading, phrasing, passing notes, and the surrounding progression still matter. The default diatonic pairings and this contextual limitation follow [Open Music Theory: Chord-Scale Theory](https://viva.pressbooks.pub/openmusictheory/chapter/chord-scale-theory/). Non-diatonic interval collections follow the [University of Puget Sound: Table of Jazz Scales](https://musictheory.pugetsound.edu/mt21c/JazzScales.html), with explicit enharmonic spellings for dominant and symmetrical patterns.

Run `node --test tests/harmony-scales.test.mjs`. Tests cover the fixtures, exact pitch containment and highlighting, sharp/flat spellings, note/degree correspondence, inversions, actual-fingering conflicts, explicit extensions, aliases/invalid symbols, optional manual-key matching, and independent returned state.
