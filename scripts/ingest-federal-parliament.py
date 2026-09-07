#!/usr/bin/env python3
"""Ingest every current federal parliamentarian into Political MAYHEM.

GitHub-hosted runners are blocked by aph.gov.au (HTTP 403), so the automated
acquisition path uses the coldix/elections structured mirror, whose membership
files explicitly identify Parliament of Australia as their primary source. A
small, explicit current-correction layer is then applied only where newer APH
pages have changed since that mirror's 2026-08-09 capture.

The pipeline validates the complete current federal headcount and party totals
before writing runtime state. It fails rather than publishing a partial roster.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "data" / "runtime"
TZ = ZoneInfo("Australia/Sydney")
UA = "Political-MAYHEM/1.0 (+https://mayhem82.github.io/The-Political-MAYHEM/)"

PRIMARY_APH = "https://www.aph.gov.au/Senators_and_Members/Contacting_Senators_and_Members/Address_labels_and_CSV_files"
MIRROR_HOUSE = "https://raw.githubusercontent.com/coldix/elections/main/data/federal-49/house-members.yaml"
MIRROR_SENATE = "https://raw.githubusercontent.com/coldix/elections/main/data/federal-49/senate-members.yaml"
MIRROR_PARTIES = "https://raw.githubusercontent.com/coldix/elections/main/data/federal-49/parties.yaml"

# Current APH party facets verified 2026-09-08. These totals are a hard gate.
EXPECTED_PARTY_COUNTS = {
    "labor": 124,
    "liberal": 38,
    "liberal-national": 18,
    "nationals": 11,
    "country-liberal": 1,
    "greens": 11,
    "one-nation": 6,
    "australias-voice": 1,
    "centre-alliance": 1,
    "jacqui-lambie-network": 1,
    "katters-australian": 1,
    "united-australia": 1,
    "independent": 12,
}
EXPECTED_TOTAL = 226
EXPECTED_HOUSE = 150
EXPECTED_SENATE = 76

PARTY_META = {
    "labor": ("AUS-FED-ALP", "Australian Labor Party", "Labor", "GOVERNMENT", "ACT-ANTHONY-ALBANESE"),
    "liberal": ("AUS-FED-LIB", "Liberal Party of Australia", "Liberal", "OPPOSITION_COALITION_PARTNER", "ACT-ANGUS-TAYLOR"),
    "liberal-national": ("AUS-FED-LNP", "Liberal National Party of Queensland", "LNP", "OPPOSITION_COALITION_PARTNER", None),
    "nationals": ("AUS-FED-NAT", "National Party of Australia", "Nationals", "OPPOSITION_COALITION_PARTNER", "ACT-MATT-CANAVAN"),
    "country-liberal": ("AUS-FED-CLP", "Country Liberal Party", "CLP", "OPPOSITION_COALITION_PARTNER", None),
    "greens": ("AUS-FED-GRN", "Australian Greens", "Greens", "CROSSBENCH_PARTY", "ACT-LARISSA-WATERS"),
    "one-nation": ("AUS-FED-ONP", "Pauline Hanson's One Nation", "One Nation", "CROSSBENCH_PARTY", "ACT-PAULINE-HANSON"),
    "australias-voice": ("AUS-FED-AV", "Australia's Voice", "Australia's Voice", "CROSSBENCH_PARTY", None),
    "centre-alliance": ("AUS-FED-CA", "Centre Alliance", "Centre Alliance", "CROSSBENCH_PARTY", None),
    "jacqui-lambie-network": ("AUS-FED-JLN", "Jacqui Lambie Network", "JLN", "CROSSBENCH_PARTY", "ACT-JACQUI-LAMBIE"),
    "katters-australian": ("AUS-FED-KAP", "Katter's Australian Party", "KAP", "CROSSBENCH_PARTY", "ACT-BOB-KATTER"),
    "united-australia": ("AUS-FED-UAP", "United Australia Party", "UAP", "CROSSBENCH_PARTY", "ACT-RALPH-BABET"),
}
PARTY_ORDER = list(PARTY_META)

STATE_NAME = {
    "act": "Australian Capital Territory", "nsw": "New South Wales", "nt": "Northern Territory",
    "qld": "Queensland", "sa": "South Australia", "tas": "Tasmania", "vic": "Victoria", "wa": "Western Australia",
}


def fetch_yaml(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/plain,*/*"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return yaml.safe_load(response.read().decode("utf-8"))


def actor_id(name: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")
    return f"ACT-{slug}"


def normalize_name(name: str) -> str:
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    aliases = {
        "Pauline Lee Hanson": "Pauline Hanson",
        "Malcolm Ieuan Roberts": "Malcolm Roberts",
        "Sean Fredrick Bell": "Sean Bell",
        "Larissa Joy Waters": "Larissa Waters",
        "Mehreen Saeed Faruqi": "Mehreen Faruqi",
        "Barbara Ann Pocock": "Barbara Pocock",
        "Sarah Coral Hanson-Young": "Sarah Hanson-Young",
        "David Willmer Pocock": "David Pocock",
        "Jacinta Nampijinpa Price": "Jacinta Nampijinpa Price",
        "Tammy Marie Tyrrell": "Tammy Tyrrell",
    }
    return aliases.get(name, name)


def current_corrections(players: list[dict]) -> list[dict]:
    """Apply only explicit changes supported by newer APH current pages."""
    out = []
    replaced_whish_wilson = False
    for p in players:
        name = normalize_name(p["name"])
        p = dict(p)
        p["name"] = name

        # Current APH profile: Country Liberal Party.
        if name == "Jacinta Nampijinpa Price":
            p["party"] = "country-liberal"
            p["correction_ref"] = "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=263528"

        # Current APH profile: Australian Labor Party from 14 May 2026.
        if name == "Tammy Tyrrell":
            p["party"] = "labor"
            p["correction_ref"] = "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=300639"

        # Current APH List of Senators as at 28 Aug 2026 contains Vanessa
        # Bleyer in the Tasmanian Greens place held by Peter Whish-Wilson in
        # the 9 Aug mirror snapshot.
        if name == "Peter Whish-Wilson":
            p["name"] = "Vanessa Bleyer"
            p["actor_id"] = actor_id("Vanessa Bleyer")
            p["party"] = "greens"
            p["state"] = "tas"
            p["chamber"] = "SENATE"
            p["division"] = None
            p["role"] = "Senator for Tasmania"
            p["correction_ref"] = "https://www.aph.gov.au/Senators_and_Members/Contacting_Senators_and_Members/List_of_Senators"
            replaced_whish_wilson = True

        out.append(p)

    if not replaced_whish_wilson and not any(p["name"] == "Vanessa Bleyer" for p in out):
        raise RuntimeError("Current correction could not resolve Vanessa Bleyer / Peter Whish-Wilson transition")
    return out


def house_players(doc) -> list[dict]:
    rows = doc.get("house_members") or []
    out = []
    for row in rows:
        name = normalize_name(row.get("name"))
        party = str(row.get("party") or "").strip()
        state = str(row.get("state") or "").strip().lower()
        division = str(row.get("division") or "").replace("-", " ").title()
        if not name or not party or not state or not division:
            raise RuntimeError(f"Incomplete House row: {row!r}")
        out.append({
            "actor_id": actor_id(name), "name": name, "party": party,
            "chamber": "HOUSE", "division": division, "state": state,
            "role": f"Member for {division}", "status": "ACTIVE",
            "source_ref": doc.get("source", {}).get("url", PRIMARY_APH),
        })
    return out


def senate_players(doc) -> list[dict]:
    rows = doc.get("senate_members") or []
    out = []
    for row in rows:
        name = normalize_name(row.get("name"))
        party = str(row.get("party") or "").strip()
        state = str(row.get("state") or "").strip().lower()
        if not name or not party or not state:
            raise RuntimeError(f"Incomplete Senate row: {row!r}")
        out.append({
            "actor_id": actor_id(name), "name": name, "party": party,
            "chamber": "SENATE", "division": None, "state": state,
            "role": f"Senator for {STATE_NAME.get(state, state.upper())}", "status": "ACTIVE",
            "term_status": row.get("term_status"), "end_term": row.get("end_term"),
            "source_ref": row.get("handbook_url") or doc.get("source", {}).get("url", "https://handbook.aph.gov.au/"),
        })
    return out


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate(players: list[dict]) -> Counter:
    if len(players) != EXPECTED_TOTAL:
        raise RuntimeError(f"Federal player total mismatch: expected {EXPECTED_TOTAL}, got {len(players)}")
    chamber = Counter(p["chamber"] for p in players)
    if chamber != Counter({"HOUSE": EXPECTED_HOUSE, "SENATE": EXPECTED_SENATE}):
        raise RuntimeError(f"Chamber counts mismatch: {dict(chamber)}")
    ids = [p["actor_id"] for p in players]
    if len(ids) != len(set(ids)):
        dupes = [k for k, v in Counter(ids).items() if v > 1]
        raise RuntimeError(f"Duplicate actor ids: {dupes}")
    party = Counter(p["party"] for p in players)
    if dict(party) != EXPECTED_PARTY_COUNTS:
        missing = {k: EXPECTED_PARTY_COUNTS.get(k, 0) - party.get(k, 0) for k in sorted(set(EXPECTED_PARTY_COUNTS) | set(party)) if EXPECTED_PARTY_COUNTS.get(k, 0) != party.get(k, 0)}
        raise RuntimeError(f"Party counts do not reconcile to current APH facets: got={dict(party)} deltas={missing}")
    unknown = sorted({p["party"] for p in players if p["party"] != "independent" and p["party"] not in PARTY_META})
    if unknown:
        raise RuntimeError(f"Unmapped parties: {unknown}")
    return party


def main() -> int:
    now = datetime.now(TZ).replace(microsecond=0)
    captured_at = now.isoformat()
    house_doc = fetch_yaml(MIRROR_HOUSE)
    senate_doc = fetch_yaml(MIRROR_SENATE)
    _ = fetch_yaml(MIRROR_PARTIES)  # availability/provenance check

    players = house_players(house_doc) + senate_players(senate_doc)
    players = current_corrections(players)
    party_counts = validate(players)

    for p in players:
        if p["party"] == "independent":
            p["party_id"] = None
        else:
            p["party_id"] = PARTY_META[p["party"]][0]
    players.sort(key=lambda p: ((p["party_id"] or "ZZZ-INDEPENDENT"), p["name"].lower()))

    by_party = defaultdict(list)
    independents = []
    for p in players:
        (independents if p["party"] == "independent" else by_party[p["party"]]).append(p)

    parties = []
    for slug in PARTY_ORDER:
        members = by_party.get(slug, [])
        if not members:
            continue
        pid, name, short, team_state, leader_id = PARTY_META[slug]
        member_ids = {p["actor_id"] for p in members}
        parties.append({
            "party_id": pid,
            "party_slug": slug,
            "name": name,
            "short_name": short,
            "team_state": team_state,
            "leader_actor_id": leader_id if leader_id in member_ids else None,
            "roster_scope": "CURRENT_FEDERAL_PARLIAMENTARY_TEAM_COMPLETE",
            "player_count": len(members),
            "house_players": sum(p["chamber"] == "HOUSE" for p in members),
            "senate_players": sum(p["chamber"] == "SENATE" for p in members),
            "actors": [{k: v for k, v in p.items() if k != "party"} for p in sorted(members, key=lambda p: p["name"].lower())],
            "source_refs": [PRIMARY_APH, MIRROR_HOUSE, MIRROR_SENATE],
        })

    stamp = now.strftime("%Y%m%d-%H%M%S")
    counts = {
        "total_players": len(players), "house": EXPECTED_HOUSE, "senate": EXPECTED_SENATE,
        "party_affiliated": len(players) - len(independents), "independents": len(independents),
        "teams": len(parties), "by_party": dict(sorted(party_counts.items())),
    }
    provenance = {
        "primary_authority": "Parliament of Australia",
        "primary_reference": PRIMARY_APH,
        "automated_acquisition": {
            "state": "PRIMARY_DERIVED_STRUCTURED_MIRROR_WITH_EXPLICIT_CURRENT_APH_CORRECTIONS",
            "reason": "aph.gov.au returns HTTP 403 to GitHub-hosted runners",
            "house_mirror": MIRROR_HOUSE, "senate_mirror": MIRROR_SENATE,
            "mirror_primary_capture_date": "2026-08-09",
        },
        "current_correction_refs": [
            "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=263528",
            "https://www.aph.gov.au/Senators_and_Members/Parliamentarian?MPID=300639",
            "https://www.aph.gov.au/Senators_and_Members/Contacting_Senators_and_Members/List_of_Senators",
        ],
        "validated_against_current_aph_party_facets": True,
    }

    player_index = {
        "snapshot_id": f"FEDERAL-PARLIAMENTARY-PLAYERS-{stamp}", "scope": "Australia — Federal Parliament",
        "captured_at": captured_at, "status": "COMPLETE_CURRENT_FEDERAL_PARLIAMENTARY_BASELINE",
        "counts": counts, "provenance": provenance,
        "rules": {
            "all_current_federal_parliamentarians_ingested": True,
            "party_affiliation_is_evidence_derived": True,
            "independents_are_standalone_players": True,
            "coalition_relationships_do_not_rewrite_party_affiliation": True,
            "no_player_is_hidden_by_partial_intelligence_roster": True,
        },
        "players": players,
    }
    rosters = {
        "snapshot_id": f"FEDERAL-PARTY-ROSTERS-{stamp}", "scope": "Australia — Federal",
        "captured_at": captured_at, "status": "COMPLETE_CURRENT_FEDERAL_PARLIAMENTARY_ROSTER",
        "counts": counts, "provenance": provenance,
        "rules": {
            "party_is_team": True, "actor_is_player": True,
            "coalition_is_relationship_not_single_party": True,
            "independents_are_standalone_actors": True,
            "every_current_party_affiliated_federal_parliamentarian_is_listed": True,
        },
        "parties": parties,
        "independent_actors": [{k: v for k, v in p.items() if k not in ("party", "party_id")} for p in independents],
    }
    depth = {
        "snapshot_id": f"FEDERAL-TEAM-SQUAD-DEPTH-{stamp}", "scope": "Australia — Federal Parliament",
        "captured_at": captured_at, "metric": "CURRENT_PARLIAMENTARY_PARTY_AFFILIATION_COUNT",
        "provenance": provenance,
        "rules": {
            "parliamentary_squad_is_not_whole_party": True,
            "all_current_federal_parliamentary_players_are_ingested": True,
            "organisational_officials_candidates_state_teams_and_affiliates_are_separate_layers": True,
            "affiliates_are_not_silently_folded_into_party_counts": True,
        },
        "teams": [{
            "party_id": p["party_id"], "team": p["short_name"],
            "federal_parliamentary_squad": p["player_count"],
            "house_players": p["house_players"], "senate_players": p["senate_players"],
            "ingested_players": p["player_count"],
            "coverage_state": "CURRENT_FEDERAL_PARLIAMENTARY_SQUAD_FULLY_INGESTED",
            "coverage_percent": 100,
        } for p in parties],
        "independent_players": len(independents),
    }

    existing_form = load_json(RUNTIME / "team-player-form.json", {})
    old_team = {x.get("party_id"): x for x in existing_form.get("team_form", []) if x.get("party_id")}
    team_form = []
    for p in parties:
        team_form.append(old_team.get(p["party_id"], {
            "party_id": p["party_id"], "form_state": "BASELINE_ESTABLISHING", "trend": "UNRESOLVED",
            "signals": [], "contradictions": [], "tip_effects": [], "last_material_change": None,
        }))
    player_form = [{
        "actor_id": p["actor_id"], "party_id": p["party_id"],
        "form_state": "BASELINE_ESTABLISHING", "trend": "UNRESOLVED",
        "signals": [], "contradictions": [], "tip_effects": [], "last_material_change": None,
    } for p in players]
    form = {
        "snapshot_id": f"TEAM-PLAYER-FORM-{stamp}", "scope": "Australia — Federal", "captured_at": captured_at,
        "status": "COMPLETE_CURRENT_FEDERAL_PLAYER_BASELINE", "rules": existing_form.get("rules", {
            "forward_only": True, "append_or_supersede_only": True, "unknown_is_not_neutral": True,
            "inference_is_not_observation": True, "form_requires_evidence": True, "tip_effect_requires_explicit_lineage": True,
        }),
        "team_form": team_form, "player_form": player_form,
        "form_dimensions": existing_form.get("form_dimensions", {
            "team": ["electoral_performance", "polling", "leadership_state", "internal_stability", "candidate_field", "issue_exposure", "funding_disclosures", "endorsements", "alliances", "institutional_position", "resource_allocation", "geographic_strength", "preference_relationships"],
            "player": ["role", "availability", "status", "statements", "observable_behaviour", "leadership_position", "endorsements", "disputes", "alliances", "withdrawal", "resignation", "eligibility", "influence"],
        }),
        "trend_values": existing_form.get("trend_values", ["RISING", "STEADY", "FALLING", "VOLATILE", "UNRESOLVED"]),
        "evidence_states": existing_form.get("evidence_states", ["VERIFIED", "UNVERIFIED", "CONTRADICTED", "SIGNAL", "UNKNOWN"]),
    }

    write_json(RUNTIME / "federal-parliamentary-players.json", player_index)
    write_json(RUNTIME / "party-rosters.json", rosters)
    write_json(RUNTIME / "team-squad-depth.json", depth)
    write_json(RUNTIME / "team-player-form.json", form)
    print(json.dumps({"status": "FEDERAL_PLAYER_INGESTION_COMPLETE", **counts}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FEDERAL_PLAYER_INGESTION_FAILED: {exc}", file=sys.stderr)
        raise
