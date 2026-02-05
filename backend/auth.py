"""Telegram Mini App initData validation (HMAC-SHA256)."""

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, unquote

from config import BOT_TOKEN


def validate_init_data(init_data: str, bot_token: str = BOT_TOKEN) -> dict | None:
    """
    Validate Telegram WebApp initData string.
    Returns parsed user dict on success, None on failure.

    See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    try:
        parsed = parse_qs(init_data, keep_blank_values=True)
        # Each value is a list — take first element
        data = {k: v[0] for k, v in parsed.items()}
    except Exception:
        return None

    received_hash = data.pop("hash", None)
    if not received_hash:
        return None

    # Build check string: sorted key=value pairs separated by \n
    check_items = sorted(data.items())
    check_string = "\n".join(f"{k}={v}" for k, v in check_items)

    # HMAC key: HMAC-SHA256 of bot token with "WebAppData" as key
    secret_key = hmac.new(
        b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256
    ).digest()

    # Calculate hash
    calculated_hash = hmac.new(
        secret_key, check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        return None

    # Optionally check auth_date freshness (allow 24h)
    auth_date = data.get("auth_date")
    if auth_date:
        try:
            if time.time() - int(auth_date) > 86400:
                return None
        except ValueError:
            pass

    # Parse user JSON
    user_data = data.get("user")
    if user_data:
        try:
            user = json.loads(user_data)
        except json.JSONDecodeError:
            return None
    else:
        user = {}

    return {
        "user": user,
        "auth_date": data.get("auth_date"),
        "query_id": data.get("query_id"),
        "chat_type": data.get("chat_type"),
        "chat_instance": data.get("chat_instance"),
    }
