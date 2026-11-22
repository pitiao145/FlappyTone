# Brief 49 — full tables (generated)

Numbers only. Regenerate: `node src/dev/bench39/cut49.mjs` (step 2, the four approaches on the brief's own terms, no clean-up) and `node src/dev/bench39/cut49ship.mjs --pairs` (today vs the shipped finder, through the production path). Spots are learned on the other half of Jane's clips (2-fold), so no clip is cut with a spot learned from itself.

Columns: approach | style | pair (spoken tones) | n | n with a reference cut | cut error median ms | p90 ms | both syllables right % | a wrong tone named % | '?' syllables % | wrong tone named with a cut > 80 ms off the reference.

## Step 2: four approaches (cut49.mjs)

```
reference textbook: 208 pairs; {"silence":164,"none":24,"praat-dip":10,"praat-unvoiced":10}
reference natural: 203 pairs; {"praat-unvoiced":66,"silence":59,"none":57,"praat-dip":21}

## grid: old
approach | style | pair | n | n ref | cut err med ms | p90 ms | both right % | wrong tone named % | '?' syllables % | wrong with cut > 80 ms off
0 today | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
0 today | textbook | 12 | 15 | 8 | 21 | 43 | 46.7 | 46.7 | 10.0 | 0
0 today | textbook | 13 | 4 | 4 | 28 | 43 | 100.0 | 0.0 | 0.0 | 0
0 today | textbook | 14 | 17 | 16 | 43 | 619 | 76.5 | 17.6 | 11.8 | 2
0 today | textbook | 21 | 11 | 11 | 32 | 53 | 81.8 | 18.2 | 0.0 | 0
0 today | textbook | 22 | 10 | 10 | 21 | 43 | 80.0 | 20.0 | 0.0 | 0
0 today | textbook | 23 | 16 | 13 | 21 | 299 | 68.8 | 31.3 | 0.0 | 2
0 today | textbook | 24 | 17 | 17 | 32 | 64 | 88.2 | 5.9 | 2.9 | 0
0 today | textbook | 31 | 12 | 12 | 21 | 32 | 91.7 | 0.0 | 4.2 | 0
0 today | textbook | 32 | 13 | 11 | 21 | 46 | 92.3 | 7.7 | 0.0 | 0
0 today | textbook | 34 | 18 | 14 | 32 | 128 | 72.2 | 0.0 | 16.7 | 0
0 today | textbook | 41 | 15 | 15 | 21 | 43 | 100.0 | 0.0 | 0.0 | 0
0 today | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
0 today | textbook | 43 | 16 | 14 | 21 | 32 | 68.8 | 12.5 | 9.4 | 0
0 today | textbook | 44 | 17 | 15 | 32 | 43 | 76.5 | 23.5 | 8.8 | 1
0 today | textbook | all | 208 | 184 | 21 | 53 | 80.8 | 13.5 | 5.0 | 5
0 today | natural | 11 | 15 | 5 | 21 | 27 | 0.0 | 0.0 | 83.3 | 0
0 today | natural | 12 | 15 | 5 | 21 | 21 | 0.0 | 13.3 | 80.0 | 0
0 today | natural | 13 | 4 | 2 | 360 | 360 | 0.0 | 25.0 | 75.0 | 1
0 today | natural | 14 | 17 | 6 | 21 | 21 | 0.0 | 5.9 | 79.4 | 0
0 today | natural | 21 | 11 | 2 | 21 | 21 | 0.0 | 9.1 | 90.9 | 0
0 today | natural | 22 | 10 | 6 | 21 | 21 | 30.0 | 30.0 | 55.0 | 0
0 today | natural | 23 | 16 | 5 | 21 | 442 | 12.5 | 31.3 | 56.3 | 2
0 today | natural | 24 | 15 | 7 | 21 | 32 | 0.0 | 13.3 | 70.0 | 0
0 today | natural | 31 | 12 | 9 | 21 | 54 | 8.3 | 8.3 | 62.5 | 0
0 today | natural | 32 | 13 | 6 | 21 | 26 | 23.1 | 0.0 | 57.7 | 0
0 today | natural | 34 | 18 | 8 | 21 | 32 | 16.7 | 0.0 | 69.4 | 0
0 today | natural | 41 | 13 | 5 | 20 | 32 | 7.7 | 0.0 | 80.8 | 0
0 today | natural | 42 | 11 | 7 | 21 | 22 | 36.4 | 0.0 | 45.5 | 0
0 today | natural | 43 | 16 | 8 | 227 | 365 | 6.3 | 12.5 | 65.6 | 1
0 today | natural | 44 | 17 | 7 | 21 | 437 | 0.0 | 5.9 | 73.5 | 0
0 today | natural | all | 203 | 88 | 21 | 227 | 8.9 | 9.4 | 70.0 | 4
1 middle | textbook | 11 | 15 | 15 | 267 | 299 | 86.7 | 6.7 | 3.3 | 1
1 middle | textbook | 12 | 15 | 8 | 245 | 309 | 0.0 | 100.0 | 0.0 | 8
1 middle | textbook | 13 | 4 | 4 | 299 | 299 | 0.0 | 100.0 | 0.0 | 4
1 middle | textbook | 14 | 17 | 16 | 107 | 171 | 94.1 | 0.0 | 2.9 | 0
1 middle | textbook | 21 | 11 | 11 | 213 | 235 | 72.7 | 27.3 | 0.0 | 3
1 middle | textbook | 22 | 10 | 10 | 224 | 288 | 80.0 | 20.0 | 0.0 | 2
1 middle | textbook | 23 | 16 | 13 | 213 | 256 | 68.8 | 31.3 | 0.0 | 5
1 middle | textbook | 24 | 17 | 17 | 107 | 224 | 76.5 | 23.5 | 0.0 | 4
1 middle | textbook | 31 | 12 | 12 | 277 | 373 | 91.7 | 8.3 | 0.0 | 1
1 middle | textbook | 32 | 13 | 11 | 241 | 371 | 61.5 | 0.0 | 19.2 | 0
1 middle | textbook | 34 | 18 | 14 | 149 | 341 | 83.3 | 5.6 | 8.3 | 1
1 middle | textbook | 41 | 15 | 15 | 299 | 363 | 0.0 | 100.0 | 0.0 | 15
1 middle | textbook | 42 | 12 | 9 | 256 | 288 | 100.0 | 0.0 | 0.0 | 0
1 middle | textbook | 43 | 16 | 14 | 235 | 320 | 68.8 | 6.3 | 12.5 | 1
1 middle | textbook | 44 | 17 | 15 | 139 | 565 | 64.7 | 35.3 | 0.0 | 5
1 middle | textbook | all | 208 | 184 | 213 | 320 | 65.9 | 27.9 | 3.4 | 50
1 middle | natural | 11 | 15 | 15 | 267 | 350 | 33.3 | 6.7 | 33.3 | 1
1 middle | natural | 12 | 15 | 6 | 277 | 373 | 0.0 | 100.0 | 6.7 | 6
1 middle | natural | 13 | 4 | 3 | 205 | 306 | 0.0 | 75.0 | 25.0 | 2
1 middle | natural | 14 | 17 | 13 | 213 | 267 | 0.0 | 47.1 | 38.2 | 8
1 middle | natural | 21 | 11 | 9 | 291 | 437 | 45.5 | 45.5 | 18.2 | 4
1 middle | natural | 22 | 10 | 8 | 281 | 358 | 0.0 | 100.0 | 5.0 | 8
1 middle | natural | 23 | 16 | 6 | 288 | 346 | 6.3 | 75.0 | 12.5 | 5
1 middle | natural | 24 | 15 | 13 | 178 | 224 | 53.3 | 26.7 | 13.3 | 2
1 middle | natural | 31 | 12 | 11 | 267 | 331 | 16.7 | 16.7 | 37.5 | 2
1 middle | natural | 32 | 13 | 7 | 288 | 363 | 38.5 | 0.0 | 30.8 | 0
1 middle | natural | 34 | 18 | 13 | 170 | 199 | 66.7 | 33.3 | 0.0 | 4
1 middle | natural | 41 | 13 | 13 | 288 | 309 | 15.4 | 23.1 | 53.8 | 3
1 middle | natural | 42 | 11 | 8 | 257 | 288 | 90.9 | 0.0 | 4.5 | 0
1 middle | natural | 43 | 16 | 9 | 299 | 384 | 6.3 | 56.3 | 18.8 | 6
1 middle | natural | 44 | 17 | 12 | 221 | 288 | 0.0 | 52.9 | 35.3 | 8
1 middle | natural | all | 203 | 146 | 256 | 331 | 25.1 | 42.9 | 22.2 | 59
2 spot | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
2 spot | textbook | 12 | 15 | 8 | 21 | 43 | 53.3 | 46.7 | 6.7 | 0
2 spot | textbook | 13 | 4 | 4 | 39 | 43 | 100.0 | 0.0 | 0.0 | 0
2 spot | textbook | 14 | 17 | 16 | 43 | 85 | 88.2 | 5.9 | 5.9 | 0
2 spot | textbook | 21 | 11 | 11 | 32 | 53 | 72.7 | 27.3 | 0.0 | 0
2 spot | textbook | 22 | 10 | 10 | 21 | 43 | 80.0 | 20.0 | 0.0 | 0
2 spot | textbook | 23 | 16 | 13 | 32 | 65 | 75.0 | 25.0 | 0.0 | 1
2 spot | textbook | 24 | 17 | 17 | 32 | 53 | 94.1 | 5.9 | 0.0 | 0
2 spot | textbook | 31 | 12 | 12 | 21 | 32 | 91.7 | 0.0 | 4.2 | 0
2 spot | textbook | 32 | 13 | 11 | 21 | 58 | 92.3 | 7.7 | 0.0 | 0
2 spot | textbook | 34 | 18 | 14 | 32 | 107 | 83.3 | 0.0 | 11.1 | 0
2 spot | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
2 spot | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
2 spot | textbook | 43 | 16 | 14 | 21 | 32 | 87.5 | 12.5 | 0.0 | 0
2 spot | textbook | 44 | 17 | 15 | 32 | 43 | 82.4 | 17.6 | 5.9 | 0
2 spot | textbook | all | 208 | 184 | 27 | 53 | 85.6 | 12.0 | 2.6 | 1
2 spot | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 6.7 | 53.3 | 0
2 spot | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 66.7 | 53.3 | 0
2 spot | natural | 13 | 4 | 2 | 360 | 360 | 0.0 | 50.0 | 50.0 | 1
2 spot | natural | 14 | 17 | 13 | 25 | 404 | 0.0 | 11.8 | 47.1 | 1
2 spot | natural | 21 | 11 | 9 | 27 | 683 | 0.0 | 9.1 | 54.5 | 0
2 spot | natural | 22 | 10 | 8 | 21 | 32 | 30.0 | 70.0 | 25.0 | 0
2 spot | natural | 23 | 16 | 6 | 300 | 393 | 43.8 | 50.0 | 15.6 | 1
2 spot | natural | 24 | 15 | 13 | 21 | 39 | 0.0 | 20.0 | 43.3 | 0
2 spot | natural | 31 | 12 | 11 | 21 | 34 | 8.3 | 8.3 | 58.3 | 0
2 spot | natural | 32 | 13 | 7 | 21 | 37 | 23.1 | 0.0 | 38.5 | 0
2 spot | natural | 34 | 18 | 13 | 21 | 29 | 22.2 | 16.7 | 36.1 | 0
2 spot | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 0.0 | 69.2 | 0
2 spot | natural | 42 | 11 | 8 | 21 | 206 | 36.4 | 9.1 | 36.4 | 1
2 spot | natural | 43 | 16 | 9 | 21 | 140 | 0.0 | 18.8 | 50.0 | 1
2 spot | natural | 44 | 17 | 12 | 30 | 384 | 0.0 | 17.6 | 47.1 | 0
2 spot | natural | all | 203 | 145 | 22 | 171 | 11.3 | 22.2 | 44.8 | 5
2q spot, else ? | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
2q spot, else ? | textbook | 12 | 15 | 8 | 21 | 43 | 53.3 | 26.7 | 23.3 | 0
2q spot, else ? | textbook | 13 | 4 | 4 | 39 | 43 | 100.0 | 0.0 | 0.0 | 0
2q spot, else ? | textbook | 14 | 17 | 16 | 43 | 85 | 88.2 | 5.9 | 5.9 | 0
2q spot, else ? | textbook | 21 | 11 | 11 | 32 | 53 | 72.7 | 27.3 | 0.0 | 0
2q spot, else ? | textbook | 22 | 10 | 10 | 21 | 43 | 80.0 | 20.0 | 0.0 | 0
2q spot, else ? | textbook | 23 | 16 | 12 | 32 | 65 | 68.8 | 25.0 | 6.3 | 1
2q spot, else ? | textbook | 24 | 17 | 17 | 32 | 53 | 94.1 | 5.9 | 0.0 | 0
2q spot, else ? | textbook | 31 | 12 | 12 | 21 | 32 | 91.7 | 0.0 | 4.2 | 0
2q spot, else ? | textbook | 32 | 13 | 11 | 21 | 58 | 92.3 | 7.7 | 0.0 | 0
2q spot, else ? | textbook | 34 | 18 | 14 | 32 | 107 | 83.3 | 0.0 | 11.1 | 0
2q spot, else ? | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
2q spot, else ? | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
2q spot, else ? | textbook | 43 | 16 | 14 | 21 | 32 | 87.5 | 12.5 | 0.0 | 0
2q spot, else ? | textbook | 44 | 17 | 15 | 32 | 43 | 82.4 | 17.6 | 5.9 | 0
2q spot, else ? | textbook | all | 208 | 183 | 21 | 53 | 85.1 | 10.6 | 4.3 | 1
2q spot, else ? | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 6.7 | 53.3 | 0
2q spot, else ? | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 13.3 | 80.0 | 0
2q spot, else ? | natural | 13 | 4 | 2 | 360 | 360 | 0.0 | 25.0 | 75.0 | 1
2q spot, else ? | natural | 14 | 17 | 12 | 25 | 374 | 0.0 | 5.9 | 55.9 | 0
2q spot, else ? | natural | 21 | 11 | 4 | 32 | 683 | 0.0 | 9.1 | 77.3 | 0
2q spot, else ? | natural | 22 | 10 | 7 | 21 | 28 | 20.0 | 50.0 | 50.0 | 0
2q spot, else ? | natural | 23 | 16 | 4 | 36 | 393 | 25.0 | 18.8 | 62.5 | 1
2q spot, else ? | natural | 24 | 15 | 13 | 21 | 39 | 0.0 | 20.0 | 43.3 | 0
2q spot, else ? | natural | 31 | 12 | 11 | 21 | 34 | 8.3 | 8.3 | 58.3 | 0
2q spot, else ? | natural | 32 | 13 | 7 | 21 | 37 | 23.1 | 0.0 | 50.0 | 0
2q spot, else ? | natural | 34 | 18 | 13 | 21 | 29 | 22.2 | 16.7 | 36.1 | 0
2q spot, else ? | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 0.0 | 69.2 | 0
2q spot, else ? | natural | 42 | 11 | 7 | 21 | 33 | 18.2 | 0.0 | 59.1 | 0
2q spot, else ? | natural | 43 | 16 | 8 | 21 | 35 | 0.0 | 12.5 | 68.8 | 0
2q spot, else ? | natural | 44 | 17 | 12 | 30 | 384 | 0.0 | 17.6 | 50.0 | 0
2q spot, else ? | natural | all | 203 | 134 | 21 | 39 | 8.4 | 12.8 | 57.9 | 2
3 stretch | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
3 stretch | textbook | 12 | 15 | 8 | 21 | 43 | 40.0 | 53.3 | 6.7 | 0
3 stretch | textbook | 13 | 4 | 4 | 39 | 43 | 100.0 | 0.0 | 0.0 | 0
3 stretch | textbook | 14 | 17 | 16 | 43 | 619 | 76.5 | 17.6 | 11.8 | 2
3 stretch | textbook | 21 | 11 | 11 | 21 | 53 | 81.8 | 18.2 | 0.0 | 0
3 stretch | textbook | 22 | 10 | 10 | 21 | 50 | 80.0 | 20.0 | 0.0 | 0
3 stretch | textbook | 23 | 16 | 13 | 43 | 299 | 62.5 | 37.5 | 0.0 | 2
3 stretch | textbook | 24 | 17 | 17 | 32 | 203 | 88.2 | 5.9 | 2.9 | 0
3 stretch | textbook | 31 | 12 | 12 | 21 | 75 | 83.3 | 8.3 | 4.2 | 1
3 stretch | textbook | 32 | 13 | 11 | 21 | 58 | 84.6 | 7.7 | 3.8 | 0
3 stretch | textbook | 34 | 18 | 14 | 32 | 128 | 72.2 | 0.0 | 16.7 | 0
3 stretch | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
3 stretch | textbook | 42 | 12 | 9 | 21 | 118 | 100.0 | 0.0 | 0.0 | 0
3 stretch | textbook | 43 | 16 | 14 | 32 | 75 | 81.3 | 12.5 | 3.1 | 0
3 stretch | textbook | 44 | 17 | 15 | 32 | 70 | 70.6 | 29.4 | 8.8 | 1
3 stretch | textbook | all | 208 | 184 | 32 | 75 | 79.3 | 15.4 | 4.6 | 6
3 stretch | natural | 11 | 15 | 15 | 22 | 33 | 0.0 | 6.7 | 56.7 | 0
3 stretch | natural | 12 | 15 | 6 | 21 | 54 | 0.0 | 73.3 | 53.3 | 0
3 stretch | natural | 13 | 4 | 3 | 24 | 171 | 0.0 | 50.0 | 62.5 | 0
3 stretch | natural | 14 | 17 | 13 | 96 | 405 | 0.0 | 41.2 | 47.1 | 5
3 stretch | natural | 21 | 11 | 7 | 29 | 693 | 0.0 | 18.2 | 59.1 | 0
3 stretch | natural | 22 | 10 | 8 | 32 | 124 | 30.0 | 70.0 | 20.0 | 1
3 stretch | natural | 23 | 16 | 6 | 36 | 373 | 56.3 | 25.0 | 21.9 | 0
3 stretch | natural | 24 | 15 | 13 | 21 | 154 | 6.7 | 13.3 | 43.3 | 0
3 stretch | natural | 31 | 12 | 11 | 21 | 84 | 8.3 | 16.7 | 54.2 | 1
3 stretch | natural | 32 | 13 | 7 | 21 | 59 | 23.1 | 0.0 | 38.5 | 0
3 stretch | natural | 34 | 18 | 13 | 21 | 68 | 22.2 | 16.7 | 33.3 | 0
3 stretch | natural | 41 | 13 | 13 | 26 | 39 | 7.7 | 0.0 | 69.2 | 0
3 stretch | natural | 42 | 11 | 8 | 21 | 206 | 27.3 | 27.3 | 27.3 | 1
3 stretch | natural | 43 | 16 | 9 | 27 | 97 | 0.0 | 12.5 | 53.1 | 0
3 stretch | natural | 44 | 17 | 12 | 30 | 437 | 0.0 | 5.9 | 47.1 | 0
3 stretch | natural | all | 203 | 144 | 25 | 154 | 12.3 | 23.2 | 45.1 | 8
R oracle (ref cut) | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
R oracle (ref cut) | textbook | 12 | 15 | 8 | 21 | 43 | 33.3 | 13.3 | 53.3 | 0
R oracle (ref cut) | textbook | 13 | 4 | 4 | 39 | 43 | 100.0 | 0.0 | 0.0 | 0
R oracle (ref cut) | textbook | 14 | 17 | 16 | 32 | 53 | 82.4 | 5.9 | 11.8 | 0
R oracle (ref cut) | textbook | 21 | 11 | 11 | 21 | 53 | 81.8 | 18.2 | 0.0 | 0
R oracle (ref cut) | textbook | 22 | 10 | 10 | 21 | 43 | 80.0 | 20.0 | 0.0 | 0
R oracle (ref cut) | textbook | 23 | 16 | 13 | 21 | 43 | 62.5 | 18.8 | 18.8 | 0
R oracle (ref cut) | textbook | 24 | 17 | 17 | 32 | 53 | 94.1 | 5.9 | 0.0 | 0
R oracle (ref cut) | textbook | 31 | 12 | 12 | 21 | 32 | 91.7 | 0.0 | 4.2 | 0
R oracle (ref cut) | textbook | 32 | 13 | 11 | 21 | 35 | 76.9 | 7.7 | 15.4 | 0
R oracle (ref cut) | textbook | 34 | 18 | 14 | 32 | 85 | 72.2 | 0.0 | 25.0 | 0
R oracle (ref cut) | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
R oracle (ref cut) | textbook | 42 | 12 | 9 | 21 | 32 | 75.0 | 0.0 | 25.0 | 0
R oracle (ref cut) | textbook | 43 | 16 | 14 | 21 | 32 | 75.0 | 12.5 | 12.5 | 0
R oracle (ref cut) | textbook | 44 | 17 | 15 | 32 | 43 | 70.6 | 17.6 | 17.6 | 0
R oracle (ref cut) | textbook | all | 208 | 184 | 21 | 43 | 77.9 | 8.7 | 13.5 | 0
R oracle (ref cut) | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 6.7 | 53.3 | 0
R oracle (ref cut) | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 6.7 | 83.3 | 0
R oracle (ref cut) | natural | 13 | 4 | 3 | 18 | 24 | 0.0 | 50.0 | 62.5 | 0
R oracle (ref cut) | natural | 14 | 17 | 13 | 23 | 33 | 0.0 | 29.4 | 61.8 | 0
R oracle (ref cut) | natural | 21 | 11 | 8 | 27 | 32 | 0.0 | 18.2 | 63.6 | 0
R oracle (ref cut) | natural | 22 | 10 | 8 | 21 | 32 | 30.0 | 50.0 | 40.0 | 0
R oracle (ref cut) | natural | 23 | 16 | 5 | 30 | 36 | 18.8 | 6.3 | 71.9 | 0
R oracle (ref cut) | natural | 24 | 15 | 13 | 21 | 37 | 0.0 | 13.3 | 53.3 | 0
R oracle (ref cut) | natural | 31 | 12 | 11 | 21 | 32 | 8.3 | 16.7 | 58.3 | 0
R oracle (ref cut) | natural | 32 | 13 | 7 | 21 | 37 | 23.1 | 0.0 | 61.5 | 0
R oracle (ref cut) | natural | 34 | 18 | 13 | 21 | 29 | 22.2 | 0.0 | 52.8 | 0
R oracle (ref cut) | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 0.0 | 69.2 | 0
R oracle (ref cut) | natural | 42 | 11 | 8 | 21 | 33 | 27.3 | 0.0 | 50.0 | 0
R oracle (ref cut) | natural | 43 | 16 | 9 | 21 | 35 | 6.3 | 12.5 | 68.8 | 0
R oracle (ref cut) | natural | 44 | 17 | 10 | 21 | 30 | 0.0 | 5.9 | 67.6 | 0
R oracle (ref cut) | natural | all | 203 | 142 | 21 | 32 | 9.4 | 11.8 | 61.8 | 0
3d dtw | textbook | 11 | 15 | 15 | 43 | 149 | 93.3 | 6.7 | 0.0 | 0
3d dtw | textbook | 12 | 15 | 8 | 21 | 43 | 40.0 | 53.3 | 3.3 | 0
3d dtw | textbook | 13 | 4 | 4 | 43 | 57 | 100.0 | 0.0 | 0.0 | 0
3d dtw | textbook | 14 | 17 | 16 | 43 | 619 | 76.5 | 17.6 | 11.8 | 2
3d dtw | textbook | 21 | 11 | 11 | 32 | 53 | 72.7 | 27.3 | 0.0 | 0
3d dtw | textbook | 22 | 10 | 10 | 21 | 114 | 80.0 | 20.0 | 0.0 | 1
3d dtw | textbook | 23 | 16 | 13 | 43 | 299 | 81.3 | 18.8 | 0.0 | 2
3d dtw | textbook | 24 | 17 | 17 | 32 | 106 | 88.2 | 5.9 | 2.9 | 0
3d dtw | textbook | 31 | 12 | 12 | 21 | 102 | 91.7 | 0.0 | 4.2 | 0
3d dtw | textbook | 32 | 13 | 11 | 21 | 58 | 92.3 | 7.7 | 0.0 | 0
3d dtw | textbook | 34 | 18 | 14 | 32 | 128 | 72.2 | 0.0 | 16.7 | 0
3d dtw | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
3d dtw | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
3d dtw | textbook | 43 | 16 | 14 | 21 | 32 | 81.3 | 12.5 | 3.1 | 0
3d dtw | textbook | 44 | 17 | 15 | 32 | 58 | 76.5 | 23.5 | 8.8 | 1
3d dtw | textbook | all | 208 | 184 | 32 | 96 | 81.7 | 13.5 | 4.1 | 6
3d dtw | natural | 11 | 15 | 15 | 32 | 164 | 6.7 | 6.7 | 56.7 | 1
3d dtw | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 66.7 | 53.3 | 0
3d dtw | natural | 13 | 4 | 3 | 24 | 171 | 0.0 | 50.0 | 62.5 | 0
3d dtw | natural | 14 | 17 | 13 | 29 | 364 | 0.0 | 47.1 | 50.0 | 3
3d dtw | natural | 21 | 11 | 7 | 27 | 736 | 0.0 | 18.2 | 59.1 | 0
3d dtw | natural | 22 | 10 | 8 | 32 | 118 | 30.0 | 70.0 | 20.0 | 2
3d dtw | natural | 23 | 16 | 6 | 132 | 395 | 56.3 | 18.8 | 18.8 | 0
3d dtw | natural | 24 | 15 | 13 | 23 | 90 | 13.3 | 13.3 | 40.0 | 0
3d dtw | natural | 31 | 12 | 11 | 21 | 34 | 16.7 | 8.3 | 54.2 | 0
3d dtw | natural | 32 | 13 | 7 | 21 | 144 | 23.1 | 7.7 | 46.2 | 0
3d dtw | natural | 34 | 18 | 13 | 21 | 32 | 22.2 | 5.6 | 38.9 | 0
3d dtw | natural | 41 | 13 | 13 | 25 | 108 | 7.7 | 7.7 | 65.4 | 1
3d dtw | natural | 42 | 11 | 8 | 21 | 185 | 9.1 | 36.4 | 40.9 | 1
3d dtw | natural | 43 | 16 | 9 | 35 | 119 | 12.5 | 6.3 | 46.9 | 0
3d dtw | natural | 44 | 17 | 12 | 30 | 427 | 0.0 | 0.0 | 55.9 | 0
3d dtw | natural | all | 203 | 144 | 25 | 171 | 13.8 | 21.7 | 46.6 | 8

## grid: ruler
approach | style | pair | n | n ref | cut err med ms | p90 ms | both right % | wrong tone named % | '?' syllables % | wrong with cut > 80 ms off
0 today | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
0 today | textbook | 12 | 15 | 8 | 21 | 43 | 46.7 | 40.0 | 10.0 | 0
0 today | textbook | 13 | 4 | 4 | 28 | 43 | 75.0 | 25.0 | 0.0 | 0
0 today | textbook | 14 | 17 | 16 | 43 | 619 | 76.5 | 17.6 | 11.8 | 2
0 today | textbook | 21 | 11 | 11 | 32 | 53 | 81.8 | 18.2 | 0.0 | 0
0 today | textbook | 22 | 10 | 10 | 21 | 43 | 90.0 | 10.0 | 0.0 | 0
0 today | textbook | 23 | 16 | 13 | 21 | 299 | 62.5 | 31.3 | 3.1 | 2
0 today | textbook | 24 | 17 | 17 | 32 | 64 | 88.2 | 5.9 | 2.9 | 0
0 today | textbook | 31 | 12 | 12 | 21 | 32 | 75.0 | 16.7 | 4.2 | 0
0 today | textbook | 32 | 13 | 11 | 21 | 46 | 84.6 | 7.7 | 3.8 | 0
0 today | textbook | 34 | 18 | 14 | 32 | 128 | 50.0 | 22.2 | 16.7 | 0
0 today | textbook | 41 | 15 | 15 | 21 | 43 | 100.0 | 0.0 | 0.0 | 0
0 today | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
0 today | textbook | 43 | 16 | 14 | 21 | 32 | 56.3 | 43.8 | 0.0 | 1
0 today | textbook | 44 | 17 | 15 | 32 | 43 | 76.5 | 23.5 | 8.8 | 1
0 today | textbook | all | 208 | 184 | 21 | 53 | 76.0 | 18.3 | 4.8 | 6
0 today | natural | 11 | 15 | 5 | 21 | 27 | 0.0 | 0.0 | 83.3 | 0
0 today | natural | 12 | 15 | 5 | 21 | 21 | 0.0 | 13.3 | 80.0 | 0
0 today | natural | 13 | 4 | 2 | 360 | 360 | 0.0 | 25.0 | 75.0 | 1
0 today | natural | 14 | 17 | 6 | 21 | 21 | 0.0 | 5.9 | 79.4 | 0
0 today | natural | 21 | 11 | 2 | 21 | 21 | 0.0 | 9.1 | 90.9 | 0
0 today | natural | 22 | 10 | 6 | 21 | 21 | 30.0 | 30.0 | 50.0 | 0
0 today | natural | 23 | 16 | 5 | 21 | 442 | 12.5 | 37.5 | 53.1 | 2
0 today | natural | 24 | 15 | 7 | 21 | 32 | 0.0 | 13.3 | 70.0 | 0
0 today | natural | 31 | 12 | 9 | 21 | 54 | 8.3 | 8.3 | 58.3 | 0
0 today | natural | 32 | 13 | 6 | 21 | 26 | 15.4 | 0.0 | 61.5 | 0
0 today | natural | 34 | 18 | 8 | 21 | 32 | 11.1 | 0.0 | 72.2 | 0
0 today | natural | 41 | 13 | 5 | 20 | 32 | 0.0 | 7.7 | 76.9 | 0
0 today | natural | 42 | 11 | 7 | 21 | 22 | 36.4 | 0.0 | 45.5 | 0
0 today | natural | 43 | 16 | 8 | 227 | 365 | 6.3 | 43.8 | 53.1 | 4
0 today | natural | 44 | 17 | 7 | 21 | 437 | 0.0 | 5.9 | 73.5 | 0
0 today | natural | all | 203 | 88 | 21 | 227 | 7.4 | 12.8 | 68.5 | 7
1 middle | textbook | 11 | 15 | 15 | 267 | 299 | 86.7 | 13.3 | 0.0 | 2
1 middle | textbook | 12 | 15 | 8 | 245 | 309 | 0.0 | 100.0 | 0.0 | 8
1 middle | textbook | 13 | 4 | 4 | 299 | 299 | 0.0 | 100.0 | 0.0 | 4
1 middle | textbook | 14 | 17 | 16 | 107 | 171 | 94.1 | 0.0 | 2.9 | 0
1 middle | textbook | 21 | 11 | 11 | 213 | 235 | 81.8 | 18.2 | 0.0 | 2
1 middle | textbook | 22 | 10 | 10 | 224 | 288 | 80.0 | 20.0 | 0.0 | 2
1 middle | textbook | 23 | 16 | 13 | 213 | 256 | 43.8 | 56.3 | 0.0 | 7
1 middle | textbook | 24 | 17 | 17 | 107 | 224 | 76.5 | 23.5 | 0.0 | 4
1 middle | textbook | 31 | 12 | 12 | 277 | 373 | 91.7 | 8.3 | 0.0 | 1
1 middle | textbook | 32 | 13 | 11 | 241 | 371 | 30.8 | 7.7 | 30.8 | 1
1 middle | textbook | 34 | 18 | 14 | 149 | 341 | 66.7 | 16.7 | 11.1 | 2
1 middle | textbook | 41 | 15 | 15 | 299 | 363 | 6.7 | 93.3 | 0.0 | 14
1 middle | textbook | 42 | 12 | 9 | 256 | 288 | 100.0 | 0.0 | 0.0 | 0
1 middle | textbook | 43 | 16 | 14 | 235 | 320 | 37.5 | 62.5 | 0.0 | 9
1 middle | textbook | 44 | 17 | 15 | 139 | 565 | 70.6 | 29.4 | 0.0 | 5
1 middle | textbook | all | 208 | 184 | 213 | 320 | 59.6 | 34.6 | 3.1 | 61
1 middle | natural | 11 | 15 | 15 | 267 | 350 | 46.7 | 6.7 | 26.7 | 1
1 middle | natural | 12 | 15 | 6 | 277 | 373 | 0.0 | 100.0 | 3.3 | 6
1 middle | natural | 13 | 4 | 3 | 205 | 306 | 0.0 | 75.0 | 25.0 | 2
1 middle | natural | 14 | 17 | 13 | 213 | 267 | 5.9 | 52.9 | 23.5 | 9
1 middle | natural | 21 | 11 | 9 | 291 | 437 | 45.5 | 45.5 | 18.2 | 4
1 middle | natural | 22 | 10 | 8 | 281 | 358 | 0.0 | 100.0 | 5.0 | 8
1 middle | natural | 23 | 16 | 6 | 288 | 346 | 0.0 | 87.5 | 9.4 | 6
1 middle | natural | 24 | 15 | 13 | 178 | 224 | 60.0 | 13.3 | 13.3 | 1
1 middle | natural | 31 | 12 | 11 | 267 | 331 | 8.3 | 75.0 | 41.7 | 9
1 middle | natural | 32 | 13 | 7 | 288 | 363 | 7.7 | 7.7 | 42.3 | 1
1 middle | natural | 34 | 18 | 13 | 170 | 199 | 33.3 | 66.7 | 2.8 | 9
1 middle | natural | 41 | 13 | 13 | 288 | 309 | 7.7 | 76.9 | 19.2 | 10
1 middle | natural | 42 | 11 | 8 | 257 | 288 | 100.0 | 0.0 | 0.0 | 0
1 middle | natural | 43 | 16 | 9 | 299 | 384 | 0.0 | 87.5 | 6.3 | 9
1 middle | natural | 44 | 17 | 12 | 221 | 288 | 0.0 | 58.8 | 26.5 | 9
1 middle | natural | all | 203 | 146 | 256 | 331 | 20.7 | 56.7 | 17.0 | 84
2 spot | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
2 spot | textbook | 12 | 15 | 8 | 21 | 43 | 60.0 | 40.0 | 0.0 | 0
2 spot | textbook | 13 | 4 | 4 | 39 | 43 | 75.0 | 25.0 | 0.0 | 0
2 spot | textbook | 14 | 17 | 16 | 43 | 85 | 88.2 | 5.9 | 5.9 | 0
2 spot | textbook | 21 | 11 | 11 | 32 | 53 | 81.8 | 18.2 | 0.0 | 0
2 spot | textbook | 22 | 10 | 10 | 21 | 43 | 90.0 | 10.0 | 0.0 | 0
2 spot | textbook | 23 | 16 | 13 | 32 | 65 | 68.8 | 25.0 | 6.3 | 1
2 spot | textbook | 24 | 17 | 17 | 32 | 53 | 94.1 | 5.9 | 0.0 | 0
2 spot | textbook | 31 | 12 | 12 | 21 | 32 | 75.0 | 16.7 | 4.2 | 0
2 spot | textbook | 32 | 13 | 11 | 21 | 58 | 84.6 | 7.7 | 3.8 | 0
2 spot | textbook | 34 | 18 | 14 | 32 | 107 | 55.6 | 27.8 | 11.1 | 0
2 spot | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
2 spot | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
2 spot | textbook | 43 | 16 | 14 | 21 | 32 | 68.8 | 31.3 | 0.0 | 0
2 spot | textbook | 44 | 17 | 15 | 32 | 43 | 82.4 | 17.6 | 5.9 | 0
2 spot | textbook | all | 208 | 184 | 27 | 53 | 80.8 | 15.9 | 2.9 | 1
2 spot | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 6.7 | 46.7 | 0
2 spot | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 66.7 | 50.0 | 0
2 spot | natural | 13 | 4 | 2 | 360 | 360 | 0.0 | 50.0 | 50.0 | 1
2 spot | natural | 14 | 17 | 13 | 25 | 404 | 0.0 | 11.8 | 47.1 | 1
2 spot | natural | 21 | 11 | 9 | 27 | 683 | 0.0 | 9.1 | 54.5 | 0
2 spot | natural | 22 | 10 | 8 | 21 | 32 | 30.0 | 70.0 | 25.0 | 0
2 spot | natural | 23 | 16 | 6 | 300 | 393 | 37.5 | 62.5 | 9.4 | 3
2 spot | natural | 24 | 15 | 13 | 21 | 39 | 6.7 | 13.3 | 43.3 | 0
2 spot | natural | 31 | 12 | 11 | 21 | 34 | 8.3 | 8.3 | 45.8 | 0
2 spot | natural | 32 | 13 | 7 | 21 | 37 | 15.4 | 0.0 | 42.3 | 0
2 spot | natural | 34 | 18 | 13 | 21 | 29 | 11.1 | 22.2 | 38.9 | 0
2 spot | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 15.4 | 38.5 | 0
2 spot | natural | 42 | 11 | 8 | 21 | 206 | 36.4 | 9.1 | 36.4 | 1
2 spot | natural | 43 | 16 | 9 | 21 | 140 | 0.0 | 37.5 | 50.0 | 1
2 spot | natural | 44 | 17 | 12 | 30 | 384 | 0.0 | 5.9 | 50.0 | 0
2 spot | natural | all | 203 | 145 | 22 | 171 | 9.9 | 24.6 | 41.6 | 7
2q spot, else ? | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
2q spot, else ? | textbook | 12 | 15 | 8 | 21 | 43 | 60.0 | 20.0 | 20.0 | 0
2q spot, else ? | textbook | 13 | 4 | 4 | 39 | 43 | 75.0 | 25.0 | 0.0 | 0
2q spot, else ? | textbook | 14 | 17 | 16 | 43 | 85 | 88.2 | 5.9 | 5.9 | 0
2q spot, else ? | textbook | 21 | 11 | 11 | 32 | 53 | 81.8 | 18.2 | 0.0 | 0
2q spot, else ? | textbook | 22 | 10 | 10 | 21 | 43 | 90.0 | 10.0 | 0.0 | 0
2q spot, else ? | textbook | 23 | 16 | 12 | 32 | 65 | 62.5 | 25.0 | 12.5 | 1
2q spot, else ? | textbook | 24 | 17 | 17 | 32 | 53 | 94.1 | 5.9 | 0.0 | 0
2q spot, else ? | textbook | 31 | 12 | 12 | 21 | 32 | 75.0 | 16.7 | 4.2 | 0
2q spot, else ? | textbook | 32 | 13 | 11 | 21 | 58 | 84.6 | 7.7 | 3.8 | 0
2q spot, else ? | textbook | 34 | 18 | 14 | 32 | 107 | 55.6 | 27.8 | 11.1 | 0
2q spot, else ? | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
2q spot, else ? | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
2q spot, else ? | textbook | 43 | 16 | 14 | 21 | 32 | 68.8 | 31.3 | 0.0 | 0
2q spot, else ? | textbook | 44 | 17 | 15 | 32 | 43 | 82.4 | 17.6 | 5.9 | 0
2q spot, else ? | textbook | all | 208 | 183 | 21 | 53 | 80.3 | 14.4 | 4.8 | 1
2q spot, else ? | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 6.7 | 46.7 | 0
2q spot, else ? | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 13.3 | 80.0 | 0
2q spot, else ? | natural | 13 | 4 | 2 | 360 | 360 | 0.0 | 25.0 | 75.0 | 1
2q spot, else ? | natural | 14 | 17 | 12 | 25 | 374 | 0.0 | 5.9 | 55.9 | 0
2q spot, else ? | natural | 21 | 11 | 4 | 32 | 683 | 0.0 | 9.1 | 77.3 | 0
2q spot, else ? | natural | 22 | 10 | 7 | 21 | 28 | 20.0 | 50.0 | 50.0 | 0
2q spot, else ? | natural | 23 | 16 | 4 | 36 | 393 | 25.0 | 18.8 | 59.4 | 1
2q spot, else ? | natural | 24 | 15 | 13 | 21 | 39 | 6.7 | 13.3 | 43.3 | 0
2q spot, else ? | natural | 31 | 12 | 11 | 21 | 34 | 8.3 | 8.3 | 45.8 | 0
2q spot, else ? | natural | 32 | 13 | 7 | 21 | 37 | 15.4 | 0.0 | 53.8 | 0
2q spot, else ? | natural | 34 | 18 | 13 | 21 | 29 | 11.1 | 22.2 | 38.9 | 0
2q spot, else ? | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 15.4 | 38.5 | 0
2q spot, else ? | natural | 42 | 11 | 7 | 21 | 33 | 18.2 | 0.0 | 59.1 | 0
2q spot, else ? | natural | 43 | 16 | 8 | 21 | 35 | 0.0 | 31.3 | 68.8 | 0
2q spot, else ? | natural | 44 | 17 | 12 | 30 | 384 | 0.0 | 5.9 | 52.9 | 0
2q spot, else ? | natural | all | 203 | 134 | 21 | 39 | 7.4 | 14.3 | 55.2 | 2
3 stretch | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
3 stretch | textbook | 12 | 15 | 8 | 21 | 43 | 40.0 | 60.0 | 0.0 | 0
3 stretch | textbook | 13 | 4 | 4 | 39 | 43 | 75.0 | 25.0 | 0.0 | 0
3 stretch | textbook | 14 | 17 | 16 | 43 | 619 | 76.5 | 17.6 | 11.8 | 2
3 stretch | textbook | 21 | 11 | 11 | 21 | 53 | 81.8 | 18.2 | 0.0 | 0
3 stretch | textbook | 22 | 10 | 10 | 21 | 50 | 90.0 | 10.0 | 0.0 | 0
3 stretch | textbook | 23 | 16 | 13 | 43 | 299 | 56.3 | 37.5 | 6.3 | 2
3 stretch | textbook | 24 | 17 | 17 | 32 | 203 | 88.2 | 5.9 | 2.9 | 0
3 stretch | textbook | 31 | 12 | 12 | 21 | 75 | 66.7 | 16.7 | 8.3 | 0
3 stretch | textbook | 32 | 13 | 11 | 21 | 58 | 84.6 | 7.7 | 3.8 | 1
3 stretch | textbook | 34 | 18 | 14 | 32 | 128 | 55.6 | 16.7 | 16.7 | 0
3 stretch | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
3 stretch | textbook | 42 | 12 | 9 | 21 | 118 | 100.0 | 0.0 | 0.0 | 0
3 stretch | textbook | 43 | 16 | 14 | 32 | 75 | 68.8 | 31.3 | 0.0 | 1
3 stretch | textbook | 44 | 17 | 15 | 32 | 70 | 70.6 | 29.4 | 8.8 | 1
3 stretch | textbook | all | 208 | 184 | 32 | 75 | 75.5 | 19.2 | 4.6 | 7
3 stretch | natural | 11 | 15 | 15 | 22 | 33 | 0.0 | 6.7 | 50.0 | 0
3 stretch | natural | 12 | 15 | 6 | 21 | 54 | 0.0 | 73.3 | 53.3 | 0
3 stretch | natural | 13 | 4 | 3 | 24 | 171 | 0.0 | 50.0 | 62.5 | 0
3 stretch | natural | 14 | 17 | 13 | 96 | 405 | 0.0 | 41.2 | 50.0 | 5
3 stretch | natural | 21 | 11 | 7 | 29 | 693 | 0.0 | 18.2 | 59.1 | 0
3 stretch | natural | 22 | 10 | 8 | 32 | 124 | 40.0 | 60.0 | 15.0 | 0
3 stretch | natural | 23 | 16 | 6 | 36 | 373 | 43.8 | 50.0 | 21.9 | 2
3 stretch | natural | 24 | 15 | 13 | 21 | 154 | 6.7 | 13.3 | 43.3 | 0
3 stretch | natural | 31 | 12 | 11 | 21 | 84 | 8.3 | 16.7 | 41.7 | 1
3 stretch | natural | 32 | 13 | 7 | 21 | 59 | 7.7 | 0.0 | 46.2 | 0
3 stretch | natural | 34 | 18 | 13 | 21 | 68 | 22.2 | 11.1 | 36.1 | 0
3 stretch | natural | 41 | 13 | 13 | 26 | 39 | 0.0 | 30.8 | 34.6 | 1
3 stretch | natural | 42 | 11 | 8 | 21 | 206 | 36.4 | 18.2 | 27.3 | 1
3 stretch | natural | 43 | 16 | 9 | 27 | 97 | 0.0 | 25.0 | 56.3 | 1
3 stretch | natural | 44 | 17 | 12 | 30 | 437 | 0.0 | 5.9 | 47.1 | 0
3 stretch | natural | all | 203 | 144 | 25 | 154 | 10.8 | 26.6 | 42.6 | 11
R oracle (ref cut) | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
R oracle (ref cut) | textbook | 12 | 15 | 8 | 21 | 43 | 40.0 | 13.3 | 46.7 | 0
R oracle (ref cut) | textbook | 13 | 4 | 4 | 39 | 43 | 75.0 | 25.0 | 0.0 | 0
R oracle (ref cut) | textbook | 14 | 17 | 16 | 32 | 53 | 82.4 | 5.9 | 11.8 | 0
R oracle (ref cut) | textbook | 21 | 11 | 11 | 21 | 53 | 81.8 | 18.2 | 0.0 | 0
R oracle (ref cut) | textbook | 22 | 10 | 10 | 21 | 43 | 90.0 | 10.0 | 0.0 | 0
R oracle (ref cut) | textbook | 23 | 16 | 13 | 21 | 43 | 50.0 | 25.0 | 21.9 | 0
R oracle (ref cut) | textbook | 24 | 17 | 17 | 32 | 53 | 94.1 | 5.9 | 0.0 | 0
R oracle (ref cut) | textbook | 31 | 12 | 12 | 21 | 32 | 75.0 | 16.7 | 4.2 | 0
R oracle (ref cut) | textbook | 32 | 13 | 11 | 21 | 35 | 76.9 | 7.7 | 15.4 | 0
R oracle (ref cut) | textbook | 34 | 18 | 14 | 32 | 85 | 50.0 | 22.2 | 25.0 | 0
R oracle (ref cut) | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
R oracle (ref cut) | textbook | 42 | 12 | 9 | 21 | 32 | 75.0 | 0.0 | 25.0 | 0
R oracle (ref cut) | textbook | 43 | 16 | 14 | 21 | 32 | 62.5 | 25.0 | 12.5 | 0
R oracle (ref cut) | textbook | 44 | 17 | 15 | 32 | 43 | 70.6 | 17.6 | 17.6 | 0
R oracle (ref cut) | textbook | all | 208 | 184 | 21 | 43 | 73.6 | 13.0 | 13.2 | 0
R oracle (ref cut) | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 6.7 | 46.7 | 0
R oracle (ref cut) | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 6.7 | 83.3 | 0
R oracle (ref cut) | natural | 13 | 4 | 3 | 18 | 24 | 0.0 | 50.0 | 62.5 | 0
R oracle (ref cut) | natural | 14 | 17 | 13 | 23 | 33 | 0.0 | 29.4 | 61.8 | 0
R oracle (ref cut) | natural | 21 | 11 | 8 | 27 | 32 | 0.0 | 18.2 | 63.6 | 0
R oracle (ref cut) | natural | 22 | 10 | 8 | 21 | 32 | 30.0 | 50.0 | 40.0 | 0
R oracle (ref cut) | natural | 23 | 16 | 5 | 30 | 36 | 18.8 | 12.5 | 71.9 | 0
R oracle (ref cut) | natural | 24 | 15 | 13 | 21 | 37 | 0.0 | 13.3 | 53.3 | 0
R oracle (ref cut) | natural | 31 | 12 | 11 | 21 | 32 | 8.3 | 16.7 | 50.0 | 0
R oracle (ref cut) | natural | 32 | 13 | 7 | 21 | 37 | 15.4 | 0.0 | 65.4 | 0
R oracle (ref cut) | natural | 34 | 18 | 13 | 21 | 29 | 16.7 | 0.0 | 55.6 | 0
R oracle (ref cut) | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 15.4 | 38.5 | 0
R oracle (ref cut) | natural | 42 | 11 | 8 | 21 | 33 | 27.3 | 0.0 | 50.0 | 0
R oracle (ref cut) | natural | 43 | 16 | 9 | 21 | 35 | 6.3 | 25.0 | 68.8 | 0
R oracle (ref cut) | natural | 44 | 17 | 10 | 21 | 30 | 0.0 | 5.9 | 67.6 | 0
R oracle (ref cut) | natural | all | 203 | 142 | 21 | 32 | 8.4 | 14.3 | 59.4 | 0
3d dtw | textbook | 11 | 15 | 15 | 43 | 149 | 93.3 | 6.7 | 0.0 | 0
3d dtw | textbook | 12 | 15 | 8 | 21 | 43 | 40.0 | 60.0 | 0.0 | 0
3d dtw | textbook | 13 | 4 | 4 | 43 | 57 | 75.0 | 25.0 | 0.0 | 0
3d dtw | textbook | 14 | 17 | 16 | 43 | 619 | 76.5 | 17.6 | 11.8 | 2
3d dtw | textbook | 21 | 11 | 11 | 32 | 53 | 81.8 | 18.2 | 0.0 | 0
3d dtw | textbook | 22 | 10 | 10 | 21 | 114 | 90.0 | 10.0 | 0.0 | 1
3d dtw | textbook | 23 | 16 | 13 | 43 | 299 | 68.8 | 25.0 | 3.1 | 2
3d dtw | textbook | 24 | 17 | 17 | 32 | 106 | 88.2 | 5.9 | 2.9 | 0
3d dtw | textbook | 31 | 12 | 12 | 21 | 102 | 83.3 | 8.3 | 4.2 | 0
3d dtw | textbook | 32 | 13 | 11 | 21 | 58 | 84.6 | 7.7 | 3.8 | 1
3d dtw | textbook | 34 | 18 | 14 | 32 | 128 | 44.4 | 22.2 | 19.4 | 0
3d dtw | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
3d dtw | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
3d dtw | textbook | 43 | 16 | 14 | 21 | 32 | 62.5 | 37.5 | 0.0 | 1
3d dtw | textbook | 44 | 17 | 15 | 32 | 58 | 76.5 | 23.5 | 8.8 | 1
3d dtw | textbook | all | 208 | 184 | 32 | 96 | 76.4 | 18.3 | 4.3 | 8
3d dtw | natural | 11 | 15 | 15 | 32 | 164 | 6.7 | 6.7 | 43.3 | 1
3d dtw | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 66.7 | 46.7 | 0
3d dtw | natural | 13 | 4 | 3 | 24 | 171 | 0.0 | 50.0 | 62.5 | 0
3d dtw | natural | 14 | 17 | 13 | 29 | 364 | 0.0 | 47.1 | 50.0 | 3
3d dtw | natural | 21 | 11 | 7 | 27 | 736 | 0.0 | 18.2 | 59.1 | 0
3d dtw | natural | 22 | 10 | 8 | 32 | 118 | 50.0 | 50.0 | 15.0 | 1
3d dtw | natural | 23 | 16 | 6 | 132 | 395 | 56.3 | 37.5 | 15.6 | 1
3d dtw | natural | 24 | 15 | 13 | 23 | 90 | 6.7 | 20.0 | 40.0 | 0
3d dtw | natural | 31 | 12 | 11 | 21 | 34 | 16.7 | 8.3 | 41.7 | 0
3d dtw | natural | 32 | 13 | 7 | 21 | 144 | 15.4 | 0.0 | 50.0 | 0
3d dtw | natural | 34 | 18 | 13 | 21 | 32 | 16.7 | 0.0 | 41.7 | 0
3d dtw | natural | 41 | 13 | 13 | 25 | 108 | 15.4 | 15.4 | 34.6 | 0
3d dtw | natural | 42 | 11 | 8 | 21 | 185 | 9.1 | 27.3 | 40.9 | 1
3d dtw | natural | 43 | 16 | 9 | 35 | 119 | 6.3 | 18.8 | 46.9 | 1
3d dtw | natural | 44 | 17 | 12 | 30 | 427 | 0.0 | 0.0 | 55.9 | 0
3d dtw | natural | all | 203 | 144 | 25 | 171 | 13.3 | 22.7 | 42.4 | 8
```

## Today vs shipped (cut49ship.mjs --pairs)

```
grid | way | style | pair | n | n ref | cut err med ms | p90 | both right % | wrong tone named % | '?' syllables % | wrong with cut > 80 ms off
old | today (46 finder) | textbook | 11 | 15 | 0 | — | — | 93.3 | 6.7 | 0.0 | 0
old | today (46 finder) | textbook | 12 | 15 | 0 | — | — | 46.7 | 46.7 | 10.0 | 0
old | today (46 finder) | textbook | 13 | 4 | 0 | — | — | 100.0 | 0.0 | 0.0 | 0
old | today (46 finder) | textbook | 14 | 17 | 0 | — | — | 76.5 | 17.6 | 11.8 | 0
old | today (46 finder) | textbook | 21 | 11 | 0 | — | — | 81.8 | 18.2 | 0.0 | 0
old | today (46 finder) | textbook | 22 | 10 | 0 | — | — | 80.0 | 20.0 | 0.0 | 0
old | today (46 finder) | textbook | 23 | 16 | 0 | — | — | 68.8 | 31.3 | 0.0 | 0
old | today (46 finder) | textbook | 24 | 17 | 0 | — | — | 88.2 | 5.9 | 2.9 | 0
old | today (46 finder) | textbook | 31 | 12 | 0 | — | — | 91.7 | 0.0 | 4.2 | 0
old | today (46 finder) | textbook | 32 | 13 | 0 | — | — | 92.3 | 7.7 | 0.0 | 0
old | today (46 finder) | textbook | 34 | 18 | 0 | — | — | 72.2 | 0.0 | 16.7 | 0
old | today (46 finder) | textbook | 41 | 15 | 0 | — | — | 100.0 | 0.0 | 0.0 | 0
old | today (46 finder) | textbook | 42 | 12 | 0 | — | — | 100.0 | 0.0 | 0.0 | 0
old | today (46 finder) | textbook | 43 | 16 | 0 | — | — | 68.8 | 12.5 | 9.4 | 0
old | today (46 finder) | textbook | 44 | 17 | 0 | — | — | 76.5 | 23.5 | 8.8 | 0
old | today (46 finder) | textbook | all | 208 | 0 | — | — | 80.8 | 13.5 | 5.0 | 0
old | today (46 finder) | natural | 11 | 15 | 0 | — | — | 0.0 | 0.0 | 83.3 | 0
old | today (46 finder) | natural | 12 | 15 | 0 | — | — | 0.0 | 13.3 | 80.0 | 0
old | today (46 finder) | natural | 13 | 4 | 0 | — | — | 0.0 | 25.0 | 75.0 | 0
old | today (46 finder) | natural | 14 | 17 | 0 | — | — | 0.0 | 5.9 | 79.4 | 0
old | today (46 finder) | natural | 21 | 11 | 0 | — | — | 0.0 | 9.1 | 90.9 | 0
old | today (46 finder) | natural | 22 | 10 | 0 | — | — | 30.0 | 30.0 | 55.0 | 0
old | today (46 finder) | natural | 23 | 16 | 0 | — | — | 12.5 | 31.3 | 56.3 | 0
old | today (46 finder) | natural | 24 | 15 | 0 | — | — | 0.0 | 13.3 | 70.0 | 0
old | today (46 finder) | natural | 31 | 12 | 0 | — | — | 8.3 | 8.3 | 62.5 | 0
old | today (46 finder) | natural | 32 | 13 | 0 | — | — | 23.1 | 0.0 | 57.7 | 0
old | today (46 finder) | natural | 34 | 18 | 0 | — | — | 16.7 | 0.0 | 69.4 | 0
old | today (46 finder) | natural | 41 | 13 | 0 | — | — | 7.7 | 0.0 | 80.8 | 0
old | today (46 finder) | natural | 42 | 11 | 0 | — | — | 36.4 | 0.0 | 45.5 | 0
old | today (46 finder) | natural | 43 | 16 | 0 | — | — | 6.3 | 12.5 | 65.6 | 0
old | today (46 finder) | natural | 44 | 17 | 0 | — | — | 0.0 | 5.9 | 73.5 | 0
old | today (46 finder) | natural | all | 203 | 0 | — | — | 8.9 | 9.4 | 70.0 | 0
old | shipped (49) | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
old | shipped (49) | textbook | 12 | 15 | 8 | 21 | 43 | 60.0 | 13.3 | 23.3 | 0
old | shipped (49) | textbook | 13 | 4 | 4 | 39 | 43 | 100.0 | 0.0 | 0.0 | 0
old | shipped (49) | textbook | 14 | 17 | 16 | 43 | 96 | 94.1 | 0.0 | 2.9 | 0
old | shipped (49) | textbook | 21 | 11 | 11 | 32 | 53 | 90.9 | 9.1 | 0.0 | 0
old | shipped (49) | textbook | 22 | 10 | 10 | 21 | 43 | 80.0 | 20.0 | 0.0 | 0
old | shipped (49) | textbook | 23 | 16 | 9 | 32 | 65 | 62.5 | 12.5 | 25.0 | 0
old | shipped (49) | textbook | 24 | 17 | 16 | 32 | 53 | 82.4 | 11.8 | 5.9 | 0
old | shipped (49) | textbook | 31 | 12 | 12 | 21 | 32 | 83.3 | 8.3 | 4.2 | 0
old | shipped (49) | textbook | 32 | 13 | 11 | 21 | 58 | 100.0 | 0.0 | 0.0 | 0
old | shipped (49) | textbook | 34 | 18 | 14 | 32 | 128 | 83.3 | 11.1 | 5.6 | 1
old | shipped (49) | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
old | shipped (49) | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
old | shipped (49) | textbook | 43 | 16 | 14 | 21 | 32 | 93.8 | 6.3 | 0.0 | 0
old | shipped (49) | textbook | 44 | 17 | 15 | 32 | 608 | 94.1 | 5.9 | 0.0 | 0
old | shipped (49) | textbook | all | 208 | 179 | 32 | 58 | 87.0 | 7.2 | 5.0 | 1
old | shipped (49) | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 0.0 | 53.3 | 0
old | shipped (49) | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 13.3 | 80.0 | 0
old | shipped (49) | natural | 13 | 4 | 0 | — | — | 0.0 | 0.0 | 100.0 | 0
old | shipped (49) | natural | 14 | 17 | 12 | 29 | 374 | 0.0 | 0.0 | 61.8 | 0
old | shipped (49) | natural | 21 | 11 | 4 | 32 | 683 | 9.1 | 0.0 | 72.7 | 0
old | shipped (49) | natural | 22 | 10 | 5 | 21 | 28 | 20.0 | 30.0 | 60.0 | 0
old | shipped (49) | natural | 23 | 16 | 4 | 36 | 393 | 18.8 | 18.8 | 65.6 | 1
old | shipped (49) | natural | 24 | 15 | 13 | 21 | 39 | 0.0 | 6.7 | 50.0 | 0
old | shipped (49) | natural | 31 | 12 | 9 | 21 | 43 | 8.3 | 0.0 | 62.5 | 0
old | shipped (49) | natural | 32 | 13 | 7 | 21 | 37 | 23.1 | 0.0 | 42.3 | 0
old | shipped (49) | natural | 34 | 18 | 12 | 21 | 26 | 22.2 | 11.1 | 41.7 | 0
old | shipped (49) | natural | 41 | 13 | 13 | 25 | 31 | 15.4 | 0.0 | 65.4 | 0
old | shipped (49) | natural | 42 | 11 | 7 | 21 | 33 | 18.2 | 0.0 | 59.1 | 0
old | shipped (49) | natural | 43 | 16 | 8 | 21 | 35 | 0.0 | 12.5 | 71.9 | 0
old | shipped (49) | natural | 44 | 17 | 12 | 30 | 384 | 0.0 | 5.9 | 50.0 | 0
old | shipped (49) | natural | all | 203 | 127 | 21 | 39 | 8.9 | 6.9 | 60.1 | 1
ruler | today (46 finder) | textbook | 11 | 15 | 0 | — | — | 93.3 | 6.7 | 0.0 | 0
ruler | today (46 finder) | textbook | 12 | 15 | 0 | — | — | 46.7 | 40.0 | 10.0 | 0
ruler | today (46 finder) | textbook | 13 | 4 | 0 | — | — | 75.0 | 25.0 | 0.0 | 0
ruler | today (46 finder) | textbook | 14 | 17 | 0 | — | — | 76.5 | 17.6 | 11.8 | 0
ruler | today (46 finder) | textbook | 21 | 11 | 0 | — | — | 81.8 | 18.2 | 0.0 | 0
ruler | today (46 finder) | textbook | 22 | 10 | 0 | — | — | 90.0 | 10.0 | 0.0 | 0
ruler | today (46 finder) | textbook | 23 | 16 | 0 | — | — | 62.5 | 31.3 | 3.1 | 0
ruler | today (46 finder) | textbook | 24 | 17 | 0 | — | — | 88.2 | 5.9 | 2.9 | 0
ruler | today (46 finder) | textbook | 31 | 12 | 0 | — | — | 75.0 | 16.7 | 4.2 | 0
ruler | today (46 finder) | textbook | 32 | 13 | 0 | — | — | 84.6 | 7.7 | 3.8 | 0
ruler | today (46 finder) | textbook | 34 | 18 | 0 | — | — | 50.0 | 22.2 | 16.7 | 0
ruler | today (46 finder) | textbook | 41 | 15 | 0 | — | — | 100.0 | 0.0 | 0.0 | 0
ruler | today (46 finder) | textbook | 42 | 12 | 0 | — | — | 100.0 | 0.0 | 0.0 | 0
ruler | today (46 finder) | textbook | 43 | 16 | 0 | — | — | 56.3 | 43.8 | 0.0 | 0
ruler | today (46 finder) | textbook | 44 | 17 | 0 | — | — | 76.5 | 23.5 | 8.8 | 0
ruler | today (46 finder) | textbook | all | 208 | 0 | — | — | 76.0 | 18.3 | 4.8 | 0
ruler | today (46 finder) | natural | 11 | 15 | 0 | — | — | 0.0 | 0.0 | 83.3 | 0
ruler | today (46 finder) | natural | 12 | 15 | 0 | — | — | 0.0 | 13.3 | 80.0 | 0
ruler | today (46 finder) | natural | 13 | 4 | 0 | — | — | 0.0 | 25.0 | 75.0 | 0
ruler | today (46 finder) | natural | 14 | 17 | 0 | — | — | 0.0 | 5.9 | 79.4 | 0
ruler | today (46 finder) | natural | 21 | 11 | 0 | — | — | 0.0 | 9.1 | 90.9 | 0
ruler | today (46 finder) | natural | 22 | 10 | 0 | — | — | 30.0 | 30.0 | 50.0 | 0
ruler | today (46 finder) | natural | 23 | 16 | 0 | — | — | 12.5 | 37.5 | 53.1 | 0
ruler | today (46 finder) | natural | 24 | 15 | 0 | — | — | 0.0 | 13.3 | 70.0 | 0
ruler | today (46 finder) | natural | 31 | 12 | 0 | — | — | 8.3 | 8.3 | 58.3 | 0
ruler | today (46 finder) | natural | 32 | 13 | 0 | — | — | 15.4 | 0.0 | 61.5 | 0
ruler | today (46 finder) | natural | 34 | 18 | 0 | — | — | 11.1 | 0.0 | 72.2 | 0
ruler | today (46 finder) | natural | 41 | 13 | 0 | — | — | 0.0 | 7.7 | 76.9 | 0
ruler | today (46 finder) | natural | 42 | 11 | 0 | — | — | 36.4 | 0.0 | 45.5 | 0
ruler | today (46 finder) | natural | 43 | 16 | 0 | — | — | 6.3 | 43.8 | 53.1 | 0
ruler | today (46 finder) | natural | 44 | 17 | 0 | — | — | 0.0 | 5.9 | 73.5 | 0
ruler | today (46 finder) | natural | all | 203 | 0 | — | — | 7.4 | 12.8 | 68.5 | 0
ruler | shipped (49) | textbook | 11 | 15 | 15 | 32 | 53 | 93.3 | 6.7 | 0.0 | 0
ruler | shipped (49) | textbook | 12 | 15 | 8 | 21 | 43 | 60.0 | 20.0 | 20.0 | 0
ruler | shipped (49) | textbook | 13 | 4 | 4 | 39 | 43 | 75.0 | 25.0 | 0.0 | 0
ruler | shipped (49) | textbook | 14 | 17 | 16 | 43 | 96 | 94.1 | 0.0 | 2.9 | 0
ruler | shipped (49) | textbook | 21 | 11 | 11 | 32 | 53 | 81.8 | 9.1 | 4.5 | 0
ruler | shipped (49) | textbook | 22 | 10 | 10 | 21 | 43 | 90.0 | 10.0 | 0.0 | 0
ruler | shipped (49) | textbook | 23 | 16 | 9 | 32 | 65 | 62.5 | 12.5 | 28.1 | 0
ruler | shipped (49) | textbook | 24 | 17 | 16 | 32 | 53 | 88.2 | 5.9 | 5.9 | 0
ruler | shipped (49) | textbook | 31 | 12 | 12 | 21 | 32 | 66.7 | 25.0 | 4.2 | 0
ruler | shipped (49) | textbook | 32 | 13 | 11 | 21 | 58 | 84.6 | 7.7 | 3.8 | 0
ruler | shipped (49) | textbook | 34 | 18 | 14 | 32 | 128 | 61.1 | 33.3 | 5.6 | 1
ruler | shipped (49) | textbook | 41 | 15 | 15 | 31 | 43 | 100.0 | 0.0 | 0.0 | 0
ruler | shipped (49) | textbook | 42 | 12 | 9 | 21 | 32 | 100.0 | 0.0 | 0.0 | 0
ruler | shipped (49) | textbook | 43 | 16 | 14 | 21 | 32 | 68.8 | 31.3 | 0.0 | 0
ruler | shipped (49) | textbook | 44 | 17 | 15 | 32 | 608 | 94.1 | 5.9 | 0.0 | 0
ruler | shipped (49) | textbook | all | 208 | 179 | 32 | 58 | 81.3 | 12.5 | 5.5 | 1
ruler | shipped (49) | natural | 11 | 15 | 15 | 21 | 30 | 0.0 | 0.0 | 50.0 | 0
ruler | shipped (49) | natural | 12 | 15 | 6 | 21 | 32 | 0.0 | 20.0 | 80.0 | 0
ruler | shipped (49) | natural | 13 | 4 | 0 | — | — | 0.0 | 0.0 | 100.0 | 0
ruler | shipped (49) | natural | 14 | 17 | 12 | 29 | 374 | 0.0 | 0.0 | 61.8 | 0
ruler | shipped (49) | natural | 21 | 11 | 4 | 32 | 683 | 9.1 | 0.0 | 72.7 | 0
ruler | shipped (49) | natural | 22 | 10 | 5 | 21 | 28 | 20.0 | 30.0 | 60.0 | 0
ruler | shipped (49) | natural | 23 | 16 | 4 | 36 | 393 | 18.8 | 18.8 | 62.5 | 1
ruler | shipped (49) | natural | 24 | 15 | 13 | 21 | 39 | 0.0 | 6.7 | 50.0 | 0
ruler | shipped (49) | natural | 31 | 12 | 9 | 21 | 43 | 8.3 | 0.0 | 58.3 | 0
ruler | shipped (49) | natural | 32 | 13 | 7 | 21 | 37 | 15.4 | 0.0 | 46.2 | 0
ruler | shipped (49) | natural | 34 | 18 | 12 | 21 | 26 | 16.7 | 11.1 | 44.4 | 0
ruler | shipped (49) | natural | 41 | 13 | 13 | 25 | 31 | 7.7 | 15.4 | 38.5 | 0
ruler | shipped (49) | natural | 42 | 11 | 7 | 21 | 33 | 18.2 | 0.0 | 59.1 | 0
ruler | shipped (49) | natural | 43 | 16 | 8 | 21 | 35 | 0.0 | 31.3 | 71.9 | 0
ruler | shipped (49) | natural | 44 | 17 | 12 | 30 | 384 | 0.0 | 0.0 | 52.9 | 0
ruler | shipped (49) | natural | all | 203 | 127 | 21 | 39 | 7.4 | 9.4 | 58.4 | 1
```
