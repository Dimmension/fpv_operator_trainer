from collections.abc import Iterable
from typing import Any


def attention_grade(items_found: int) -> dict[str, str]:
    if items_found < 25:
        return {
            "grade": "low",
            "label": "Низкий",
            "interpretation": (
                "Есть затруднения с выделением главного среди отвлекающих факторов."
            ),
        }
    if items_found < 50:
        return {
            "grade": "medium",
            "label": "Средний",
            "interpretation": (
                "Концентрация достаточна, но может снижаться при длительной нагрузке."
            ),
        }
    return {
        "grade": "high",
        "label": "Высокий",
        "interpretation": ("Высокая интенсивность и устойчивость внимания при визуальном поиске."),
    }


def per_minute_pace(correct_elapsed_values: Iterable[int], minutes: int = 5) -> list[int]:
    pace = [0] * minutes
    for elapsed_ms in correct_elapsed_values:
        bucket = min(max(elapsed_ms, 0) // 60_000, minutes - 1)
        pace[bucket] += 1
    return pace


def evaluate_memory_answer(
    stimulus: list[dict[str, Any]], response: list[dict[str, Any]]
) -> dict[str, int]:
    expected_pairs = {(item["grid_position"], item["shape"]) for item in stimulus}
    response_pairs = {(item["grid_position"], item["shape"]) for item in response}
    expected_positions = {item["grid_position"] for item in stimulus}
    response_positions = {item["grid_position"] for item in response}
    return {
        "exact_matches": len(expected_pairs & response_pairs),
        "position_matches": len(expected_positions & response_positions),
    }
