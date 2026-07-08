/* =========================================================================
 * data.js — static program definition for Bodyweight Rebuild
 *
 * Everything that describes the 6-week program lives here:
 *   - EXERCISES  : the exercise library (cues, mistakes, variations, ROM)
 *   - WORKOUTS   : the weekly routine templates (Wed → Tue cycle)
 *   - BADGES     : push-up milestones + achievement badges
 *   - seedState(): first-run state including the completed Week 1 Push + Core
 *
 * To customize the program, edit this file only — the store, progression
 * engine and UI all read from these structures.
 * ========================================================================= */

export const PROGRAM_WEEKS = 6;
export const PUSHUP_GOAL = 50;
export const PUSHUP_BASELINE = 12;
/** Push-up tests happen on the Push + Core day of these weeks (1-indexed). */
export const TEST_WEEKS = [1, 3, 5];

/* ---- exercise library ---------------------------------------------------
 * kind: 'reps' | 'time' (seconds) — perSide marks "per leg / per side" work.
 * Every entry carries the full library contract: description, muscles,
 * cues, mistakes, easier, harder, rom.
 * ------------------------------------------------------------------------ */
export const EXERCISES = {
  /* ---------------- push + core ---------------- */
  'pushup': {
    name: 'Push-up', kind: 'reps',
    muscles: ['Chest', 'Triceps', 'Front delts', 'Core'],
    description: 'The backbone of this program. A moving plank: hands under shoulders, body in one rigid line from head to heels, chest to the floor and back up.',
    cues: ['Full-body plank — squeeze glutes and quads', 'Chest moves as one unit with hips', 'Lower under control', 'Stop before form breaks', 'Use full ROM — chest near the floor'],
    mistakes: ['Sagging hips', 'Flared elbows past 60°', 'Half reps', 'Head pecking forward'],
    easier: 'Incline push-up (hands on bench or wall)',
    harder: 'Feet-elevated push-up or slow 3-1-1 tempo',
    rom: 'Chest brushes the floor at the bottom; elbows fully locked at the top.',
  },
  'pike-pushup': {
    name: 'Pike push-up', kind: 'reps',
    muscles: ['Shoulders', 'Triceps', 'Upper chest'],
    description: 'A push-up performed in an inverted V. Shifts load onto the shoulders — the bodyweight cousin of the overhead press.',
    cues: ['Hips high', 'Head travels forward and down', 'Press through shoulders', 'Keep control'],
    mistakes: ['Turning it into a normal push-up by dropping hips', 'Bending knees excessively', 'Craning the neck'],
    easier: 'Pike push-up with hands elevated on a bench',
    harder: 'Feet-elevated pike push-up',
    rom: 'Crown of the head lightly touches the floor between the hands.',
  },
  'bench-dip': {
    name: 'Bench dip', kind: 'reps',
    muscles: ['Triceps', 'Chest', 'Front delts'],
    description: 'Hands on a bench or chair behind you, legs out front. Bend the elbows to lower the hips, press back up.',
    cues: ['Shoulders down, away from ears', 'Elbows track straight back', 'Chest proud', 'Smooth tempo'],
    mistakes: ['Shrugging shoulders at the bottom', 'Bouncing out of the hole', 'Tiny partial reps'],
    easier: 'Bend knees / walk feet closer',
    harder: 'Straight legs elevated on a second chair',
    rom: 'Upper arm reaches parallel to the floor — deeper only if shoulders stay happy.',
  },
  'slow-pushup': {
    name: 'Slow tempo push-up', kind: 'reps',
    muscles: ['Chest', 'Triceps', 'Core'],
    description: 'A push-up with a deliberate 3-second lower and controlled press. Time under tension for hypertrophy and bulletproof form.',
    cues: ['Count 3 full seconds down', 'No pause-and-drop — constant speed', 'Explode up with tight form', 'Same plank rules as regular push-ups'],
    mistakes: ['Speeding up the last reps', 'Cutting depth as fatigue builds'],
    easier: 'Incline slow push-up',
    harder: 'Add a 2-second pause at the bottom',
    rom: 'Identical to the push-up — full depth is the whole point of going slow.',
  },
  'plank': {
    name: 'Plank', kind: 'time',
    muscles: ['Core', 'Shoulders', 'Glutes'],
    description: 'Forearm hold with the body in one straight line. Builds the rigid trunk your push-ups depend on.',
    cues: ['Glutes and quads squeezed', 'Ribs down — no arch', 'Push the floor away through forearms', 'Breathe steadily'],
    mistakes: ['Hips sagging or piked', 'Holding breath', 'Collapsing between shoulder blades'],
    easier: 'Knee plank or incline plank',
    harder: 'Plank with slow alternating shoulder taps',
    rom: 'Not a range exercise — quality is a perfectly straight hip line, start to finish.',
  },
  'side-plank': {
    name: 'Side plank', kind: 'time', perSide: true,
    muscles: ['Obliques', 'Glute med', 'Shoulders'],
    description: 'Lateral hold on one forearm. Trains the lateral core and hip stability that keep your running gait solid.',
    cues: ['Straight line ear-to-ankle', 'Push tall through the shoulder', 'Top hip stacked, lifted high', 'Neck neutral'],
    mistakes: ['Hips drooping toward the floor', 'Rolling the chest forward', 'Sinking into the shoulder'],
    easier: 'Knees-bent side plank',
    harder: 'Feet stacked with top-leg raise',
    rom: 'Lift the hips slightly higher than neutral — own the top of the movement.',
  },
  /* ---------------- push warm-up ---------------- */
  'arm-circles': {
    name: 'Arm circles', kind: 'reps',
    muscles: ['Shoulders', 'Rotator cuff'],
    description: 'Big controlled circles, both directions, to wake up the shoulder joint.',
    cues: ['Start small, grow the circle', 'Both directions', 'Stay tall'],
    mistakes: ['Rushing tiny circles', 'Shrugging'],
    easier: 'Smaller circles', harder: 'Slow maximal circles with palms up',
    rom: 'Reach the biggest pain-free circle you can draw.',
  },
  'scap-pushup': {
    name: 'Scapular push-up', kind: 'reps',
    muscles: ['Serratus anterior', 'Upper back'],
    description: 'In a plank, let the shoulder blades pinch together then push the floor away — arms stay straight.',
    cues: ['Elbows locked the whole time', 'Move only the shoulder blades', 'Slow and deliberate'],
    mistakes: ['Bending the elbows', 'Sagging hips'],
    easier: 'From knees', harder: 'Feet elevated',
    rom: 'Full protraction — push up until the upper back rounds slightly.',
  },
  'worlds-greatest': {
    name: "World's greatest stretch", kind: 'reps', perSide: true,
    muscles: ['Hips', 'T-spine', 'Hamstrings'],
    description: 'Deep lunge, elbow to instep, then rotate the torso and reach to the ceiling. The whole warm-up in one move.',
    cues: ['Long spine', 'Back leg straight and strong', 'Rotate from the mid-back', 'Follow the hand with your eyes'],
    mistakes: ['Rounding the back', 'Rushing the rotation'],
    easier: 'Drop the back knee', harder: 'Add a hamstring rock-back each rep',
    rom: 'Chase a bigger rotation each rep — the last one should be your best.',
  },
  'easy-pushup': {
    name: 'Easy push-ups', kind: 'reps',
    muscles: ['Chest', 'Triceps'],
    description: 'Sub-maximal grease-the-groove push-ups to prime the movement pattern before the working sets.',
    cues: ['Crisp, perfect reps', 'Stop far from failure', 'Rehearse the plank'],
    mistakes: ['Turning the warm-up into a work set'],
    easier: 'Incline', harder: 'Not the place — keep these easy',
    rom: 'Full range at an easy effort.',
  },
  /* ---------------- legs ---------------- */
  'bulgarian-split-squat': {
    name: 'Bulgarian split squat', kind: 'reps', perSide: true,
    muscles: ['Quads', 'Glutes', 'Adductors'],
    description: 'Rear foot elevated on a bench, front leg does the work. The king of single-leg bodyweight strength.',
    cues: ['Controlled descent', 'Deep ROM without pain', 'Front foot planted — big toe down', 'Stay balanced'],
    mistakes: ['Bouncing off the back knee', 'Front knee caving in', 'Leaning on the back foot'],
    easier: 'Reverse lunge (no elevation)',
    harder: 'Add a 3-second lower or hold a loaded backpack',
    rom: 'Back knee lightly kisses the floor each rep.',
  },
  'reverse-lunge': {
    name: 'Reverse lunge', kind: 'reps', perSide: true,
    muscles: ['Quads', 'Glutes'],
    description: 'Step back into a lunge and drive up through the front heel. Knee-friendlier than forward lunges.',
    cues: ['Torso tall', 'Front shin near vertical', 'Push the floor away', 'Soft touch with the back knee'],
    mistakes: ['Short choppy steps', 'Slamming the back knee'],
    easier: 'Hold a wall or chair for balance', harder: 'Deficit reverse lunge from a low step',
    rom: 'Back knee to within an inch of the floor.',
  },
  'single-leg-rdl': {
    name: 'Single-leg RDL', kind: 'reps', perSide: true,
    muscles: ['Hamstrings', 'Glutes', 'Ankles'],
    description: 'Hinge at the hip on one leg, free leg reaching back, torso and leg moving as a seesaw.',
    cues: ['Hips square to the floor', 'Soft standing knee', 'Long line crown-to-heel', 'Feel the hamstring load'],
    mistakes: ['Rounding the back', 'Opening the hip of the free leg', 'Reaching with the back instead of hinging'],
    easier: 'Kickstand RDL (rear toes lightly down)', harder: 'Hold a loaded backpack in the opposite hand',
    rom: 'Hinge until the hamstring stops you — not until the back rounds.',
  },
  'slow-squat': {
    name: 'Slow bodyweight squat', kind: 'reps',
    muscles: ['Quads', 'Glutes'],
    description: 'Bodyweight squat with a strict 3-second lower. High-rep time under tension for the legs.',
    cues: ['3 seconds down, every rep', 'Knees track over toes', 'Chest tall', 'Full depth, stand all the way up'],
    mistakes: ['Speeding up as reps climb', 'Heels lifting'],
    easier: 'Squat to a chair', harder: '5-second lower or 1.5 reps',
    rom: 'Hip crease below the knee if mobility allows — squat as deep as you can own.',
  },
  'glute-bridge': {
    name: 'Glute bridge', kind: 'reps',
    muscles: ['Glutes', 'Hamstrings'],
    description: 'On your back, feet flat, drive hips to the ceiling and squeeze at the top.',
    cues: ['Ribs down, tuck the pelvis slightly', 'Drive through heels', 'Hard 1-second squeeze at the top', 'Lower with control'],
    mistakes: ['Arching the low back instead of extending hips', 'Rushing the reps'],
    easier: 'Smaller range, pause at top', harder: 'Single-leg glute bridge',
    rom: 'Hips to full extension — one straight line knee-hip-shoulder.',
  },
  'single-leg-glute-bridge': {
    name: 'Single-leg glute bridge', kind: 'reps', perSide: true,
    muscles: ['Glutes', 'Hamstrings'],
    description: 'The glute bridge, one leg at a time. Twice the load, plus anti-rotation work for the core.',
    cues: ['Hips stay level — no tilting', 'Free leg bent at 90°', 'Squeeze hard at the top'],
    mistakes: ['Hips dropping on the free-leg side', 'Pushing through the toes'],
    easier: 'Two-leg glute bridge', harder: 'Foot elevated on a step',
    rom: 'Same full hip extension as the two-leg version — level pelvis throughout.',
  },
  'calf-raise': {
    name: 'Calf raise', kind: 'reps',
    muscles: ['Calves', 'Ankles'],
    description: 'Rise onto the balls of the feet, pause, lower slow. Tendon-friendly volume that protects your running.',
    cues: ['Full pause at the very top', '2-second lower', 'Big toe pushes last', 'Knees straight'],
    mistakes: ['Bouncing', 'Rolling to the outside of the foot'],
    easier: 'Hold a wall for balance', harder: 'Single-leg calf raise off a step',
    rom: 'Heels below the step at the bottom, maximum height at the top.',
  },
  'hip-circles': {
    name: 'Hip circles', kind: 'reps', perSide: true,
    muscles: ['Hip capsule', 'Glutes'],
    description: 'On all fours or standing, draw big slow circles with the knee to open the hip in every direction.',
    cues: ['Slow — 3 seconds per circle', 'Keep the torso still', 'Biggest pain-free circle'],
    mistakes: ['Twisting the spine to fake range'],
    easier: 'Smaller circles', harder: 'Standing with no support',
    rom: 'Explore the edges of the circle, not just the easy middle.',
  },
  'hollow-hold': {
    name: 'Hollow hold', kind: 'time',
    muscles: ['Core', 'Hip flexors'],
    description: 'On your back, low back pressed to the floor, arms and legs hovering. Gymnastic-grade trunk stiffness.',
    cues: ['Low back glued to the floor', 'Ribs pulled down', 'Reach long through fingers and toes'],
    mistakes: ['Low back arching off the floor', 'Chin jammed to chest'],
    easier: 'Bend knees / arms by your sides (or swap to dead bug)', harder: 'Arms overhead, legs lower',
    rom: 'Lower the limbs only as far as the low back stays pinned.',
  },
  'dead-bug': {
    name: 'Dead bug', kind: 'reps', perSide: true,
    muscles: ['Core', 'Hip flexors'],
    description: 'On your back, opposite arm and leg extend away while the low back stays pinned. Core control without strain.',
    cues: ['Exhale as the limbs extend', 'Low back never leaves the floor', 'Slow — 3 seconds out, 3 back'],
    mistakes: ['Rushing', 'Arching the back as the leg lowers'],
    easier: 'Move legs only', harder: 'Hold a light object over the chest',
    rom: 'Heel hovers an inch off the floor at full extension.',
  },
  /* ---------------- pull + posterior ---------------- */
  'pullup': {
    name: 'Pull-up / assisted pull-up', kind: 'reps',
    muscles: ['Lats', 'Biceps', 'Upper back'],
    description: 'Hang from a bar and pull the chin over it. Do sub-max sets — quality volume beats grinding singles.',
    cues: ['Start each rep from a dead hang', 'Lead with the chest', 'Pull the elbows to your ribs', 'Stop 1–2 reps shy of failure'],
    mistakes: ['Kipping/swinging', 'Half range at the bottom', 'Chin-poking over the bar'],
    easier: 'Band-assisted or foot-supported pull-up',
    harder: 'Slow 3-second negatives or added load',
    rom: 'Full dead hang at the bottom, chin clearly over the bar at the top.',
  },
  'inverted-row': {
    name: 'Inverted / backpack row', kind: 'reps',
    muscles: ['Upper back', 'Lats', 'Biceps'],
    description: 'Row your body under a table or bar, or row a loaded backpack. Horizontal pulling to balance all the pushing.',
    cues: ['Body rigid like a reverse plank', 'Pull shoulder blades together first', 'Chest to the bar', 'Lower slow'],
    mistakes: ['Hips sagging', 'Shrugging into the ears', 'Short range'],
    easier: 'More upright body angle', harder: 'Feet elevated, slower tempo',
    rom: 'Full arm extension at the bottom, chest touches (or nearly) at the top.',
  },
  'ytw-raise': {
    name: 'Prone Y-T-W raise', kind: 'reps',
    muscles: ['Lower traps', 'Rear delts', 'Rotator cuff'],
    description: 'Lying face down, raise the arms in a Y, then T, then W shape. Small muscles, huge posture payoff. 8 of each shape = 1 set.',
    cues: ['Thumbs up to the ceiling', 'Lift from the shoulder blade, not the neck', 'Pause 1 second at the top'],
    mistakes: ['Shrugging', 'Throwing the arms with momentum'],
    easier: 'Smaller lift, fewer positions', harder: 'Hold light water bottles',
    rom: 'Arms lift as high as they go without the shoulders hiking.',
  },
  'superman-hold': {
    name: 'Superman hold', kind: 'time',
    muscles: ['Spinal erectors', 'Glutes', 'Rear delts'],
    description: 'Face down, lift chest, arms and legs off the floor and hold. Direct work for the whole back line.',
    cues: ['Squeeze glutes first', 'Long body — reach, don\'t crunch', 'Eyes down, neck neutral'],
    mistakes: ['Cranking the neck up', 'Holding breath'],
    easier: 'Lift chest only', harder: 'Add slow swimming arms',
    rom: 'Thighs and chest clearly off the floor — height comes from squeeze, not swing.',
  },
  'reverse-snow-angel': {
    name: 'Reverse snow angel', kind: 'reps',
    muscles: ['Rear delts', 'Traps', 'Rotator cuff'],
    description: 'Face down, arms sweep from hips to overhead, hovering the whole way. Burns more than it looks.',
    cues: ['Arms hover — never touch down', 'Slow sweep, 3 seconds each way', 'Thumbs up'],
    mistakes: ['Resting arms mid-rep', 'Rushing'],
    easier: 'Shorter arc', harder: 'Light bottles in hands',
    rom: 'Fingertips trace the widest arc you can keep hovering.',
  },
  'towel-row-iso': {
    name: 'Towel row isometric', kind: 'reps',
    muscles: ['Lats', 'Upper back', 'Grip'],
    description: 'Loop a towel around a post or your own feet and pull as hard as possible for 10 seconds. 5 hard pulls = 1 set.',
    cues: ['Ramp up over 2 seconds, then pull max', 'Shoulder blades pinned back and down', 'Breathe — don\'t bear down'],
    mistakes: ['Jerking into the pull', 'Rounding the back'],
    easier: '70% effort pulls', harder: 'Single-arm pulls',
    rom: 'Isometric — quality is maximal tension with a locked, neutral spine.',
  },
  'backpack-curl': {
    name: 'Backpack / band curl', kind: 'reps',
    muscles: ['Biceps', 'Forearms'],
    description: 'Curl a loaded backpack or band. The pump exercise — strict form, full stretch.',
    cues: ['Elbows pinned to ribs', 'Full stretch at the bottom', 'Squeeze at the top', 'Slow lower'],
    mistakes: ['Swinging the hips', 'Half reps in the middle of the range'],
    easier: 'Lighter load', harder: '3-second negatives',
    rom: 'Arm fully straight at the bottom of every rep.',
  },
  /* ---------------- runs ---------------- */
  'z2-run': {
    name: 'Zone 2 easy run', kind: 'run',
    muscles: ['Aerobic system', 'Legs'],
    description: '30–40 minutes at a truly conversational pace. Builds the engine everything else sits on.',
    cues: ['You should be able to speak full sentences', 'Nose-breathing is a good check', 'Slow down on hills', 'Cadence light and quick'],
    mistakes: ['Drifting into tempo pace', 'Racing your last run'],
    easier: 'Run/walk intervals', harder: 'Add 5 minutes, never pace',
    rom: 'Relaxed shoulders, full natural stride — tension is wasted energy.',
  },
  'interval-run': {
    name: 'Interval run', kind: 'run',
    muscles: ['VO₂ max', 'Legs'],
    description: '8–10 min easy warm-up, then 6 × (1 min hard / 1 min easy), then 5–10 min cooldown.',
    cues: ['"Hard" = strong, repeatable — not a sprint', 'First interval should feel too easy', 'Tall posture when tired', 'Walk the recoveries if needed'],
    mistakes: ['Going out too hot on rep 1', 'Skipping the cooldown'],
    easier: '45-second hard efforts', harder: 'Add a 7th round when all 6 feel strong',
    rom: 'Open up the stride on the hard minutes — this is where speed lives.',
  },
  'easy-run': {
    name: 'Easy run', kind: 'run',
    muscles: ['Aerobic system', 'Legs'],
    description: '25–40 minutes easy. Walk breaks are allowed and smart — consistency beats heroics.',
    cues: ['Easier than you think', 'Walk breaks are a tool, not a failure', 'Enjoy it — this is the recovery run'],
    mistakes: ['Turning it into a workout', 'Guilt-pacing'],
    easier: 'Run 4 min / walk 1 min', harder: 'Add minutes gradually, cap at 40',
    rom: 'Smooth and springy — if your form falls apart, walk.',
  },
  /* ---------------- mobility ---------------- */
  'couch-stretch': {
    name: 'Couch stretch', kind: 'time', perSide: true,
    muscles: ['Hip flexors', 'Quads'],
    description: 'Rear foot up a wall or couch, knee on the floor, torso tall. The antidote to sitting.',
    cues: ['Squeeze the glute of the back leg', 'Ribs down, no low-back arch', 'Breathe into the stretch'],
    mistakes: ['Arching to fake depth', 'Holding breath'],
    easier: 'Move the knee further from the wall', harder: 'Torso fully upright, arms overhead',
    rom: 'Work toward hips square and torso vertical.',
  },
  'calf-stretch': {
    name: 'Calf stretch', kind: 'time', perSide: true,
    muscles: ['Calves', 'Ankles'],
    description: 'Ball of the foot on a step or wall, heel driving down. Straight-knee for gastroc, bent for soleus.',
    cues: ['Heel heavy toward the floor', 'Do both straight-knee and bent-knee', 'Slow, relaxed breaths'],
    mistakes: ['Bouncing'],
    easier: 'Gentler angle', harder: 'Deeper drop from a step',
    rom: 'Ankle dorsiflexion is running gold — chase a little more each week.',
  },
  'hamstring-stretch': {
    name: 'Hamstring stretch', kind: 'time', perSide: true,
    muscles: ['Hamstrings'],
    description: 'Heel propped, hips hinging forward with a long spine.',
    cues: ['Hinge from the hips, spine long', 'Toes up for the full chain', 'Relax into it'],
    mistakes: ['Rounding the back to reach further'],
    easier: 'Lower prop', harder: 'Add gentle nerve flossing (point/flex the foot)',
    rom: 'Feel it in the belly of the hamstring, never behind the knee.',
  },
  'deep-squat-hold': {
    name: 'Deep squat hold', kind: 'time',
    muscles: ['Hips', 'Ankles', 'Adductors'],
    description: 'Sit in the bottom of a squat, heels down, and hang out. Restores the range your legs day needs.',
    cues: ['Heels down — hold something if needed', 'Elbows pry the knees out', 'Tall chest, relaxed breathing'],
    mistakes: ['Heels lifting', 'Straining instead of relaxing'],
    easier: 'Hold a doorframe or heels on a book', harder: 'Unsupported with arms forward',
    rom: 'Full depth, heels planted — the position itself is the exercise.',
  },
  'thoracic-rotation': {
    name: 'Thoracic rotations', kind: 'reps', perSide: true,
    muscles: ['T-spine', 'Obliques'],
    description: 'On all fours, hand behind head, rotate the elbow to the ceiling and back down.',
    cues: ['Rotate from the mid-back, not the low back', 'Follow the elbow with your eyes', 'Exhale as you open'],
    mistakes: ['Twisting through the lumbar spine', 'Rushing'],
    easier: 'Smaller arc', harder: 'Add a 2-second hold at the top',
    rom: 'A little more ceiling each rep.',
  },
};

