import pytest
from pydantic import ValidationError

from app.schemas import MemoryAnswerRequest

VALID_PLACEMENTS = [
    {"grid_position": 0, "shape": "circle"},
    {"grid_position": 1, "shape": "triangle"},
    {"grid_position": 2, "shape": "square"},
    {"grid_position": 3, "shape": "cross"},
    {"grid_position": 4, "shape": "rectangle"},
]


def test_memory_answer_accepts_each_shape_once() -> None:
    assert (
        len(MemoryAnswerRequest(placements=VALID_PLACEMENTS, response_time_ms=1200).placements) == 5
    )


@pytest.mark.parametrize(
    "placements",
    [
        [*VALID_PLACEMENTS[:-1], {"grid_position": 3, "shape": "rectangle"}],
        [*VALID_PLACEMENTS[:-1], {"grid_position": 4, "shape": "circle"}],
    ],
)
def test_memory_answer_rejects_duplicate_data(placements: list[dict]) -> None:
    with pytest.raises(ValidationError):
        MemoryAnswerRequest(placements=placements, response_time_ms=1200)
