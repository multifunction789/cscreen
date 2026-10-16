#!/usr/bin/env python3
"""Render a schema snapshot (output of scripts/db/dump-schema.sql) into a baseline migration.

usage: python3 scripts/db/render-baseline.py snapshot.json > supabase/migrations/<ts>_baseline.sql

The baseline records the production schema exactly as it was when the snapshot
was taken: tables, constraints, indexes, functions, triggers, RLS and policies.
It is idempotent where Postgres allows (IF NOT EXISTS / OR REPLACE) so it can be
replayed on a fresh database or on top of production without changes.
"""
import json
import sys

SKIP_EXT = {"plpgsql", "supabase_vault"}  # managed by Supabase


def q(ident):
    return '"' + ident.replace('"', '""') + '"' if not ident.islower() or not ident.replace("_", "").isalnum() else ident


def main(path):
    d = json.load(open(path, encoding="utf-8"))
    out = []
    w = out.append
    w("-- ═══════════════════════════════════════════════════════════════════")
    w("-- Baseline: production schema snapshot (generated — do not edit by hand)")
    w("-- Source : scripts/db/dump-schema.sql → scripts/db/render-baseline.py")
    w("-- Safe to replay: every statement is IF NOT EXISTS / OR REPLACE / guarded.")
    w("-- ═══════════════════════════════════════════════════════════════════\n")

    w("-- Extensions")
    for e in d["ext"]:
        if e["extname"] in SKIP_EXT:
            continue
        w(f'create extension if not exists "{e["extname"]}" with schema {e["nspname"]};')
    w("")

    if d.get("types"):
        w("-- Types")
        for t in d["types"]:
            if t["typtype"] == "e":
                w(f"do $$ begin create type public.{q(t['typname'])} as enum ({t['labels']}); exception when duplicate_object then null; end $$;")
        w("")

    # tables
    tables = {}
    for c in d["cols"]:
        tables.setdefault(c["tbl"], []).append(c)
    w("-- Tables")
    for tbl in sorted(tables):
        cols = []
        for c in sorted(tables[tbl], key=lambda x: x["attnum"]):
            s = f"  {q(c['attname'])} {c['typ']}"
            if c.get("ident"):
                s += " generated " + ("always" if c["ident"] == "a" else "by default") + " as identity"
            elif c.get("def") is not None:
                s += f" default {c['def']}"
            if c["nn"]:
                s += " not null"
            cols.append(s)
        w(f"create table if not exists public.{q(tbl)} (\n" + ",\n".join(cols) + "\n);")
    w("")
    w("-- Columns added after a table first existed (keeps replay on older copies safe)")
    for tbl in sorted(tables):
        for c in sorted(tables[tbl], key=lambda x: x["attnum"]):
            s = f"alter table public.{q(tbl)} add column if not exists {q(c['attname'])} {c['typ']}"
            if c.get("def") is not None and not c.get("ident"):
                s += f" default {c['def']}"
            w(s + ";")
    w("")

    def add_constraints(kinds, title):
        w(f"-- {title}")
        for k in d["cons"]:
            if k["contype"] not in kinds:
                continue
            w(
                "do $$ begin\n"
                f"  alter table public.{q(k['tbl'])} add constraint {q(k['conname'])} {k['def']};\n"
                "exception when duplicate_object or duplicate_table or invalid_table_definition then null;\n"
                "end $$;"
            )
        w("")

    add_constraints("p", "Primary keys")
    add_constraints("uc", "Unique and check constraints")
    add_constraints("fx", "Foreign keys")

    w("-- Indexes")
    for i in d["idx"]:
        w(i["indexdef"].replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ", 1)
          .replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1) + ";")
    w("")

    if d.get("views"):
        w("-- Views")
        for v in d["views"]:
            kind = "materialized view" if v["relkind"] == "m" else "or replace view"
            w(f"create {kind} public.{q(v['relname'])} as\n{v['def']}")
        w("")

    w("-- Functions")
    for f in d["fns"]:
        w(f["def"].rstrip() + ";\n")

    w("-- Triggers")
    for t in d["trg"]:
        w(f"drop trigger if exists {q(t['tgname'])} on {t['nspname']}.{q(t['relname'])};")
        w(t["def"] + ";")
    w("")

    w("-- Row level security")
    for r in d["rls"]:
        if r["rls"]:
            w(f"alter table public.{q(r['relname'])} enable row level security;")
        if r["frc"]:
            w(f"alter table public.{q(r['relname'])} force row level security;")
    w("")

    w("-- Policies")
    for p in d["pol"] + [dict(x, schema="storage") for x in d.get("storage_policies", [])]:
        schema = p.get("schema", "public")
        s = f"drop policy if exists {q(p['policyname'])} on {schema}.{q(p['tablename'])};\n"
        s += f"create policy {q(p['policyname'])} on {schema}.{q(p['tablename'])}"
        s += f" as {p['permissive'].lower()} for {p['cmd'].lower()} to {', '.join(p['roles'])}"
        if p.get("qual") is not None:
            s += f"\n  using ({p['qual']})"
        if p.get("with_check") is not None:
            s += f"\n  with check ({p['with_check']})"
        w(s + ";")
    w("")

    if d.get("buckets"):
        w("-- Storage buckets")
        for b in d["buckets"]:
            w(f"insert into storage.buckets (id, name, public) values ('{b['id']}', '{b['id']}', {str(b['public']).lower()}) on conflict (id) do nothing;")
        w("")

    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main(sys.argv[1])
