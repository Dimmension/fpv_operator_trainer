import random
from typing import Any

SHAPES = ("circle", "triangle", "square", "cross", "rectangle")


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
