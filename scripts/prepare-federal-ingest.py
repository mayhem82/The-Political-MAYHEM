#!/usr/bin/env python3
"""Prepare the federal ingestion script for the current APH Senate transition.

The structured APH-derived mirror carries Peter Stuart Whish-Wilson's full
middle-name form. The ingestion correction layer keys on the public short form.
This preparation is intentionally narrow and fails if the expected source line
cannot be found, so it cannot silently modify unrelated logic.
"""
from pathlib import Path

path = Path(__file__).with_name("ingest-federal-parliament.py")
text = path.read_text(encoding="utf-8")
needle = '        "Tammy Marie Tyrrell": "Tammy Tyrrell",\n'
insert = needle + '        "Peter Stuart Whish-Wilson": "Peter Whish-Wilson",\n'
if '"Peter Stuart Whish-Wilson": "Peter Whish-Wilson"' not in text:
    if needle not in text:
        raise SystemExit("FEDERAL_INGEST_PREP_FAILED: normalization insertion point missing")
    path.write_text(text.replace(needle, insert, 1), encoding="utf-8")
print("FEDERAL_INGEST_PREP_OK")
