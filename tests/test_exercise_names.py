"""Unit tests for exercise-name canonicalization."""

from __future__ import annotations

import pytest

from bestrong.utils.exercise_names import (
    canonicalize_exercise_name,
    most_common_raw_name,
)


class TestCanonicalize:
    def test_none_and_empty(self):
        assert canonicalize_exercise_name(None) == ""
        assert canonicalize_exercise_name("") == ""
        assert canonicalize_exercise_name("   ") == ""

    def test_lowercasing(self):
        assert canonicalize_exercise_name("Competition Squat") == "competition squat"
        assert canonicalize_exercise_name("COMPETITION SQUAT") == "competition squat"

        assert canonicalize_exercise_name("Slow TO Knee Deadlifts (3-0-0)") == canonicalize_exercise_name(
            "Slow To Knee Deadlifts (3-0-0)"
        )

    def test_whitespace_collapse(self):
        assert canonicalize_exercise_name("  Competition   Squat  ") == "competition squat"

        assert canonicalize_exercise_name("Paused\tSquat") == "pause squat"

    def test_singular_vs_plural(self):

        assert canonicalize_exercise_name("Paused Squat (0-1-0)") == canonicalize_exercise_name(
            "Paused Squats (0-1-0)"
        )
        assert canonicalize_exercise_name("Competition Deadlift") == canonicalize_exercise_name(
            "Competition Deadlifts"
        )

    def test_double_s_preserved(self):

        assert canonicalize_exercise_name("Competition Bench Press 0-1-0") == "competition bench press 0-1-0"

        assert canonicalize_exercise_name("Competition Bench Presses") == canonicalize_exercise_name(
            "Competition Bench Press"
        )

    def test_known_typo_fix(self):

        assert canonicalize_exercise_name("Tempo Sqaut (3-0-0)") == canonicalize_exercise_name(
            "Tempo Squat (3-0-0)"
        )
        assert canonicalize_exercise_name("Tempo Sqauts (3-0-0)") == canonicalize_exercise_name(
            "Tempo Squats (3-0-0)"
        )

    def test_paused_pause_equivalence(self):

        assert canonicalize_exercise_name("Pause Deadlift (0-1-0)") == canonicalize_exercise_name(
            "Paused Deadlift (0-1-0)"
        )
        assert canonicalize_exercise_name("Pause Squats") == canonicalize_exercise_name(
            "Paused Squats"
        )

    def test_distinct_variations_stay_separate(self):

        assert canonicalize_exercise_name(
            "Slow To Knee Deadlifts (3-0-0)"
        ) != canonicalize_exercise_name("Slow To Knee Deadlifts (3-0-0) ( Full Reset)")
        assert canonicalize_exercise_name(
            "Pause Deadlift 0-1-0 (just off the floor)"
        ) != canonicalize_exercise_name("BELTLESS Pause Deadlift (0-1-0)")

    def test_punctuation_and_numbers_preserved(self):


        assert canonicalize_exercise_name("Paused Squat (0-1-0)") == "pause squat (0-1-0)"
        assert canonicalize_exercise_name("Tempo Squats (3-1-0)") == "tempo squat (3-1-0)"

    def test_short_words_not_singularized(self):

        assert canonicalize_exercise_name("Bus") == "bus"
        assert canonicalize_exercise_name("Gas") == "gas"

    @pytest.mark.parametrize("inp", ["Squats", "squats", "  Squats  ", "SQUATS"])
    def test_equivalence_class(self, inp):
        assert canonicalize_exercise_name(inp) == "squat"


class TestMostCommonRawName:
    def test_empty(self):
        assert most_common_raw_name([]) == ""

    def test_single(self):
        assert most_common_raw_name(["Paused Squat"]) == "Paused Squat"

    def test_majority_wins(self):
        names = ["Paused Squat", "Paused Squats", "Paused Squat", "Paused Squat"]
        assert most_common_raw_name(names) == "Paused Squat"

    def test_tie_goes_to_first_occurrence(self):
        names = ["Tempo Squat", "Tempo Squats", "Tempo Squat", "Tempo Squats"]
        assert most_common_raw_name(names) == "Tempo Squat"
