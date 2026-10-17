#!/usr/bin/env python3
"""Validate source migration filenames against the recorded production history."""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "supabase" / "migrations"
MANIFEST = (
    ROOT / "supabase" / "tests" / "fixtures"
    / "production_migration_history.txt"
)

MIGRATION_PATTERN = re.compile(r"^(?P<version>[0-9]{14})_(?P<name>.+)\.sql$")


def main() -> int:
    errors: list[str] = []

    if not MIGRATIONS_DIR.is_dir():
        print(f"ERROR: migration directory not found: {MIGRATIONS_DIR}")
        return 1

    if not MANIFEST.is_file():
        print(f"ERROR: production history manifest not found: {MANIFEST}")
        return 1

    # Read and validate the production history manifest.
    manifest_entries: list[tuple[str, str]] = []

    for line_number, raw_line in enumerate(
        MANIFEST.read_text(encoding="utf-8").splitlines(), start=1
    ):
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        parts = line.split(maxsplit=1)

        if len(parts) != 2 or not re.fullmatch(r"[0-9]{14}", parts[0]):
            errors.append(
                f"Manifest line {line_number} is invalid: {raw_line!r}"
            )
            continue

        manifest_entries.append((parts[0], parts[1]))

    if not manifest_entries:
        errors.append("Production history manifest contains no entries.")
        print_errors(errors)
        return 1

    manifest_versions: dict[str, str] = {}

    for version, name in manifest_entries:
        if version in manifest_versions:
            errors.append(
                f"Duplicate production version in manifest: {version}"
            )
        else:
            manifest_versions[version] = name

    sorted_versions = sorted(version for version, _ in manifest_entries)
    if [version for version, _ in manifest_entries] != sorted_versions:
        errors.append(
            "Manifest entries must be sorted by migration version."
        )

    # Read and validate migration source files.
    source_by_version: dict[str, list[tuple[str, Path]]] = defaultdict(list)
    sql_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    for path in sql_files:
        match = MIGRATION_PATTERN.fullmatch(path.name)

        if not match:
            errors.append(
                f"Unversioned or invalid migration filename: {path.name}"
            )
            continue

        source_by_version[match.group("version")].append(
            (match.group("name"), path)
        )

    for version, files in source_by_version.items():
        if len(files) > 1:
            names = ", ".join(path.name for _, path in files)
            errors.append(
                f"Duplicate source migration version {version}: {names}"
            )

    # Every recorded production migration must have its exact source file.
    for version, expected_name in manifest_versions.items():
        files = source_by_version.get(version, [])

        if not files:
            errors.append(
                f"Production migration is missing from source: "
                f"{version}_{expected_name}.sql"
            )
            continue

        actual_name, _ = files[0]
        if actual_name != expected_name:
            errors.append(
                f"Migration name drift for version {version}: "
                f"production={expected_name!r}, source={actual_name!r}"
            )

    # Do not allow an unrecorded migration at or before the production
    # checkpoint. New migrations after that checkpoint may be pending deploy.
    latest_production_version = max(manifest_versions)

    for version, files in sorted(source_by_version.items()):
        if version <= latest_production_version and version not in manifest_versions:
            for _, path in files:
                errors.append(
                    f"Unrecorded historical migration at/before production "
                    f"checkpoint: {path.name}"
                )

    if errors:
        print_errors(errors)
        return 1

    pending = sorted(
        version
        for version in source_by_version
        if version > latest_production_version
    )

    print("PASS: source migration history matches the production manifest.")
    print(f"Production history entries checked: {len(manifest_versions)}")
    print(f"Timestamped source migrations: {len(source_by_version)}")
    print(f"Latest recorded production version: {latest_production_version}")
    print(f"Newer migrations pending deployment: {len(pending)}")

    for version in pending:
        _, path = source_by_version[version][0]
        print(f"  PENDING: {path.name}")

    return 0


def print_errors(errors: list[str]) -> None:
    print("FAIL: migration-history consistency check failed.")
    for error in errors:
        print(f"  - {error}")


if __name__ == "__main__":
    sys.exit(main())