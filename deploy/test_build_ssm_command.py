from __future__ import annotations

import json
import os
import shlex
import subprocess
import tempfile
import unittest
from pathlib import Path

from build_ssm_command import build_run_shell_command, build_ssm_parameters


class BuildSsmCommandTests(unittest.TestCase):
    def test_parameters_execute_bash_from_a_file(self) -> None:
        parameters = build_ssm_parameters(b"printf 'deployed\\n'\n")

        self.assertEqual(json.loads(json.dumps(parameters)), parameters)
        self.assertEqual(len(parameters["commands"]), 1)
        self.assertNotIn("bash -s", parameters["commands"][0])
        self.assertIn('bash "$DEPLOY_SCRIPT"', parameters["commands"][0])

    @unittest.skipIf(os.name == "nt", "requires a POSIX shell")
    def test_stdin_reader_cannot_consume_following_deploy_commands(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            marker = Path(temp_dir) / "reached-after-stdin-reader"
            script = "\n".join(
                [
                    "set -euo pipefail",
                    "python3 -c 'import sys; sys.stdin.read()'",
                    f"printf 'reached\\n' > {shlex.quote(str(marker))}",
                ]
            )
            environment = os.environ.copy()
            environment["TMPDIR"] = temp_dir

            result = subprocess.run(
                ["/bin/sh", "-c", build_run_shell_command(script.encode("utf-8"))],
                input="child process input",
                text=True,
                capture_output=True,
                env=environment,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(marker.read_text(encoding="utf-8"), "reached\n")
            self.assertEqual(list(Path(temp_dir).glob("oauth-oidc-deploy.*")), [])

    @unittest.skipIf(os.name == "nt", "requires a POSIX shell")
    def test_remote_failure_is_returned_and_temp_file_is_removed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            environment = os.environ.copy()
            environment["TMPDIR"] = temp_dir

            result = subprocess.run(
                ["/bin/sh", "-c", build_run_shell_command(b"exit 23\n")],
                text=True,
                capture_output=True,
                env=environment,
                check=False,
            )

            self.assertEqual(result.returncode, 23, result.stderr)
            self.assertEqual(list(Path(temp_dir).glob("oauth-oidc-deploy.*")), [])


if __name__ == "__main__":
    unittest.main()
