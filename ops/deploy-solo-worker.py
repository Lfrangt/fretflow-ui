"""Stage the audited Solo release; --apply updates an idle, supervised worker.

Run from the existing worker checkout. Credentials, jobs, tunnel, and supervisor
are preserved. Previous Python files remain in .runtime/solo-release-39331cc.
"""
from pathlib import Path
import ast
import hashlib
import os
import signal
import subprocess
import sys
import urllib.request

REVISION = "39331cca9eb25ce9703c63b7d9e63026f6849efc"
FILES = {
    "app.py": ("2f9b915101f51d2e228280f2234221099aad9121fa841236657362a8798210b7", "7dc30e5f19fdf2456e532a7ea978c4779651ddb77214bc10b9caa43217fdd573"),
    "analysis.py": ("8791131353f12cdea74105c1e10eeb68ad1f247253b50019ce26ba27db1b21ca", "1de39c31b8204ab74a307f67f9ed0f07ed6182ec6c3c5c6637bb4792a8bcbc62"),
    "solo.py": (None, "1dfbcf266c2f72e3d089e7b30c71240e98cab7474d34c15aefae88fb82666e3a"),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def main():
    if sys.argv[1:] not in ([], ["--apply"]):
        raise SystemExit("Usage: python3 deploy-solo-worker.py [--apply]")
    root = Path.cwd().resolve()
    assert (root / "scripts/run-cloud.sh").is_file(), "Not a worker checkout"
    stage = root / ".runtime/solo-release-39331cc"
    stage.mkdir(exist_ok=True)
    for name, (previous, expected) in FILES.items():
        current = root / "backend" / name
        assert digest(current) == previous, "Worker base changed: " + name
        data = urllib.request.urlopen(
            f"https://raw.githubusercontent.com/Lfrangt/fretflow-ui/{REVISION}/backend/{name}", timeout=30
        ).read()
        assert hashlib.sha256(data).hexdigest() == expected, "Download hash mismatch"
        ast.parse(data)
        (stage / name).write_bytes(data)
        if previous:
            (stage / (name + ".previous")).write_bytes(current.read_bytes())
    print("Solo source staged and hashes verified.", flush=True)
    if "--apply" not in sys.argv:
        return
    candidates = subprocess.check_output(["pgrep", "-f", "uvicorn backend.app:app"], text=True).split()
    workers = []
    for value in candidates:
        proc = Path("/proc") / value
        if (proc / "cwd").resolve() == root:
            command = (proc / "cmdline").read_bytes().split(b"\0")
            if b"8771" in command:
                workers.append(proc)
    assert len(workers) == 1, "Expected one worker on port 8771"
    proc = workers[0]
    parent = next(line.split()[1] for line in (proc / "status").read_text().splitlines() if line.startswith("PPid:"))
    assert b"scripts/run-cloud.sh" in (Path("/proc") / parent / "cmdline").read_bytes(), "Supervisor not found"
    environment = dict(item.split(b"=", 1) for item in (proc / "environ").read_bytes().split(b"\0") if b"=" in item)
    runtime = Path(os.fsdecode(environment.get(b"FRETFLOW_RUNTIME", os.fsencode(root / ".runtime/jobs"))))
    assert runtime.is_dir(), "Job directory missing"
    assert not list(runtime.glob("*/pending.json")), "Worker has pending jobs; try again when idle"
    for name, (previous, expected) in FILES.items():
        assert digest(root / "backend" / name) == previous, "Worker changed during staging"
        assert digest(stage / name) == expected
    for name in FILES:
        target = root / "backend" / name
        temporary = target.with_suffix(".py.solo-new")
        temporary.write_bytes((stage / name).read_bytes())
        temporary.replace(target)
    os.kill(int(proc.name), signal.SIGTERM)
    print("Solo installed. Existing supervisor will restart the worker; verify public health and a real job.", flush=True)


if __name__ == "__main__":
    main()
