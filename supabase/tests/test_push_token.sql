BEGIN;

-- Create mock schema
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;

-- Test logic that validates the pg regex and function logic
DO $$
DECLARE
    v_regex text := '^ExponentPushToken\[[^\]]+\]$';
BEGIN
    -- Valid Tokens
    ASSERT 'ExponentPushToken[123]' ~ v_regex;
    ASSERT 'ExponentPushToken[abc]' ~ v_regex;
    ASSERT 'ExponentPushToken[xyz123]' ~ v_regex;

    -- Invalid Tokens
    ASSERT NOT 'ExponentPushToken[]' ~ v_regex;
    ASSERT NOT 'ExponentPushToken[abc]def' ~ v_regex;
    ASSERT NOT 'InvalidToken[123]' ~ v_regex;
    ASSERT NOT '' ~ v_regex;
END $$;

ROLLBACK;
