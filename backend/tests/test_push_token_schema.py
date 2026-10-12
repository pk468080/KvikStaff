import pytest
from app.modules.notifications.service import _EXPO_PUSH_TOKEN_PATTERN

def test_expo_push_token_regex_validation():
    # Valid tokens
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("ExponentPushToken[123]") is not None
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("ExponentPushToken[abc]") is not None
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("ExponentPushToken[xyz123]") is not None

    # Invalid tokens
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("ExponentPushToken[]") is None
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("ExponentPushToken[abc]def") is None
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("InvalidToken[123]") is None
    assert _EXPO_PUSH_TOKEN_PATTERN.fullmatch("") is None
