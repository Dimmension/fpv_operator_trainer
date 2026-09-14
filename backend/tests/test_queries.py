from sqlalchemy.dialects import postgresql

from app.attempts import attempt_query


def test_locked_attempt_query_only_locks_attempt_row() -> None:
    query = attempt_query(attempt_id=1, operator_id=1, lock=True)

    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "FOR UPDATE OF attempts" in sql
