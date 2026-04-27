# Smoke test — 2026-04-27

**App:** `envia-mcp-stage` on Heroku (URL `https://envia-mcp-stage-8942f8239481.herokuapp.com`).
**Code state at smoke:** running the previous deploy (no changes from Sprints 5-7 + C11 are deployed yet — those live in `mcp-expansion` branch only). Smoke validates the v1 baseline (rate, generate, track, cancel, balance, error path), not the new tools.
**Operator:** Claude Opus 4.7 (1M), session 2026-04-27.
**Reason:** Decision C observation window from 2026-04-17 had grown to 10+ days. Smoke run to either confirm baseline health or surface regressions before considering production promote.

## Results

| Step | Tool | Result | Evidence |
|------|------|--------|----------|
| 2.1 | `quote_shipment` | ✅ PASS | Found 13 rates, sorted cheapest first. UPS, paquetexpress, dhl, estafeta, ivoy returned. |
| 2.2 | `create_shipment` (dhl/express) | ✅ PASS | Tracking `9824458744`, label PDF on S3, price €14.28 EUR charged. |
| 2.3 | `envia_track_package` | ✅ PASS | Status `Created`, carrier `DHL`, ETA `2026-04-28 23:59:00`. |
| 2.4 | `envia_cancel_shipment` | ✅ PASS | "Shipment cancelled successfully." |
| 2.5 | `envia_check_balance` | ✅ PASS | Balance €9912068.43 EUR vs requested €500 → ✓ Sufficient. |
| 3.1 | error path (invalid api_key) | ✅ PASS | Mapped message: "Authentication failed — verify your ENVIA_API_KEY is valid and not expired." |

**Outcome:** all six steps PASS. Decision C "go" criteria for the deployed baseline are satisfied.

## Important notes

- The **app URL changed** from the value previously documented (`envia-mcp-server-c0fa1b3dab48.herokuapp.com`) to `envia-mcp-stage-8942f8239481.herokuapp.com`. Updated `SMOKE_TEST_PLAYBOOK.md` and memory accordingly.
- The deploy currently running on stage is the version BEFORE the `mcp-expansion` branch work (Sprints 5-7 + C11 spec/pre-impl). All those changes are in `mcp-expansion` local + remote, **not yet deployed** to stage. Workflow: deploys to date have been `git push heroku main` from local, not from GitHub Actions.
- Smoke validates the baseline that was already in production-equivalent shape — it does NOT validate the new tools (`envia_find_drop_off`, `envia_ai_address_requirements`, `envia_get_additional_service_prices`, `envia_get_carrier_constraints`). Those need a fresh deploy + a separate smoke pass once they ship.

## Next steps unlocked

1. **Production promote decision.** The baseline runs healthy on stage; the original Decision C observation window can close as PASS for the deployed code. The promote of *new* code (`mcp-expansion`) is a separate question that depends on Jose authorising deploy + smoke of the new tools.
2. **Deploy `mcp-expansion` to stage.** When Jose authorises, push the branch to Heroku stage and re-run this smoke + add 4 new test cases (one per Sprint 7 tool). The carrier-constraints tool will return its "endpoint not yet available" message until backend ships C11 — that is expected behaviour.
3. **Production deploy.** Only after stage smoke of the new tools passes.
