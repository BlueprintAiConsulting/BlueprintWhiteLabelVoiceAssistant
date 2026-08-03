---
name: Blueprint HVAC AI Voice Assistant Design System
description: High-tech, futuristic dark-mode design system for AI voice receptionist & lead engine management.
colors:
  primary: "#22d3ee"
  primary-glow: "rgba(34, 211, 238, 0.3)"
  neutral-bg: "#020617"
  surface-card: "#0f172a"
  surface-card-hover: "#1e293b"
  emergency-rose: "#f43f5e"
  amber-alert: "#f59e0b"
  success-emerald: "#10b981"
  border-slate: "#1e293b"
typography:
  display:
    fontFamily: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "clamp(1.5rem, 4vw, 2.5rem)"
    fontWeight: 400
    lineHeight: "1.2"
    letterSpacing: "normal"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.1em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "{colors.surface-card}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  card-lead:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Blueprint HVAC AI Voice Assistant

## 1. Overview

**Creative North Star: "The Futuristic Command Center"**

The Blueprint HVAC AI Voice Assistant interface is an advanced operations tool engineered for call managers, technicians, and owners at Lunar Heating & Cooling. The visual language blends high-tech futuristic dark mode aesthetics with crisp operational legibility. Ambient glow highlights, glassmorphism backdrops, and glowing status pills evoke sophisticated artificial intelligence while ensuring high contrast and immediate signal-over-noise hierarchy.

**Key Characteristics:**
- Deep Slate 950 obsidian background (`#020617`) with subtle ambient radial glow spots.
- Cyan 400 (`#22d3ee`) primary accent representing active AI live audio telemetry and key actions.
- Emergency Rose 500 (`#f43f5e`) alert highlights for gas leaks, carbon monoxide alarms, and freeze risks.
- Dual typography pairing: classic italic serif headings for humanized confidence, paired with technical monospace labels for system status and phone metrics.

## 2. Colors

The color palette uses dark slate neutrals punctuated by high-contrast neon signal accents.

### Primary
- **Cyan Signal** (`#22d3ee` / `rgba(34,211,238,0.3)`): Used for system active badges, primary CTA glow effects, and live audio activity indicators.

### Status & Accents
- **Emergency Rose** (`#f43f5e`): High-priority emergency call flags, 911 dispatch alerts, and hang-up controls.
- **Missed-Call Amber** (`#f59e0b`): Missed-call text-back status badges and VAD barge-in warning states.
- **Booked Emerald** (`#10b981`): Confirmed appointment bookings, successful transfers, and passed QA tests.

### Neutral
- **Obsidian Canvas** (`#020617` / Slate 950): Primary application background.
- **Glass Panel Surface** (`#0f172a` / Slate 900 at 60-80% opacity with `backdrop-blur-md`): Card and panel containers.
- **Border Slate** (`#1e293b` / Slate 800): High-definition structural dividing lines.

### Named Rules
**The Signal-Over-Noise Rule.** Saturated accents are reserved strictly for system state, call type classification, and active user targets. Neutral surfaces carry zero decorative saturation.

## 3. Typography

**Display Font:** System Serif / Georgia (Italic)
**Body Font:** System Sans-Serif / Inter
**Label & Telemetry Font:** Monospace / JetBrains Mono

### Hierarchy
- **Display** (Italic, `2rem - 2.5rem`, `1.2`): Section and dashboard page titles.
- **Headline** (Medium, `1.125rem - 1.25rem`, `1.3`): Card titles and lead detail headers.
- **Body** (Regular, `0.875rem`, `1.5`): AI summaries, transcript bubbles, and form labels.
- **Label / Monospace** (Bold Uppercase, `0.625rem - 0.75rem`, `0.15em` tracking): System status badges, timestamp labels, phone numbers, and call IDs.

## 4. Elevation

The system relies on glassmorphic depth (`backdrop-blur-xl`) combined with dark surface contrast and subtle colored glow borders rather than traditional drop shadows.

### Shadow & Glow Vocabulary
- **Cyan AI Glow**: `shadow-[0_0_15px_rgba(34,211,238,0.3)]` used on active voice buttons and primary badges.
- **Emergency Pulse**: `shadow-[0_0_15px_rgba(244,63,94,0.4)]` used on emergency call items.

## 5. Components

### Buttons
- **Shape:** Rounded rectangle (`rounded-xl` / 12px) with minimum touch target of 44px (`min-h-[44px]`).
- **Primary Action:** Cyan background / tint with high-contrast text and hover scale transition.
- **Emergency Action:** Rose background with pulsing border and warning icon.

### Cards / Containers
- **Style:** Slate 900 surface at 60% opacity with 1px border (`border-slate-800`) and 12px to 16px corner radii (`rounded-xl` / `rounded-2xl`).

### Mobile Navigation Drawer
- **Style:** Slide-over left drawer (`w-72 md:w-64`) with dark backdrop blur overlay (`bg-slate-950/80 backdrop-blur-sm`).

## 6. Do's and Don'ts

### Do:
- **Do** maintain WCAG AA minimum 4.5:1 contrast for all text over dark backgrounds.
- **Do** enforce minimum 44px x 44px touch targets on mobile viewports.
- **Do** highlight high-priority gas leak and CO emergency calls with pulsing Rose indicators.

### Don't:
- **Don't** use generic white/light SaaS themes—the application identity is committed dark mode command center.
- **Don't** allow horizontal page overflow on small mobile screens (< 768px).
- **Don't** hide active status or telephone callback numbers inside multi-level collapsed sub-menus.
