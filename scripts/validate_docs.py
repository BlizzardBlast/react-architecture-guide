#!/usr/bin/env python3
"""Compatibility entry point for the repository's tested Markdown validator."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.exit(subprocess.call(["node", str(ROOT / "tools" / "validate-docs.cjs")]))
