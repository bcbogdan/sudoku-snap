# Browser OCR measurements

## Repeat

```sh
npx playwright install chromium
OCR_BASELINE=1 OCR_RUNS=5 npx tsx tests/ocr-pipeline.mts /tmp/opencode/ocr-before.json
OCR_RUNS=5 npx tsx tests/ocr-pipeline.mts /tmp/opencode/ocr-after.json
OCR_BASELINE=1 OCR_TRANSFORMS=1 OCR_RUNS=1 npx tsx tests/ocr-pipeline.mts /tmp/opencode/ocr-transforms-before.json
OCR_TRANSFORMS=1 OCR_RUNS=1 npx tsx tests/ocr-pipeline.mts /tmp/opencode/ocr-transforms-after.json
npx tsx --test tests/local-sudoku-reader.test.ts tests/image-polarity.test.ts
```

`OCR_BASELINE=1` builds reader/preprocessor/polarity sources from Git HEAD, not
working-tree sources. The comparison below used HEAD
`4f24d2166bb8451ceecb2199bcc848ec808baf0c`. Run before committing changes if using
this option to reproduce that comparison. The harness creates an isolated Vite
production bundle under `/tmp/opencode`, serves only on port 3207, and uses real
OpenCV and Tesseract browser workers with local vendor assets. It never builds
Next or modifies `.next`. No recognition mocks, solver, or fixture-derived guesses.

Each fixture gets a fresh browser context; its first identity run is cold
HTTP/language cache, subsequent runs warm those caches but create fresh workers.
OS/JIT caches and other agents' host load are uncontrolled. Reports include all
81 recognized values, uncertainty, mismatches, individual worker request timings,
and total `readSudoku` time. Timings **exclude image transform generation, UI
upload, IndexedDB persistence and navigation**; these are pipeline timings, not
whole-upload timings. Progress-boundary times are cumulative within preprocessing.
Concurrent stage durations must not be added to infer pipeline duration.

## Findings and change

Measured before changing implementation:

1. OpenCV/decode startup dominated preprocessing: ~700–900 ms before grid finding.
2. Serial OCR initialization added ~170–390 ms after preprocessing. Prediction:
   overlap startup with grid processing to shorten the critical path.
3. PNG encoding might contribute; not isolated, so no encoding rewrite justified.
4. Polarity/threshold fragility might appear under transforms; no failure reproduced.

The implementation starts OCR initialization when OpenCV is ready to process the
grid, overlapping initialization with the remaining ~240–390 ms of preprocessing.
It still starts no Tesseract worker while OpenCV itself is loading. Request cleanup
now tracks both in-flight workers so cancellation/failure clears both promises and
timeouts. Recognition, digit thresholds and uncertainty rules are unchanged.

## Results (Chromium 153.0.8010.12, Linux headless)

Five identity runs per fixture, including one cold and four warm. Warm medians, ms:

| Fixture          | Stage                       | Before | After |
| ---------------- | --------------------------- | -----: | ----: |
| original         | Full pipeline               |   1888 |  1766 |
| original         | Preprocessing incl. startup |   1169 |  1151 |
| original         | OCR initialization          |    193 |   238 |
| original         | All digit recognition       |    515 |   606 |
| dark-highlighted | Full pipeline               |   1559 |  1389 |
| dark-highlighted | Preprocessing incl. startup |   1030 |  1012 |
| dark-highlighted | OCR initialization          |    182 |   186 |
| dark-highlighted | All digit recognition       |    336 |   354 |

Warm pipeline improvements: **6.4% original, 10.9% dark**. Not a claim that individual
stages became faster: overlap reduces serial waiting. Recognition timings and
original's outlier show host noise/contention; this is a small sample, not a p95 claim.

Raw pipeline samples in order (cold first), ms:

| Fixture          | Before                       | After                        |
| ---------------- | ---------------------------- | ---------------------------- |
| original         | 3000, 1888, 1899, 1766, 1887 | 1665, 1801, 1731, 2058, 1563 |
| dark-highlighted | 1908, 1557, 1595, 1528, 1561 | 1453, 1423, 1409, 1369, 1364 |

Do not interpret the large cold-original difference as a stable improvement:
startup/JIT/OS state differed between batches.

Accuracy before and after: **all 81 cells exact for every case**, including blanks;
all uncertainty lists remained empty. Identity performance runs: 10/10 per version.
Separate transform runs: 10/10 per version (two fixtures × identity, 75% scaling,
2° clockwise rotation, contrast factor 0.7, inversion). Transforms use browser canvas
and PNG encoding, not additional hand-authored expected boards. Both versions use
the unchanged fixture JSON assertions.

Scoped Node tests: 28/28, including overlap/cleanup and follow-up edge regressions. The new
overlap assertion was also run against the pristine HEAD reader and failed at
`assert.ok(loadedBeforeExtraction)` in ~24 ms, confirming a red-capable signal.

Coordinator follow-up found that an OCR startup failure could wait for the
preprocessing timeout. All three worker failure forms now reject the pending
preprocessing request directly; the existing finalizer releases both workers.
New regressions leave preprocessing pending and require rejection before the next
event-loop turn (no elapsed timeout), preserving the actual OCR failure rather
than replacing it with cancellation. The ten additional cases cover those errors,
cancellation immediately after each successful startup stage, and empty extraction
with/without overlap. Six failed before the follow-up fix; all now pass. Empty
extraction avoids unnecessary initialization; cancellation never starts a new
worker after a successful preprocessing response. Successful-image overlap and
recognition are unchanged.
Follow-up validation: full `npm test` 113/113 and `npm run typecheck` pass;
the real-browser ten-case image suite still matches all 81 cells with unchanged
empty uncertainty lists (`/tmp/opencode/ocr-followup.json`). No Next build used.

## Limits

Only two source images; transforms are not independent real-world photographs.
No evidence about perspective extremes, severe blur, pencil marks, alternative
fonts, mobile memory/CPU behavior, or Safari/Firefox. No accuracy change claimed:
the measured issue was sequential startup latency. Original's noisy timings merit
more samples on a quiet host before setting a performance threshold.
