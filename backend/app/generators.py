import random
from typing import Any

SHAPES = ("circle", "triangle", "square", "cross", "rectangle")

# STATEMENTS = (
#     "Проверить уровень заряда",
#     "Записать время наблюдения",
#     "Сигнал связи стабилен",
#     "На экране видны облака",
#     "Отметить изменение освещения",
#     "Высота отображается справа",
#     "Ветер усилился к вечеру",
#     "Проверить журнал сообщений",
#     "Камера направлена вниз",
#     "Сохранить текущие настройки",
#     "Показания датчика обновились",
#     "Экран перешёл в тёмный режим",
#     "Батарея заряжена наполовину",
#     "Прибор показывает температуру",
#     "Запись видео остановлена",
#     "На карте отмечена река",
#     "Появилось уведомление системы",
#     "Проверить состояние камеры",
#     "Время сеанса истекает",
#     "Отображается новая схема",
#     "Показания датчика в норме",
#     "Сменить яркость монитора",
#     "В журнале появилась запись",
#     "Контрольный список заполнен",
# )

STATEMENTS = (
    "Батарея 28% - рекомендован возврат",
    "Слабый сигнал пульта: проверьте антенны",
    "Потеря GPS - переход в режим ATTI",
    "Ветер 8 м/с, порывы до 13 м/с",
    "Сработал датчик препятствия спереди",
    "Достигнут лимит высоты 120 м",
    "Начата запись видео 2K/30",
    "Карта памяти заполнена на 85%",
    "Домашняя точка обновлена",
    "Автовозврат через 10 секунд",
    "Потеря связи с камерой",
    "Температура батареи 47 °C",
    "Требуется калибровка компаса",
    "Вход в зону ограничения полётов",
    "Осталось 9 минут полёта",
    "Режим Sport активирован",
    "Точка маршрута 3 достигнута",
    "Сигнал видео нестабилен: 480p",
    "Мотор 3: повышенная вибрация",
    "RTH сработал по низкому заряду",
    "Обнаружено препятствие снизу",
    "Курс на домашнюю точку: 214°",
    "Высота 118 м, скорость 6 м/с",
    "Запись остановлена: память заполнена",
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


def to_roman(num: int) -> str:
    val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    syb = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"]
    roman_num = ""
    i = 0
    while num > 0:
        for _ in range(num // val[i]):
            roman_num += syb[i]
            num -= val[i]
        i += 1
    return roman_num


def generate_gorbov_schulte_grid(
    arabic_count: int = 25, roman_count: int = 24, rng: random.Random | None = None
) -> list[dict[str, Any]]:
    randomizer = rng or random.SystemRandom()
    cells = []
    for i in range(1, arabic_count + 1):
        cells.append({"type": "arabic", "value": i, "display": str(i)})
    for i in range(1, roman_count + 1):
        cells.append({"type": "roman", "value": i, "display": to_roman(i)})
    
    randomizer.shuffle(cells)
    return [{"position": idx, **cell} for idx, cell in enumerate(cells)]


def generate_motor_lines(
    lines_count: int, width: int, rng: random.Random | None = None
) -> list[dict[str, Any]]:
    randomizer = rng or random.SystemRandom()
    lines = []

    # Генерируем контрольные точки кубического сплайна Безье (от 0 до 100% ширины/высоты холста)
    for i in range(lines_count):
        lines.append({
            "line_id": i + 1,
            "width": width,
            "p0": {"x": 5, "y": randomizer.randint(10, 90)}, # Старт слева
            "p1": {"x": randomizer.randint(25, 45), "y": randomizer.randint(5, 95)},
            "p2": {"x": randomizer.randint(55, 75), "y": randomizer.randint(5, 95)},
            "p3": {"x": 95, "y": randomizer.randint(10, 90)}, # Конец справа
        })
    return lines