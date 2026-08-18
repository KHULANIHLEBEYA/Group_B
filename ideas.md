# CSRMS Front-end Design Direction

## Three stylistic approaches

### Theme Name: Civic Signal
Very Brief Intro: A calm civic-operations interface with warm paper surfaces, deep ink typography, and disciplined amber status accents. It makes complex service work feel legible and accountable.
Probability: 0.07

### Theme Name: Night Operations
Very Brief Intro: A dark control-room dashboard with restrained electric blue telemetry accents and crisp data density. It foregrounds urgency, monitoring, and live operational awareness.
Probability: 0.04

### Theme Name: Campus Commons
Very Brief Intro: A humane campus service experience built from soft stone, botanical green, and approachable editorial type. It makes reporting problems feel welcoming without losing operational precision.
Probability: 0.08

## Selected approach: Civic Signal

### Design Movement
Contemporary civic-tech editorialism: the visual language of public service portals and operations rooms, refined with print-inspired typography, archival markers, and tactile paper-like surfaces.

### Core Principles
1. **Clarity before decoration.** Every request, priority, and next action should be scannable in under a few seconds.
2. **Accountability made visible.** Status history, assignment ownership, and timestamps are treated as first-class information.
3. **Warm operational confidence.** The interface should feel trustworthy and human rather than sterile or alarmist.
4. **Progressive density.** The dashboard starts with a calm summary and reveals deeper detail through well-structured panels.

### Color Philosophy
Use deep ink navy as the anchor for authority and legibility, a warm parchment background to soften the administrative feel, and signal amber as the ownable action color for attention, priority, and focus. Supporting colors are muted mineral green for healthy/resolved states, rust for critical incidents, and slate for secondary metadata. The palette should feel like an annotated field notebook translated into a modern service platform.

### Layout Paradigm
Use a persistent left rail for role-aware navigation and a wide, offset content canvas. The main dashboard is organized as a horizontal operational brief: a compact welcome band, a row of key counts, then a split between active work and system signals. Avoid a centered marketing layout; favor deliberate asymmetry, stacked cards, and a visible right-side “signal” column.

### Signature Elements
1. Small uppercase **signal labels** with a thin amber rule, used above section titles and system messages.
2. **Ticket chips** that combine source, priority, and status as compact operational annotations.
3. A subtle **paper grain / ruled-line texture** in the shell background, paired with sharp ink panels and soft elevation.

### Interaction Philosophy
Interactions should feel like moving a case through a clear workflow. Hover states reveal hierarchy rather than spectacle; buttons compress slightly on press; filters change the visible worklist immediately; drawer and modal surfaces feel like pulling a file from a cabinet. Toasts confirm meaningful actions using plain language.

### Animation
Use short, confident transitions under 240ms with an ease-out curve. Dashboard cards enter with a 40ms stagger and a small upward translation. Status changes animate the status chip and progress bar, not the surrounding layout. Use subtle pulse only for live sensor signals. Respect reduced-motion preferences and never animate high-frequency table rows.

### Typography System
Use **DM Serif Display** for page titles and major numeric anchors, paired with **IBM Plex Sans** for body copy, labels, and controls. Titles are sentence case with tight tracking; labels use uppercase at 0.14em letter spacing; body copy stays at a comfortable 15–16px with 1.5 line height. Numeric metrics are large, serif, and aligned to reinforce the reporting/briefing metaphor.

### Brand Essence
CSRMS is the campus-wide service desk for students and operations teams who need visible, accountable resolution across people, facilities, IT, and safety signals. Personality: **clear, grounded, watchful**.

### Brand Voice
Headlines sound direct and composed. CTAs describe the next operational action, not a generic onboarding step. Microcopy is brief, specific, and non-blaming.

Example lines:
- “Bring the campus back into rhythm.”
- “Review what needs a human hand next.”

### Wordmark & Logo
The mark is a compact **three-line signal glyph**: three offset vertical bars joined by a small amber bridge, representing student reports, staff action, and system telemetry converging in one workflow. The wordmark uses a custom-styled CSRMS lockup with a serif “C” and tightly tracked sans-serif “SRMS,” never a default browser wordmark.

### Signature Brand Color
**Signal Amber — #E6A649**, used for primary actions, live indicators, and high-priority annotations against ink navy and parchment.

## Implementation reminders

- Keep the interface frontend-only and use local mock data to demonstrate the documented workflows.
- Model the three roles explicitly: Student, Staff, and Admin.
- Represent both manual requests and automatic IoT alerts in the same request pipeline.
- Include screens or states for login, role-aware dashboard, request creation, request list/detail, notifications, and sensor activity.
- Use clear placeholder toasts for future API-connected actions and do not imply backend persistence in this prototype.

## Style Decisions

- Every authenticated CSRMS screen keeps the signal glyph, custom wordmark, role-aware navigation, and operational shell visible as the persistent product anchor.
- The dashboard retains the large “Operational brief” hero, while Requests and Sensors use denser task-first headers.
- Request rows combine source, priority, status, queue or owner, and timestamp as compact case annotations.
- Sensor activity is presented as a live telemetry surface with device health, status, last-check context, and threshold-oriented visual cues.