/* ---- weekly schedule ----------------------------------------------------
 * The program week runs Wednesday → Tuesday (dayIndex 0 = Wednesday).
 * Each main entry: { ex, sets, low, high, start } — targets are in reps or
 * seconds depending on the exercise kind; perSide targets are per side.
 * ------------------------------------------------------------------------ */
export const WORKOUTS = {
  'push': {
    id: 'push', name: 'Push + Core', short: 'Push', dayIndex: 0, dayName: 'Wednesday',
    type: 'strength', icon: 'push', color: 'var(--series-1)',
    focus: 'Chest, shoulders, triceps & core — the push-up engine.',
    rounds: 3, restExercise: [45, 90], restRound: 90,
    warmup: [
      { ex: 'arm-circles', detail: '20 each direction' },
      { ex: 'scap-pushup', detail: '10 reps' },
      { ex: 'worlds-greatest', detail: '3 per side' },
      { ex: 'easy-pushup', detail: '5–8 easy reps' },
    ],
    main: [
      { ex: 'pushup', low: 5, high: 15, start: 12 },
      { ex: 'pike-pushup', low: 5, high: 12, start: 8 },
      { ex: 'bench-dip', low: 6, high: 15, start: 8 },
      { ex: 'slow-pushup', low: 5, high: 10, start: 6 },
      { ex: 'plank', low: 30, high: 60, start: 40 },
      { ex: 'side-plank', low: 20, high: 40, start: 20 },
    ],
  },
  'z2run': {
    id: 'z2run', name: 'Zone 2 Run + Mobility', short: 'Zone 2', dayIndex: 1, dayName: 'Thursday',
    type: 'run', icon: 'run', color: 'var(--series-2)',
    focus: 'Aerobic base at a conversational pace, then open up the hips.',
    run: { ex: 'z2-run', minMinutes: 30, maxMinutes: 40, startMinutes: 30 },
    mobility: ['couch-stretch', 'calf-stretch', 'hamstring-stretch', 'deep-squat-hold', 'thoracic-rotation'],
  },
  'legs': {
    id: 'legs', name: 'Bodyweight Legs + Mobility', short: 'Legs', dayIndex: 2, dayName: 'Friday',
    type: 'strength', icon: 'legs', color: 'var(--series-5)',
    focus: 'Single-leg strength, glutes and calves — with a mobility finish.',
    rounds: 3, restExercise: [45, 90], restRound: 90,
    warmup: [
      { ex: 'slow-squat', detail: '15 easy squats', nameOverride: 'Bodyweight squats' },
      { ex: 'reverse-lunge', detail: '8 per side' },
      { ex: 'hip-circles', detail: '10 per side' },
      { ex: 'glute-bridge', detail: '15 reps' },
      { ex: 'calf-raise', detail: '20 reps' },
    ],
    main: [
      { ex: 'bulgarian-split-squat', low: 8, high: 12, start: 8, swap: 'reverse-lunge' },
      { ex: 'single-leg-rdl', low: 8, high: 12, start: 8 },
      { ex: 'slow-squat', low: 15, high: 25, start: 15 },
      { ex: 'glute-bridge', low: 12, high: 20, start: 12, swap: 'single-leg-glute-bridge' },
      { ex: 'calf-raise', low: 20, high: 30, start: 20 },
      { ex: 'hollow-hold', low: 30, high: 45, start: 30, swap: 'dead-bug' },
    ],
    mobility: ['couch-stretch', 'deep-squat-hold'],
  },
  'intervals': {
    id: 'intervals', name: 'Interval Run', short: 'Intervals', dayIndex: 3, dayName: 'Saturday',
    type: 'run', icon: 'bolt', color: 'var(--series-8)',
    focus: '6 × 1 min hard / 1 min easy. Speed with control.',
    run: { ex: 'interval-run', minMinutes: 25, maxMinutes: 40, startMinutes: 30, intervals: 6 },
  },
  'pull': {
    id: 'pull', name: 'Pull + Posterior Chain', short: 'Pull', dayIndex: 4, dayName: 'Sunday',
    type: 'strength', icon: 'pull', color: 'var(--series-4)',
    focus: 'Back, biceps and posterior chain — balance for all the pushing.',
    rounds: 3, restExercise: [45, 90], restRound: 90,
    hasOptions: true,
    warmup: [
      { ex: 'arm-circles', detail: '20 each direction' },
      { ex: 'scap-pushup', detail: '10 reps' },
      { ex: 'worlds-greatest', detail: '3 per side' },
    ],
    /* Option A — some equipment (bar / table / backpack) */
    mainA: [
      { ex: 'pullup', low: 2, high: 12, start: 3, note: 'Sub-max set — stop 1–2 shy of failure' },
      { ex: 'inverted-row', low: 10, high: 15, start: 10 },
      { ex: 'ytw-raise', low: 8, high: 12, start: 8, note: '8 of each shape' },
      { ex: 'superman-hold', low: 20, high: 30, start: 20 },
      { ex: 'backpack-curl', low: 10, high: 15, start: 10 },
      { ex: 'dead-bug', low: 8, high: 12, start: 8 },
    ],
    /* Option B — no equipment */
    mainB: [
      { ex: 'ytw-raise', low: 8, high: 12, start: 8, note: '8 of each shape' },
      { ex: 'reverse-snow-angel', low: 10, high: 15, start: 10 },
      { ex: 'superman-hold', low: 20, high: 30, start: 20 },
      { ex: 'towel-row-iso', low: 5, high: 5, start: 5, note: '5 × 10-sec max pulls' },
      { ex: 'backpack-curl', low: 10, high: 15, start: 10, note: 'If a backpack is handy' },
      { ex: 'dead-bug', low: 8, high: 12, start: 8 },
    ],
  },
  'easyrun': {
    id: 'easyrun', name: 'Easy Run', short: 'Easy run', dayIndex: 5, dayName: 'Monday',
    type: 'run', icon: 'run', color: 'var(--series-2)',
    focus: '25–40 min easy. Walk breaks welcome.',
    run: { ex: 'easy-run', minMinutes: 25, maxMinutes: 40, startMinutes: 25 },
  },
  'rest': {
    id: 'rest', name: 'Off / Recovery', short: 'Recovery', dayIndex: 6, dayName: 'Tuesday',
    type: 'rest', icon: 'rest', color: 'var(--text-muted)',
    focus: 'Full rest, a 20–40 min walk, 10 min of mobility, or gentle stretching.',
    options: ['Full rest — sleep is training too', '20–40 min easy walk', '10 min mobility flow', 'Gentle full-body stretching'],
  },
};

