from copy import deepcopy
from backend.note_texture import review_second_voices


def n(start, end, midi, activation=.8, **rest):
    return dict(start=start, end=end, midi=midi, activation=activation, **rest)


def test_real_octave_double_stop_is_not_suppressed():
    notes = [n(.1, .8, 60), n(.11, .7, 72, .4)]
    result = review_second_voices(notes, notes)
    assert not result['decisions']
    assert result['proposed_groups'][0]['type'] == 'double_attack'


def test_harmonic_removal_is_only_a_proposal_and_original_notes_are_preserved():
    notes = [n(.1, .8, 60), n(.11, .7, 72, .4)]
    original = deepcopy(notes)
    result = review_second_voices(notes, [notes[0]])
    assert result['decisions'][0]['reason'] == 'harmonic_candidate'
    assert result['proposed_notes'][1]['excluded']
    assert result['notes'] == notes == original
    assert not result['release_approved']


def test_sustain_is_not_counted_as_a_second_new_attack():
    notes = [n(.1, 1., 60), n(.4, .9, 64)]
    result = review_second_voices(notes, notes)
    assert result['proposed_groups'][1]['type'] == 'single_attack'
    assert result['proposed_groups'][1]['ringing_indices'] == [0]


def test_manual_correction_wins_over_model_disagreement():
    notes = [n(.1, .8, 60), n(.11, .7, 72, .4, edited=True)]
    result = review_second_voices(notes, [notes[0]])
    assert not result['decisions']
    assert not result['proposed_notes'][1].get('excluded')


def test_adjacent_retrigger_can_be_reviewed_as_a_continuation_without_editing_source():
    notes = [n(.1, .4, 60), n(.4, .7, 60, .4), n(.4, .8, 64)]
    result = review_second_voices(notes, [n(.1, .7, 60), n(.4, .8, 64)])
    assert result['decisions'][0]['reason'] == 'sustain_continuation_candidate'
    assert result['proposed_notes'][0]['end'] == .7
    assert result['notes'][0]['end'] == .4


def test_a_separate_corroborated_repeated_note_is_not_merged():
    notes = [n(.1, .4, 60), n(.4, .7, 60, .4), n(.4, .8, 64)]
    assert not review_second_voices(notes, notes)['decisions']
