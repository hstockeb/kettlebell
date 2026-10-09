# 🔔 Kettlebell Coach

A simple web app to guide and track kettlebell training with one 25 lb (11 kg) kettlebell. It is designed to be friendly to a lower back with a past disc problem.

**Features**
- **Daily workout suggestion.** It rotates exercises so you don't repeat the same session every day.
- **Animated stick figures** for every exercise, plus step-by-step instructions, common mistakes, a back-safety tip and a YouTube link.
- **Guided workout player** with a rep counter, work and rest timers, beeps and a screen that stays awake.
- **Back check-in** before each workout. If your back is stiff or sore, it suggests a gentle back-care session.
- **History** with a 12-week calendar, a week streak and total minutes.
- **Works offline** and can be installed to your phone's home screen.
- **Your data stays in your browser**, with Export/Import buttons for backups.

## The program

| Phase | Frequency | What |
|---|---|---|
| **1 · Foundation** (weeks 1–3) | 3×/week (Mon/Wed/Fri by default) | Alternating Workout A (hinge & squat) and B (push, pull & carry). Week 1: 2 sets to learn the movements; week 2: 3 sets, swings added; week 3: more reps, shorter rests. |
| **2 · Daily** (week 4+) | Every day, ~20 min | Rotates Lower → Upper → Swing EMOM → Full-body → Mobility & Back Care. Exercises are shuffled to avoid repeating the last session. Work/rest gets harder as you go (30/30 → 40/20 → 45/15). |

Every session includes back-friendly core work (bird dog, dead bug, side plank, glute bridge). Exercises that load a sensitive spine in flexion or rotation (sit-ups, Russian twists, windmills, American swings) are left out on purpose.

> General fitness guidance, not medical advice. Stop if you feel sharp pain, pain down the leg, numbness or tingling.

## Run it

No build step is needed. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Publish on GitHub Pages

1. Merge this code into `main`.
2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: `main`**, **Folder: `/ (root)`**, then click **Save**.
4. After about a minute the app is live at `https://<your-username>.github.io/kettlebell/`.
5. On your phone, open the link. Use **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android).

## Files

```
index.html            app shell
css/style.css         styles (light/dark)
js/app.js             screens, workout player, storage
js/program.js         Phase 1 / Phase 2 workout generator
js/exercises.js       exercise library + animation poses
js/figure.js          stick-figure animation engine
sw.js                 offline cache
```