/** dayIndex (0 = Wednesday … 6 = Tuesday) → workout id */
export const SCHEDULE = ['push', 'z2run', 'legs', 'intervals', 'pull', 'easyrun', 'rest'];

/** Push-up milestone badges + achievement badges. */
export const BADGES = [
  { id: 'pu15', kind: 'pushup', threshold: 15, name: '15 Club', desc: '15 clean push-ups in a test' },
  { id: 'pu20', kind: 'pushup', threshold: 20, name: '20 Club', desc: '20 clean push-ups in a test' },
  { id: 'pu25', kind: 'pushup', threshold: 25, name: 'Quarter Century', desc: '25 clean push-ups in a test' },
  { id: 'pu30', kind: 'pushup', threshold: 30, name: '30 Strong', desc: '30 clean push-ups in a test' },
  { id: 'pu40', kind: 'pushup', threshold: 40, name: '40 Deep', desc: '40 clean push-ups in a test' },
  { id: 'pu50', kind: 'pushup', threshold: 50, name: 'GOAL: 50', desc: 'The big one — 50 clean push-ups' },
  { id: 'first', kind: 'achieve', name: 'Day One', desc: 'Logged your first workout' },
  { id: 'streak7', kind: 'achieve', name: 'One Week Wave', desc: '7-day streak' },
  { id: 'streak14', kind: 'achieve', name: 'Fortnight Force', desc: '14-day streak' },
  { id: 'perfectweek', kind: 'achieve', name: 'Perfect Week', desc: 'Every scheduled session done in a week' },
  { id: 'runner3', kind: 'achieve', name: 'Triple Runner', desc: 'All 3 runs done in one week' },
  { id: 'halfway', kind: 'achieve', name: 'Halfway There', desc: 'Reached Week 4' },
  { id: 'ten', kind: 'achieve', name: 'Ten Down', desc: '10 workouts logged' },
  { id: 'graduate', kind: 'achieve', name: 'Rebuilt', desc: 'Completed the 6-week program' },
];

