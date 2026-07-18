from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path


def build_run_shell_command(script: bytes) -> str:
    encoded_script = base64.b64encode(script).decode("ascii")
    return "\n".join(
        [
            "set -eu",
            'DEPLOY_SCRIPT="$(mktemp "${TMPDIR:-/tmp}/oauth-oidc-deploy.XXXXXX")"',
            "trap 'rm -f \"$DEPLOY_SCRIPT\"' EXIT",
            f"printf '%s' '{encoded_script}' | base64 -d > \"$DEPLOY_SCRIPT\"",
            'chmod 700 "$DEPLOY_SCRIPT"',
            'bash "$DEPLOY_SCRIPT"',
        ]
    )


def build_ssm_parameters(script: bytes) -> dict[str, list[str]]:
    return {"commands": [build_run_shell_command(script)]}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build AWS-RunShellScript parameters without feeding Bash via stdin."
    )
    parser.add_argument("script", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    parameters = build_ssm_parameters(args.script.read_bytes())
    args.output.write_text(json.dumps(parameters), encoding="utf-8")


if __name__ == "__main__":
    main()
