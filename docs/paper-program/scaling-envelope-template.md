# Scaling Envelope Template

A paper scaling memo should make the subsystem scale claim falsifiable. Use this
shape before claiming a paper is ready on the `scalingMemo` column.

## Required Fields

- Quantified N: current measured size and at least two target sizes.
- Bottleneck model: asymptotic class and named bottlenecks.
- Runtime growth: measured baseline and projected growth formula.
- Memory growth: explicit bytes/object, bytes/edge, or bytes/annotation model.
- Scale-out plan: what changes at each target size.
- Evidence path: benchmark, report, or receipt path that produced the baseline.

## Paper Citation Pattern

The audit detector accepts a direct `research/*-scaling*.md` path, or a scaling
heading with a quantified claim. The strongest pattern is both:

```tex
\paragraph{Scaling.}
The subsystem scales as $O(o a)$ from 20 to 5{,}000 objects; the measured
baseline, memory model, and scale-out plan are in
\texttt{research/paper-12-hololand-scaling.md}.
```
