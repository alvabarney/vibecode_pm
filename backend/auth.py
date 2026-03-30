import os

SESSION_USER_KEY = "user"


def validate_credentials(username: str, password: str) -> bool:
    valid_username = os.getenv("PM_USERNAME")
    valid_password = os.getenv("PM_PASSWORD")
    if not valid_username or not valid_password:
        raise RuntimeError(
            "PM_USERNAME and PM_PASSWORD environment variables must be set."
        )
    return username == valid_username and password == valid_password


def get_authenticated_user(session: dict[str, object]) -> str | None:
    user = session.get(SESSION_USER_KEY)
    if isinstance(user, str) and user:
        return user
    return None
