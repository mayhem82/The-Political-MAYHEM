#!/usr/bin/env python3
"""Prepare current-name and party corrections for federal player ingestion.

The APH-derived mirror was captured before several current APH presentation
changes. This preparation patches only named, source-verified corrections into
the ingestion script before it runs. Every insertion is fail-loud.
"""
from pathlib import Path

path = Path(__file__).with_name("ingest-federal-parliament.py")
text = path.read_text(encoding="utf-8")

alias_anchor = '        "Tammy Marie Tyrrell": "Tammy Tyrrell",\n'
alias_lines = (
    alias_anchor
    + '        "Peter Stuart Whish-Wilson": "Peter Whish-Wilson",\n'
    + '        "James McGRATH": "James McGrath",\n'
    + '        "Susan Eileen McDONALD": "Susan McDonald",\n'
)
if '"Peter Stuart Whish-Wilson": "Peter Whish-Wilson"' not in text:
    if alias_anchor not in text:
        raise SystemExit("FEDERAL_INGEST_PREP_FAILED: alias insertion point missing")
    text = text.replace(alias_anchor, alias_lines, 1)

party_anchor = '''        if name == "Tammy Tyrrell":
            p["party"] = "labor"
            p["correction_ref"] = "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=300639"
'''
party_insert = party_anchor + '''
        # Current APH profiles list these Queensland senators directly as LNP.
        if name == "James McGrath":
            p["party"] = "liberal-national"
            p["correction_ref"] = "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=217241"

        if name == "Susan McDonald":
            p["party"] = "liberal-national"
            p["correction_ref"] = "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=123072"
'''
if 'if name == "James McGrath":' not in text:
    if party_anchor not in text:
        raise SystemExit("FEDERAL_INGEST_PREP_FAILED: party correction insertion point missing")
    text = text.replace(party_anchor, party_insert, 1)

path.write_text(text, encoding="utf-8")
print("FEDERAL_INGEST_PREP_OK")
