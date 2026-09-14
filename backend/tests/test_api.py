from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import get_session
from app.main import app
from app.models import Base
from app.seed import seed_database


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with factory() as session:
        await seed_database(session)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_modules_and_full_attention_attempt(client: AsyncClient) -> None:
    modules = await client.get("/api/v1/modules")
    assert modules.status_code == 200
    assert [item["code"] for item in modules.json()] == [
        "sequential-search",
        "visual-memory",
    ]

    started = await client.post("/api/v1/attempts", json={"module_code": "sequential-search"})
    assert started.status_code == 200
    state = started.json()
    cells = {cell["value"]: cell["position"] for cell in state["task"]["cells"]}

    first_action = await client.post(
        f"/api/v1/attempts/{state['id']}/actions",
        json={
            "sequence_number": 1,
            "selected_number": 1,
            "grid_position": cells[1],
            "elapsed_ms": 10,
            "reaction_time_ms": 10,
        },
    )
    assert first_action.status_code == 200
    module_progress = (await client.get("/api/v1/modules")).json()[0]
    assert module_progress["active_attempt_id"] == state["id"]
    assert module_progress["active_progress"] == 1
    assert module_progress["active_progress_total"] == 25

    for number in range(2, 26):
        response = await client.post(
            f"/api/v1/attempts/{state['id']}/actions",
            json={
                "sequence_number": number,
                "selected_number": number,
                "grid_position": cells[number],
                "elapsed_ms": number * 10,
                "reaction_time_ms": 10,
            },
        )
        assert response.status_code == 200
        state = response.json()

    assert state["status"] == "completed"
    assert state["finish_reason"] == "completed"
    assert state["metrics"]["items_found"] == 25
    assert state["metrics"]["accuracy"] == 100
    assert state["result"]["attention_grade"]["grade"] == "medium"


@pytest.mark.asyncio
async def test_full_memory_attempt_and_history(client: AsyncClient) -> None:
    started = await client.post("/api/v1/attempts", json={"module_code": "visual-memory"})
    assert started.status_code == 200
    state = started.json()
    assert state["current_round"]["exposure_ms"] == 3000

    for round_number in range(1, 2):
        current = state["current_round"]
        assert current["round_number"] == round_number
        response = await client.post(
            f"/api/v1/attempts/{state['id']}/rounds/{round_number}/answer",
            json={
                "placements": current["stimulus"]["placements"],
                "response_time_ms": 1500,
            },
        )
        assert response.status_code == 200
        state = response.json()

    assert state["status"] == "completed"
    assert state["metrics"]["accuracy"] == 100
    assert state["result"]["exact_matches"] == 5
    assert state["result"]["position_matches"] == 5

    history = await client.get("/api/v1/attempts")
    assert history.status_code == 200
    assert history.json()[0]["module_code"] == "visual-memory"


@pytest.mark.asyncio
async def test_memory_attempt_rejects_an_incomplete_configured_answer(client: AsyncClient) -> None:
    state = (
        await client.post("/api/v1/attempts", json={"module_code": "visual-memory"})
    ).json()
    placements = state["current_round"]["stimulus"]["placements"][:-1]

    response = await client.post(
        f"/api/v1/attempts/{state['id']}/rounds/1/answer",
        json={"placements": placements, "response_time_ms": 1500},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_finishing_an_incomplete_attempt_allows_a_fresh_start(client: AsyncClient) -> None:
    started = (
        await client.post("/api/v1/attempts", json={"module_code": "sequential-search"})
    ).json()
    finished = await client.post(f"/api/v1/attempts/{started['id']}/finish")

    assert finished.status_code == 200
    assert finished.json()["status"] == "interrupted"
    assert (await client.get("/api/v1/modules")).json()[0]["active_attempt_id"] is None

    restarted = (
        await client.post("/api/v1/attempts", json={"module_code": "sequential-search"})
    ).json()
    assert restarted["id"] != started["id"]
    assert restarted["metrics"]["items_found"] == 0