/* ---- date helpers (shared) --------------------------------------------- */
export const DAY_MS = 86400000;
export const isoDate = (d) => {
  const x = d instanceof Date ? d : new Date(d + 'T12:00:00');
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const parseISO = (s) => new Date(s + 'T12:00:00');
export const addDays = (iso, n) => isoDate(new Date(parseISO(iso).getTime() + n * DAY_MS));
export const todayISO = () => isoDate(new Date());
/** Most recent Wednesday on/before the given date — program weeks anchor here. */
export function lastWednesday(iso) {
  const d = parseISO(iso);
  const back = (d.getDay() - 3 + 7) % 7; // getDay(): 3 = Wednesday
  return addDays(iso, -back);
}
export const fmtDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  parseISO(iso).toLocaleDateString(undefined, opts);

/* ---- first-run seed ------------------------------------------------------
 * The program starts on the most recent Wednesday, with the user's real
 * Week 1 Push + Core session already logged, plus the baseline push-up test
 * of 12 clean reps.
 * ------------------------------------------------------------------------ */
export function seedState() {
  const start = lastWednesday(todayISO());
  const seedSets = (n, v) => Array.from({ length: n }, () => ({ target: v, value: v, done: true }));
  return {
    version: 1,
    settings: { theme: 'auto', pullOption: 'A', difficulty: 0, restSound: true },
    program: { startDate: start },
    skipped: [],            // ['2026-07-10', …] — dates explicitly skipped
    badges: {},              // badgeId → ISO date earned
    tests: [
      { id: 'seed-test', date: start, week: 1, reps: PUSHUP_BASELINE, note: 'Baseline test' },
    ],
    logs: [
      {
        id: 'seed-w1-push',
        date: start, workoutId: 'push', week: 1, completed: true,
        durationMin: 38,
        exercises: [
          { ex: 'pushup', sets: seedSets(3, 12), rpe: 8 },
          { ex: 'pike-pushup', sets: seedSets(3, 8), rpe: 7 },
          { ex: 'bench-dip', sets: seedSets(3, 8), rpe: 7 },
          { ex: 'slow-pushup', sets: seedSets(3, 6), rpe: 8 },
          { ex: 'plank', sets: seedSets(3, 40), rpe: 7 },
          { ex: 'side-plank', sets: seedSets(3, 20), rpe: 7 },
        ],
        notes: 'Week 1 Push + Core. Solid start — push-ups crisp, planks steady.',
      },
    ],
  };
}
