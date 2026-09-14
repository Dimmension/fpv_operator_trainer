import random

from app.generators import SHAPES, generate_memory_rounds, generate_number_grid


def test_number_grid_contains_every_number_once() -> None:
    grid = generate_number_grid(rng=random.Random(42))

    assert len(grid) == 100
    assert {cell["value"] for cell in grid} == set(range(1, 101))
    assert [cell["position"] for cell in grid] == list(range(100))


def test_memory_rounds_use_unique_positions_and_each_shape() -> None:
    rounds = generate_memory_rounds(rng=random.Random(42))

    assert len(rounds) == 10
    for round_data in rounds:
        placements = round_data["placements"]
        assert len(placements) == 5
        assert {item["shape"] for item in placements} == set(SHAPES)
        assert len({item["grid_position"] for item in placements}) == 5


def test_generators_support_configurable_ranges_and_shape_counts() -> None:
    grid = generate_number_grid(count=25, start=10, rng=random.Random(42))
    rounds = generate_memory_rounds(
        round_count=1,
        grid_cells=9,
        shapes=SHAPES,
        shape_count=3,
        rng=random.Random(42),
    )

    assert {cell["value"] for cell in grid} == set(range(10, 35))
    assert len(rounds) == 1
    assert {item["shape"] for item in rounds[0]["placements"]} == set(SHAPES[:3])
