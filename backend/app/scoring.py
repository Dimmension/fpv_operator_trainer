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


def calculate_tapping_curve(intervals: list[int]) -> dict[str, str]:
    if not intervals:
        return {"type": "Неизвестный", "description": "Нет данных"}
    
    first = intervals[0]
    max_val = max(intervals)
    last = intervals[-1]
    
    # Классификация Ильина (упрощенная для 6 интервалов)
    # Выпуклый (I) - рост к середине, спад не ниже начального
    if max_val > first and last >= first * 0.9:
        return {"type": "Сильный (Выпуклый)", "description": "Высокая сила нервной системы, способность к мобилизации."}
    
    # Ровный (III) - колебания не более 10-15%
    if all(abs(val - first)/first <= 0.15 for val in intervals if first > 0):
        return {"type": "Средний (Ровный)", "description": "Стабильная, но умеренная работоспособность."}
        
    # Нисходящий (V) - постоянное снижение
    if last < first * 0.75 and intervals[1] <= first:
        return {"type": "Слабый (Нисходящий)", "description": "Низкая сила нервной системы, быстрое истощение."}
        
    # Вогнутый (IV) - спад в середине, рост в конце
    min_mid = min(intervals[1:4]) if len(intervals) > 4 else first
    if min_mid < first and last > min_mid:
        return {"type": "Средне-слабый (Вогнутый)", "description": "Быстрое утомление, но есть способность к восстановлению."}
        
    # По умолчанию - средне-сильный
    return {"type": "Средне-сильный", "description": "Хорошая работоспособность с небольшим утомлением."}