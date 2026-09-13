##Task: Mobile "make it feel like a game" pass + browserhint UI

##Goal: 
1. Make FlappyTone feel bigger, punchier, and more game-like on mobile — more engaging at first glance — without changing the brand identity. Amplify scale and feedback; keep the palette, typography family, and overall FlappyTone aesthetic. Do NOT copy a generic gamified look.
2. improve the browserhint UI to be a modal overlay that will include a video.

Scope — these screens only (mobile first):

Play / home screen — the first impression.
In-game — the score and live feedback.
Game-over — the shareable moment.
Leaderboard — currently too small/cramped.
Browserhint.tsx

##What to do (scale + energy, in the existing design language):

Increase the size and visual weight of the key numbers — live score, final score, streak, leaderboard ranks. These should be big and confident.
Larger tap targets and primary buttons (Play, Share, Join board) — thumb-friendly, mobile-first.
Give game-over and high-score moments more presence (bigger result card, stronger hierarchy) — coordinate with the confetti/celebration already added in P1, don't duplicate it.
Leaderboard: bigger rows, clearer rank/name/score hierarchy, more breathing room; make "you're #N" prominent.
More generous spacing and larger headings on the Play screen so it reads as a game, not a utility.

##Hard constraints:

Keep the FlappyTone palette, fonts, and character — this is scaling and hierarchy, not a restyle.
Do not touch gameplay logic, the game canvas/rendering, audio, scoring, or the tier/gating code. Presentation/CSS/layout only.
No new dependencies or UI libraries.
Must stay responsive — verify at small mobile widths (≤375px) and that nothing overflows or clips; desktop must not regress.
Respect existing theme/tokens; adjust the scale tokens rather than hardcoding one-off sizes where possible.

##Browserhint
Currently, it shows as a small banner on top of the screen. We need to improve the UI and the behavior.

1. When we're on chrome/firefox iOS, it should appear as a big modal (we really need to steer people to safari or PWA), saying that the game behaves better on Safari or PWA
2. On safari, we can keep a nudge on top of the screen, with a link in the text "add to Home screen" that leads to opening a modal overlay with the small video instruction.



Done when: on a phone, the four screens read noticeably bigger and more game-like, the FlappyTone identity is intact, and nothing overflows on small screens or regresses on desktop. Typecheck + tests green.