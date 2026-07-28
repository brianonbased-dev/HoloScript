import type { LanlGrayAchromaticAggregate } from '../perceptualColor';

export const LANL_GRAY_ACHROMATIC_SOURCE = {
  repo: 'https://github.com/lanl/color',
  dataUrl:
    'https://raw.githubusercontent.com/lanl/color/main/Gray_Experiment/data/gray_complete_data_release.csv',
  path: 'Gray_Experiment/data/gray_complete_data_release.csv',
  sha: '37fe92222edd4e081ed142ce3d7ca7ed40b6e4dc',
  columns: ['trial', 'Ls', 'Lt1', 'Lt2', 'R'],
  license: 'BSD-3-Clause',
  deposited: '2022-01-28',
  note: 'Compact aggregate fixture sampled from the official LANL achromatic gray-axis response data; the full CSV stays upstream.',
} as const;

/**
 * Official LANL gray-axis responses aggregated by (Ls, Lt1, Lt2).
 *
 * The rows below are a compact, deterministic fixture drawn from the upstream CSV:
 * standard L* values 30/50/70, absolute-difference gap 10, and nonzero distances
 * on both sides. `choseT2` is the sum of raw R responses where test 2 was selected
 * as more different from the standard.
 */
export const LANL_GRAY_ACHROMATIC_AGGREGATES: readonly LanlGrayAchromaticAggregate[] = [
  { Ls: 30, Lt1: 15, Lt2: 35, count: 287, choseT2: 37 },
  { Ls: 30, Lt1: 25, Lt2: 45, count: 249, choseT2: 166 },
  { Ls: 30, Lt1: 12.5, Lt2: 37.5, count: 304, choseT2: 69 },
  { Ls: 30, Lt1: 22.5, Lt2: 47.5, count: 304, choseT2: 158 },
  { Ls: 30, Lt1: 10, Lt2: 40, count: 249, choseT2: 74 },
  { Ls: 30, Lt1: 20, Lt2: 50, count: 249, choseT2: 121 },
  { Ls: 30, Lt1: 7.5, Lt2: 42.5, count: 299, choseT2: 73 },
  { Ls: 30, Lt1: 17.5, Lt2: 52.5, count: 299, choseT2: 127 },
  { Ls: 30, Lt1: 5, Lt2: 45, count: 304, choseT2: 72 },
  { Ls: 30, Lt1: 15, Lt2: 55, count: 304, choseT2: 123 },
  { Ls: 30, Lt1: 2.5, Lt2: 47.5, count: 299, choseT2: 62 },
  { Ls: 30, Lt1: 12.5, Lt2: 57.5, count: 299, choseT2: 126 },
  { Ls: 30, Lt1: 0, Lt2: 50, count: 287, choseT2: 59 },
  { Ls: 30, Lt1: 10, Lt2: 60, count: 249, choseT2: 111 },
  { Ls: 50, Lt1: 35, Lt2: 55, count: 287, choseT2: 51 },
  { Ls: 50, Lt1: 45, Lt2: 65, count: 249, choseT2: 175 },
  { Ls: 50, Lt1: 32.5, Lt2: 57.5, count: 299, choseT2: 69 },
  { Ls: 50, Lt1: 42.5, Lt2: 67.5, count: 299, choseT2: 222 },
  { Ls: 50, Lt1: 30, Lt2: 60, count: 249, choseT2: 84 },
  { Ls: 50, Lt1: 40, Lt2: 70, count: 249, choseT2: 179 },
  { Ls: 50, Lt1: 27.5, Lt2: 62.5, count: 299, choseT2: 80 },
  { Ls: 50, Lt1: 37.5, Lt2: 72.5, count: 304, choseT2: 198 },
  { Ls: 50, Lt1: 25, Lt2: 65, count: 299, choseT2: 75 },
  { Ls: 50, Lt1: 35, Lt2: 75, count: 299, choseT2: 204 },
  { Ls: 50, Lt1: 22.5, Lt2: 67.5, count: 304, choseT2: 82 },
  { Ls: 50, Lt1: 32.5, Lt2: 77.5, count: 299, choseT2: 187 },
  { Ls: 50, Lt1: 20, Lt2: 70, count: 287, choseT2: 57 },
  { Ls: 50, Lt1: 30, Lt2: 80, count: 249, choseT2: 155 },
  { Ls: 70, Lt1: 55, Lt2: 75, count: 287, choseT2: 76 },
  { Ls: 70, Lt1: 65, Lt2: 85, count: 249, choseT2: 192 },
  { Ls: 70, Lt1: 52.5, Lt2: 77.5, count: 299, choseT2: 115 },
  { Ls: 70, Lt1: 62.5, Lt2: 87.5, count: 304, choseT2: 239 },
  { Ls: 70, Lt1: 50, Lt2: 80, count: 249, choseT2: 102 },
  { Ls: 70, Lt1: 60, Lt2: 90, count: 249, choseT2: 185 },
  { Ls: 70, Lt1: 47.5, Lt2: 82.5, count: 299, choseT2: 104 },
  { Ls: 70, Lt1: 57.5, Lt2: 92.5, count: 299, choseT2: 215 },
  { Ls: 70, Lt1: 45, Lt2: 85, count: 304, choseT2: 126 },
  { Ls: 70, Lt1: 55, Lt2: 95, count: 304, choseT2: 232 },
  { Ls: 70, Lt1: 42.5, Lt2: 87.5, count: 299, choseT2: 133 },
  { Ls: 70, Lt1: 52.5, Lt2: 97.5, count: 304, choseT2: 223 },
  { Ls: 70, Lt1: 40, Lt2: 90, count: 287, choseT2: 108 },
  { Ls: 70, Lt1: 50, Lt2: 100, count: 249, choseT2: 173 },
];
