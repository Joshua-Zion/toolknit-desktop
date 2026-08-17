from __future__ import annotations

import subprocess
import sys
import time
import zipfile
from pathlib import Path


def main() -> int:
    try:
        repo_root = Path(
            subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=True,
            ).stdout.strip()
        )
    except Exception as exc:  # pragma: no cover - defensive shell helper
        print(f"Failed to resolve git root: {exc}", file=sys.stderr)
        return 1

    backup_dir = repo_root / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    zip_path = backup_dir / f"toolknit-source-clean-{stamp}.zip"

    try:
        listed = subprocess.run(
            ["git", "-C", str(repo_root), "ls-files", "-co", "--exclude-standard", "-z"],
            capture_output=True,
            text=False,
            check=True,
        ).stdout
    except Exception as exc:  # pragma: no cover - defensive shell helper
        print(f"Failed to list source files: {exc}", file=sys.stderr)
        return 1

    files = [Path(p) for p in listed.decode("utf-8", errors="surrogateescape").split("\0") if p]
    written = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for rel_path in files:
            if rel_path.parts and rel_path.parts[0] in {"backups", "toolknit-output"}:
                continue
            abs_path = repo_root / rel_path
            if not abs_path.is_file():
                continue
            zf.write(abs_path, rel_path.as_posix())
            written += 1

    print(zip_path)
    print(written)
    print(zip_path.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
