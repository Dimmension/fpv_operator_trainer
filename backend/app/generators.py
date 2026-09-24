import random
from typing import Any

SHAPES = ("circle", "triangle", "square", "cross", "rectangle")

STATEMENTS = (
    "Проверить уровень заряда",
    "Записать время наблюдения",
    "Сигнал связи стабилен",
    "На экране видны облака",
    "Отметить изменение освещения",
    "Высота отображается справа",
    "Ветер усилился к вечеру",
    "Проверить журнал сообщений",
    "Камера направлена вниз",
    "Сохранить текущие настройки",
    "Показания датчика обновились",
    "Экран перешёл в тёмный режим",
    "Батарея заряжена наполовину",
    "Прибор показывает температуру",
    "Запись видео остановлена",
    "На карте отмечена река",
    "Появилось уведомление системы",
    "Проверить состояние камеры",
    "Время сеанса истекает",
    "Отображается новая схема",
    "Показания датчика в норме",
    "Сменить яркость монитора",
    "В журнале появилась запись",
    "Контрольный список заполнен",
)


def generate_correction_grid(
    rows: int,
    columns: int,
    symbols: list[str],
    target: str,
    target_share: float,
    rng: random.Random | None = None,
) -> list[str]:
    randomizer = rng or random.SystemRandom()
    count = rows * columns
    distractors = [symbol for symbol in symbols if symbol != target]
    cells = [target] * round(count * target_share)
    cells.extend(randomizer.choice(distractors) for _ in range(count - len(cells)))
    randomizer.shuffle(cells)
    return cells


def generate_statements(count: int, rng: random.Random | None = None) -> list[str]:
    return (rng or random.SystemRandom()).sample(STATEMENTS, count)


def generate_number_grid(
    count: int = 100, rng: random.Random | None = None, start: int = 1
) -> list[dict[str, int]]:
    randomizer = rng or random.SystemRandom()
    values = list(range(start, start + count))
    randomizer.shuffle(values)
    return [{"position": position, "value": value} for position, value in enumerate(values)]


def generate_memory_stimulus(
    grid_cells: int = 25,
    rng: random.Random | None = None,
    shapes: tuple[str, ...] = SHAPES,
    shape_count: int | None = None,
) -> dict[str, list[dict[str, Any]]]:
    randomizer = rng or random.SystemRandom()
    selected_shapes = list(shapes[: shape_count or len(shapes)])
    if not selected_shapes:
        raise ValueError("At least one shape is required")
    if len(selected_shapes) > grid_cells:
        raise ValueError("The grid must have at least as many cells as shapes")
    positions = randomizer.sample(range(grid_cells), len(selected_shapes))
    randomizer.shuffle(selected_shapes)
    return {
        "placements": [
            {"grid_position": position, "shape": shape}
            for position, shape in zip(positions, selected_shapes, strict=True)
        ]
    }


def generate_memory_rounds(
    round_count: int = 10,
    grid_cells: int = 25,
    rng: random.Random | None = None,
    shapes: tuple[str, ...] = SHAPES,
    shape_count: int | None = None,
) -> list[dict[str, list[dict[str, Any]]]]:
    randomizer = rng or random.SystemRandom()
    return [
        generate_memory_stimulus(grid_cells, randomizer, shapes, shape_count)
        for _ in range(round_count)
    ]
