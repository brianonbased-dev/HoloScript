# Paper 12 HoloLand Scaling Envelope

**Schema:** `holoscript.paper-scaling-envelope.v1`
**Envelope:** `scaling_3f34d6ba05ce4fce`
**Hash:** `sha256:3f34d6ba05ce4fce1a4dfa97f49c617daf551dd816935637995c63b3c20baf27`
**Generated:** 2026-05-14T12:45:00.000Z

## Scope

This memo covers the HoloLand scene-suite parser/export path. It is the scaling memo
surface that Paper 12 can cite for the audit-matrix `scalingMemo` column.

## Quantified N

- Baseline: 20 objects x 4 annotations/object
- Targets: 50 objects, 500 objects, 5000 objects

## Bottleneck Model

- Asymptotic class: `O(o * a)`
- Variables: `o` = scene object count; `a` = annotations or traits per object
- Primary bottleneck: plugin export serialization
- Secondary bottleneck: batch scheduling once scenes exceed 5,000 objects

## Measured Baseline

- Evidence: `.bench-logs/2026-04-27-paper-12-scene-suite-overhead.md`
- Aggregate warm parse mean: 0.2012 ms
- Aggregate USD export mean: 0.2767 ms
- Peak scene export: 0.843 ms at 20 objects

## Growth Table

| Objects | Annotations | Projected runtime ms | Projected memory MB | Bottleneck |
|---:|---:|---:|---:|---|
| 50 | 200 | 2.108 | 0.031 | linear export serialization |
| 500 | 2000 | 21.075 | 0.305 | linear export serialization |
| 5000 | 20000 | 210.75 | 3.052 | export batch scheduling and plugin serialization |

## Scale-Out Plan

- Batch exports by shard/zone before object count exceeds 500.
- At 500 objects, keep one worker per export batch and persist intermediate manifests.
- At 5,000 objects, split scene-suite export into independent shard jobs and merge provenance manifests.

## Paper Citation

Use a Scaling or Scalability heading in `paper-12-holo-i3d.tex` and cite this
memo path directly:

```tex
\paragraph{Scaling.}
The HoloLand scene-suite export path scales as $O(o a)$ in object count $o$ and
annotations per object $a$; the measured baseline and scale-out plan are in
\texttt{research/paper-12-hololand-scaling.md}.
```
