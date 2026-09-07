#!/usr/bin/env python3
"""Ingest every current federal parliamentarian into Political MAYHEM team/player runtime.

Primary source: Parliament of Australia contact CSV files linked from the official
Address labels and CSV files page. Party-affiliated parliamentarians are grouped
into their actual parliamentary party team. Independents remain standalone players.

The script is deliberately fail-loud on incomplete source capture. It never invents
missing people, parties, seats or states.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "data" / "runtime"
SOURCE_PAGE = "https://www.aph.gov.au/Senators_and_Members/Contacting_Senators_and_Members/Address_labels_and_CSV_files"
USER_AGENT = "Political-MAYHEM/1.0 (+https://mayhem82.github.io/The-Political-MAYHEM/)"
SYDNEY = timezone(timedelta(hours=10))

PARTIES = {
    "Australian Labor Party": {"party_id": "AUS-FED-ALP", "short_name": "Labor", "team_state": "GOVERNMENT", "leader_actor_id": "ACT-ANTHONY-ALBANESE"},
    "Liberal Party of Australia": {"party_id": "AUS-FED-LIB", "short_name": "Liberal", "team_state": "OPPOSITION_COALITION_PARTNER", "leader_actor_id": "ACT-ANGUS-TAYLOR"},
    "Liberal National Party of Queensland": {"party_id": "AUS-FED-LNP", "short_name": "LNP", "team_state": "OPPOSITION_COALITION_PARTNER", "leader_actor_id": None},
    "The Nationals": {"party_id": "AUS-FED-NAT", "short_name": "Nationals", "team_state": "OPPOSITION_COALITION_PARTNER", "leader_actor_id": "ACT-MATT-CANAVAN"},
    "National Party of Australia": {"party_id": "AUS-FED-NAT", "short_name": "Nationals", "team_state": "OPPOSITION_COALITION_PARTNER", "leader_actor_id": "ACT-MATT-CANAVAN"},
    "Country Liberal Party": {"party_id": "AUS-FED-CLP", "short_name": "CLP", "team_state": "OPPOSITION_COALITION_PARTNER", "leader_actor_id": None},
    "Australian Greens": {"party_id": "AUS-FED-GRN", "short_name": "Greens", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": "ACT-LARISSA-WATERS"},
    "One Nation": {"party_id": "AUS-FED-ONP", "short_name": "One Nation", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": "ACT-PAULINE-HANSON"},
    "Pauline Hanson's One Nation": {"party_id": "AUS-FED-ONP", "short_name": "One Nation", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": "ACT-PAULINE-HANSON"},
    "Australia's Voice": {"party_id": "AUS-FED-AV", "short_name": "Australia's Voice", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": None},
    "Centre Alliance": {"party_id": "AUS-FED-CA", "short_name": "Centre Alliance", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": None},
    "Jacqui Lambie Network": {"party_id": "AUS-FED-JLN", "short_name": "JLN", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": "ACT-JACQUI-LAMBIE"},
    "Katter's Australian Party": {"party_id": "AUS-FED-KAP", "short_name": "KAP", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": "ACT-BOB-KATTER"},
    "United Australia Party": {"party_id": "AUS-FED-UAP", "short_name": "UAP", "team_state": "CROSSBENCH_PARTY", "leader_actor_id": None},
}

PARTY_ORDER = [
    "AUS-FED-ALP", "AUS-FED-LIB", "AUS-FED-LNP", "AUS-FED-NAT", "AUS-FED-CLP",
    "AUS-FED-GRN", "AUS-FED-ONP", "AUS-FED-AV", "AUS-FED-CA", "AUS-FED-JLN",
    "AUS-FED-KAP", "AUS-FED-UAP",
]

STATE_NAMES = {
    "ACT": "Australian Capital Territory", "NSW": "New South Wales", "NT": "Northern Territory",
    "QLD": "Queensland", "SA": "South Australia", "TAS": "Tasmania", "VIC": "Victoria", "WA": "Western Australia",
}


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._text).split())))
            self._href = None
            self._text = []


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,text/csv,*/*"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read()


def decode_text(raw: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            pass
    raise RuntimeError("Unable to decode source text")


def discover_csv_urls() -> dict[str, str]:
    html = decode_text(fetch_bytes(SOURCE_PAGE))
    parser = LinkCollector()
    parser.feed(html)
    candidates = [(urljoin(SOURCE_PAGE, href), text) for href, text in parser.links if href and ".csv" in href.lower()]

    def select(kind: str) -> str:
        kind_l = kind.lower()
        exact = []
        broad = []
        for url, text in candidates:
            tl = text.lower()
            if kind_l in tl and "party" in tl:
                broad.append((url, text))
                if "all" in tl:
                    exact.append((url, text))
        matches = exact or broad
        if not matches:
            raise RuntimeError(f"Could not discover official {kind} by-party CSV link; CSV anchors were: {candidates}")
        return matches[0][0]

    return {"senate": select("senator"), "house": select("member")}


def norm_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def get_field(row: dict[str, str], candidates: tuple[str, ...], contains: tuple[str, ...] = ()) -> str:
    keyed = {norm_key(k): (v or "").strip() for k, v in row.items() if k is not None}
    for c in candidates:
        v = keyed.get(norm_key(c), "")
        if v:
            return v
    for k, v in keyed.items():
        if v and any(norm_key(piece) in k for piece in contains):
            return v
    return ""


def clean_name(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    value = re.sub(r"^(Senator|Hon|The Hon|Dr|Mr|Ms|Mrs|Professor|Prof)\s+", "", value, flags=re.I)
    value = re.sub(r"\s+(MP|OAM|AO|AC|CSC|AM)\.?$", "", value, flags=re.I)
    return value.strip(" ,")


def actor_id(name: str) -> str:
    slug = re.sub(r"[^A-Z0-9]+", "-", name.upper()).strip("-")
    return f"ACT-{slug}"


def normalize_party(raw: str) -> str:
    s = re.sub(r"\s+", " ", raw or "").strip()
    aliases = {
        "Australian Labor Party (ALP)": "Australian Labor Party",
        "Liberal Party": "Liberal Party of Australia",
        "LNP": "Liberal National Party of Queensland",
        "National Party": "The Nationals",
        "Nationals": "The Nationals",
        "Pauline Hanson’s One Nation": "One Nation",
        "Pauline Hanson's One Nation": "One Nation",
        "Independent": "Independent",
        "IND": "Independent",
    }
    return aliases.get(s, s)


def parse_csv(url: str, chamber: str) -> list[dict]:
    text = decode_text(fetch_bytes(url))
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise RuntimeError(f"No CSV header in {url}")
    players: list[dict] = []

    for row_number, row in enumerate(reader, start=2):
        party_raw = get_field(row, ("Party", "Political Party", "Party Name"), ("party",))
        party = normalize_party(party_raw)

        full_name = get_field(row, ("Full Name", "Name", "Parliamentarian", "Senator Name", "Member Name"), ("fullname", "membername", "senatorname"))
        if not full_name:
            given = get_field(row, ("Preferred Name", "Given Name", "First Name", "FirstName"), ("preferredname", "givenname", "firstname"))
            family = get_field(row, ("Surname", "Family Name", "Last Name", "LastName"), ("surname", "familyname", "lastname"))
            full_name = " ".join(p for p in (given, family) if p)
        name = clean_name(full_name)

        state_raw = get_field(row, ("State", "State/Territory", "State or Territory"), ("state", "territory"))
        state = state_raw.upper().strip() if len(state_raw.strip()) <= 3 else next((k for k, v in STATE_NAMES.items() if v.lower() == state_raw.strip().lower()), state_raw.strip())
        division = ""
        if chamber == "HOUSE":
            division = get_field(row, ("Electorate", "Division", "Electoral Division"), ("electorate", "division"))

        if not name or not party:
            raise RuntimeError(f"Missing name or party at {chamber} CSV row {row_number}. Headers={reader.fieldnames!r}, row={row!r}")

        party_meta = PARTIES.get(party)
        if party != "Independent" and not party_meta:
            raise RuntimeError(f"Unmapped parliamentary party {party!r} at {chamber} row {row_number}; explicit mapping required")

        role = f"Member for {division}" if chamber == "HOUSE" and division else (f"Senator for {STATE_NAMES.get(state, state)}" if chamber == "SENATE" else chamber.title())
        players.append({
            "actor_id": actor_id(name),
            "name": name,
            "party": party,
            "party_id": None if party == "Independent" else party_meta["party_id"],
            "chamber": chamber,
            "division": division or None,
            "state": state or None,
            "role": role,
            "status": "ACTIVE",
            "source_row": row_number,
        })

    return players


def dedupe(players: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for p in players:
        key = p["actor_id"]
        if key in seen:
            raise RuntimeError(f"Duplicate actor id {key}: {seen[key]} vs {p}")
        seen[key] = p
    return list(seen.values())


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def dump_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    captured_at = datetime.now(SYDNEY).replace(microsecond=0).isoformat()
    csv_urls = discover_csv_urls()
    senate = parse_csv(csv_urls["senate"], "SENATE")
    house = parse_csv(csv_urls["house"], "HOUSE")
    players = dedupe(house + senate)

    # Fail loud on obviously partial downloads; legitimate vacancies still remain representable.
    if len(house) < 140 or len(senate) < 70:
        raise RuntimeError(f"Source capture looks incomplete: House={len(house)}, Senate={len(senate)}")

    teams: dict[str, list[dict]] = defaultdict(list)
    independents: list[dict] = []
    for p in players:
        if p["party_id"] is None:
            independents.append(p)
        else:
            teams[p["party_id"]].append(p)

    # Build unique party metadata by stable party id.
    meta_by_id: dict[str, dict] = {}
    canonical_name_by_id: dict[str, str] = {}
    for source_name, meta in PARTIES.items():
        pid = meta["party_id"]
        if pid not in meta_by_id:
            meta_by_id[pid] = meta
            canonical_name_by_id[pid] = source_name
    canonical_name_by_id.update({
        "AUS-FED-ONP": "Pauline Hanson's One Nation",
        "AUS-FED-NAT": "The Nationals",
    })

    party_records = []
    for pid in PARTY_ORDER:
        members = sorted(teams.get(pid, []), key=lambda x: x["name"].lower())
        if not members:
            continue
        meta = meta_by_id[pid]
        party_records.append({
            "party_id": pid,
            "name": canonical_name_by_id[pid],
            "short_name": meta["short_name"],
            "team_state": meta["team_state"],
            "leader_actor_id": meta["leader_actor_id"] if meta["leader_actor_id"] in {x["actor_id"] for x in members} else None,
            "roster_scope": "CURRENT_FEDERAL_PARLIAMENTARY_TEAM_COMPLETE",
            "player_count": len(members),
            "actors": [{k: v for k, v in m.items() if k not in ("party", "party_id", "source_row")} for m in members],
            "source_refs": [SOURCE_PAGE, csv_urls["house"], csv_urls["senate"]],
        })

    players_sorted = sorted(players, key=lambda x: ((x["party_id"] or "ZZZ-INDEPENDENT"), x["name"].lower()))
    player_index = {
        "snapshot_id": f"FEDERAL-PARLIAMENTARY-PLAYERS-{datetime.now(SYDNEY).strftime('%Y%m%d-%H%M%S')}",
        "scope": "Australia — Federal Parliament",
        "captured_at": captured_at,
        "status": "CURRENT_PARLIAMENTARY_BASELINE",
        "source": {
            "publisher": "Parliament of Australia",
            "index_url": SOURCE_PAGE,
            "house_csv": csv_urls["house"],
            "senate_csv": csv_urls["senate"],
        },
        "counts": {
            "total_players": len(players_sorted),
            "house": len(house),
            "senate": len(senate),
            "party_affiliated": len(players_sorted) - len(independents),
            "independents": len(independents),
            "teams": len(party_records),
        },
        "rules": {
            "all_current_federal_parliamentarians_ingested": True,
            "party_affiliation_is_source_derived": True,
            "independents_are_standalone_players": True,
            "coalition_relationships_do_not_rewrite_party_affiliation": True,
            "no_player_is_hidden_by_partial_intelligence_roster": True,
        },
        "players": players_sorted,
    }

    rosters = {
        "snapshot_id": f"FEDERAL-PARTY-ROSTERS-{datetime.now(SYDNEY).strftime('%Y%m%d-%H%M%S')}",
        "scope": "Australia — Federal",
        "captured_at": captured_at,
        "status": "COMPLETE_CURRENT_FEDERAL_PARLIAMENTARY_ROSTER",
        "rules": {
            "party_is_team": True,
            "actor_is_player": True,
            "coalition_is_relationship_not_single_party": True,
            "independents_are_standalone_actors": True,
            "rosters_are_append_or_supersede_not_hindsight_rewrite": True,
            "every_current_party_affiliated_federal_parliamentarian_is_listed": True,
        },
        "counts": player_index["counts"],
        "parties": party_records,
        "independent_actors": [{k: v for k, v in m.items() if k not in ("party", "party_id", "source_row")} for m in sorted(independents, key=lambda x: x["name"].lower())],
    }

    depth = {
        "snapshot_id": f"FEDERAL-TEAM-SQUAD-DEPTH-{datetime.now(SYDNEY).strftime('%Y%m%d-%H%M%S')}",
        "scope": "Australia — Federal Parliament",
        "captured_at": captured_at,
        "metric": "CURRENT_PARLIAMENTARY_PARTY_AFFILIATION_COUNT",
        "source": player_index["source"],
        "rules": {
            "parliamentary_squad_is_not_whole_party": True,
            "all_current_federal_parliamentary_players_are_now_ingested": True,
            "organisational_officials_candidates_state_teams_and_affiliates_are_separate_layers": True,
            "affiliates_are_not_silently_folded_into_party_counts": True,
        },
        "teams": [
            {
                "party_id": p["party_id"],
                "team": p["short_name"],
                "federal_parliamentary_squad": p["player_count"],
                "tracked_intelligence_players": p["player_count"],
                "coverage_state": "CURRENT_FEDERAL_PARLIAMENTARY_SQUAD_FULLY_INGESTED",
                "coverage_percent": 100,
                "related_affiliates": [],
            }
            for p in party_records
        ],
        "independent_players": len(independents),
    }

    existing_form = load_json(RUNTIME / "team-player-form.json", {})
    existing_team_form = {x.get("party_id"): x for x in existing_form.get("team_form", []) if x.get("party_id")}
    team_form = []
    for p in party_records:
        team_form.append(existing_team_form.get(p["party_id"], {
            "party_id": p["party_id"],
            "form_state": "BASELINE_ESTABLISHING",
            "trend": "UNRESOLVED",
            "signals": [],
            "contradictions": [],
            "tip_effects": [],
            "last_material_change": None,
        }))
    player_form = [
        {
            "actor_id": p["actor_id"],
            "party_id": p["party_id"],
            "form_state": "BASELINE_ESTABLISHING",
            "trend": "UNRESOLVED",
            "signals": [],
            "contradictions": [],
            "tip_effects": [],
            "last_material_change": None,
        }
        for p in players_sorted
    ]
    form = {
        "snapshot_id": f"TEAM-PLAYER-FORM-{datetime.now(SYDNEY).strftime('%Y%m%d-%H%M%S')}",
        "scope": "Australia — Federal",
        "captured_at": captured_at,
        "status": "COMPLETE_CURRENT_FEDERAL_PLAYER_BASELINE",
        "rules": existing_form.get("rules", {
            "forward_only": True,
            "append_or_supersede_only": True,
            "unknown_is_not_neutral": True,
            "inference_is_not_observation": True,
            "form_requires_evidence": True,
            "tip_effect_requires_explicit_lineage": True,
        }),
        "team_form": team_form,
        "player_form": player_form,
        "form_dimensions": existing_form.get("form_dimensions", {
            "team": ["electoral_performance", "polling", "leadership_state", "internal_stability", "candidate_field", "issue_exposure", "funding_disclosures", "endorsements", "alliances", "institutional_position", "resource_allocation", "geographic_strength", "preference_relationships"],
            "player": ["role", "availability", "status", "statements", "observable_behaviour", "leadership_position", "endorsements", "disputes", "alliances", "withdrawal", "resignation", "eligibility", "influence"],
        }),
        "trend_values": existing_form.get("trend_values", ["RISING", "STEADY", "FALLING", "VOLATILE", "UNRESOLVED"]),
        "evidence_states": existing_form.get("evidence_states", ["VERIFIED", "UNVERIFIED", "CONTRADICTED", "SIGNAL", "UNKNOWN"]),
    }

    dump_json(RUNTIME / "federal-parliamentary-players.json", player_index)
    dump_json(RUNTIME / "party-rosters.json", rosters)
    dump_json(RUNTIME / "team-squad-depth.json", depth)
    dump_json(RUNTIME / "team-player-form.json", form)

    print(json.dumps({
        "status": "FEDERAL_PLAYER_INGESTION_COMPLETE",
        "total_players": len(players_sorted),
        "house": len(house),
        "senate": len(senate),
        "teams": len(party_records),
        "independents": len(independents),
        "csv_urls": csv_urls,
    }, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FEDERAL_PLAYER_INGESTION_FAILED: {exc}", file=sys.stderr)
        raise
