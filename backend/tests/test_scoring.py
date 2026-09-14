from app.scoring import attention_grade, evaluate_memory_answer, per_minute_pace


def test_attention_grade_boundaries() -> None:
    assert attention_grade(24)["grade"] == "low"
    assert attention_grade(25)["grade"] == "medium"
    assert attention_grade(49)["grade"] == "medium"
    assert attention_grade(50)["grade"] == "high"


def test_per_minute_pace_keeps_five_buckets() -> None:
    assert per_minute_pace([0, 59_999, 60_000, 240_000, 300_000]) == [2, 1, 0, 0, 2]


def test_memory_answer_scores_exact_and_position_matches_separately() -> None:
    stimulus = [
        {"grid_position": 1, "shape": "circle"},
        {"grid_position": 2, "shape": "square"},
    ]
    response = [
        {"grid_position": 1, "shape": "square"},
        {"grid_position": 2, "shape": "circle"},
    ]

    assert evaluate_memory_answer(stimulus, response) == {
        "exact_matches": 0,
        "position_matches": 2,
    }
