# A19 paper-ingest receipts (2026-10-23)

Built and run on the Jetson build host (holojetson, nice -n 15, flock lock, 2.5 GB Node cap) from base a4fdbacc. The spec was written at ce7c94874; note that drift.

| # | Receipt | Result |
|---|---|---|
| 1 | ingest-p5.json | 9 live rows, allClaimsPresent |
| 2 | links-p5-4.json | status partial; bootstrap mismatch (expected true, actual false) as predicted |
| 3 | replay.json | deterministic:true; tampering with the graph layer is detected |
| 4 | binding.txt | CascadeBinding 9/9 |
| 5 | ledger-diff.txt | 7 diffs, 0 unexplained; row 8 heldByHand (PAPER_VOICE) |
| 6 | audit-holoabsorb.json | exit 0 with paper-ingest capability |
| 7 | local-run.json | receipts 1-5 rerun with railway / mcp.holoscript.net blocked at dns/net/http/fetch; 0 blocked attempts |
| 8 | tests.txt | full package: 11 failing files, all failing on base too (env); new tests all pass |
| - | handbooks-before-after.json | plaintext 73 / 0 symbols / 88 links / 665 headings → markdown 66 / 703 symbols (637 sections) / 87 links |

## Licenses checked before reading prior art (PAPER_VOICE 0b)
- knowing: Apache-2.0
- GraphRAG: MIT
- RepoGraph: Apache-2.0
- CodeRAG: MIT
- RepoCoder: MIT
- codeoracle: no LICENSE, so ideas only, no code
- repo-graph-rag: license unclear, so ideas only
- GitNexus: PolyForm Noncommercial, so its code was NOT read
- Tool Receipts: paper only