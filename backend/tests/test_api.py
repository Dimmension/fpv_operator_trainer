from collections.abc import AsyncIterator
from datetime import datetime, timedelta

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
        "attention-endurance",
        "divided-attention",
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
    state = (await client.post("/api/v1/attempts", json={"module_code": "visual-memory"})).json()
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


@pytest.mark.asyncio
async def test_correction_tracks_order_errors_and_timeout(client: AsyncClient, monkeypatch) -> None:
    started = await client.post("/api/v1/attempts", json={"module_code": "attention-endurance"})
    assert started.status_code == 200
    state = started.json()
    assert len(state["task"]["cells"]) == 300
    target = state["task"]["target_symbol"]
    position = state["task"]["cells"].index(target)
    path = f"/api/v1/attempts/{state['id']}/correction/actions"
    marked = await client.post(
        path,
        json={
            "sequence_number": 1,
            "position": position,
            "selected": True,
        },
    )
    assert marked.status_code == 200
    assert marked.json()["metrics"]["correct_actions"] == 1
    assert marked.json()["task"]["cursor"] == position
    repeated = await client.post(
        path,
        json={
            "sequence_number": 1,
            "position": position,
            "selected": True,
        },
    )
    assert repeated.status_code == 200
    assert repeated.json()["metrics"]["correct_actions"] == 1
    backward = await client.post(
        path,
        json={
            "sequence_number": 2,
            "position": position,
            "selected": True,
        },
    )
    assert backward.status_code == 422

    started_at = datetime.fromisoformat(state["started_at"])
    monkeypatch.setattr("app.attempts.utc_now", lambda: started_at + timedelta(seconds=31))
    with_line = (await client.get(f"/api/v1/attempts/{state['id']}")).json()
    assert with_line["task"]["line_marks"] == [
        {"elapsed_ms": 30000, "position": position}
    ]
    monkeypatch.setattr(
        "app.attempts.utc_now", lambda: started_at + timedelta(minutes=5, seconds=1)
    )
    final = await client.get(f"/api/v1/attempts/{state['id']}")
    assert final.status_code == 200
    assert final.json()["status"] == "completed"
    assert final.json()["result"]["found"] == 1
    assert final.json()["result"]["missed"] == final.json()["result"]["targets"] - 1
    assert len(final.json()["result"]["interval_pace"]) == 10


@pytest.mark.asyncio
async def test_dual_task_presents_twelve_messages_and_scores_recall(
    client: AsyncClient, monkeypatch
) -> None:
    started = await client.post("/api/v1/attempts", json={"module_code": "divided-attention"})
    assert started.status_code == 200
    state = started.json()
    assert len(state["task"]["cells"]) == 600
    assert state["task"]["visible_statement_number"] == 1
    first_statement = state["task"]["visible_statement"]
    started_at = datetime.fromisoformat(state["started_at"])

    too_early = await client.post(
        f"/api/v1/attempts/{state['id']}/recall",
        json={"statements": [first_statement]},
    )
    assert too_early.status_code == 409
    monkeypatch.setattr("app.attempts.utc_now", lambda: started_at + timedelta(seconds=6))
    hidden = (await client.get(f"/api/v1/attempts/{state['id']}")).json()
    assert "visible_statement" not in hidden["task"]

    monkeypatch.setattr("app.attempts.utc_now", lambda: started_at + timedelta(seconds=121))
    recall_state = (await client.get(f"/api/v1/attempts/{state['id']}")).json()
    assert recall_state["status"] == "in_progress"
    assert recall_state["task"]["stage"] == "recall"
    assert "visible_statement" not in recall_state["task"]
    completed = await client.post(
        f"/api/v1/attempts/{state['id']}/recall",
        json={"statements": [first_statement, first_statement]},
    )
    assert completed.status_code == 200
    result = completed.json()["result"]
    assert completed.json()["status"] == "completed"
    assert result["statement_count"] == 12
    assert result["recalled"] == 1
    assert result["memory_score"] == 8.33
