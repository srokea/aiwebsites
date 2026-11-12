---
description: Use this ONLY when you're told to.
---

# Frontend Motion Design Guidelines

## Goal

Create interfaces that feel premium, immersive and effortless. Motion should enhance the experience, guide the user's attention and communicate hierarchy. Animations should never exist just for decoration.

The desired feeling is inspired by Apple, Linear, Vercel, Raycast and Emil Kowalski's design philosophy: clean, modern, subtle and highly polished.

---

## General Principles

* Every animation must have a purpose.
* Motion should feel calm, elegant and expensive.
* Less is more.
* Avoid flashy effects.
* Prioritize clarity over complexity.
* Performance is part of the design.

---

## Scroll Experience

Scrolling should feel like progressing through a story rather than moving through disconnected sections.

Each section should naturally transition into the next.

Prefer:

* fade in
* fade out
* translate Y (10–30px)
* subtle scale
* opacity transitions
* staggered animations

Avoid:

* spinning elements
* bouncing effects
* exaggerated parallax
* long animations
* distracting movements

---

## Reveal Animations

Elements should reveal only when they enter the viewport.

Recommended sequence:

1. opacity
2. translate
3. slight scale (optional)

Cards, lists and grids should use staggered reveals with small delays (60–120ms).

---

## Typography Animation

Large headings should feel cinematic.

Possible effects:

* fade up
* blur reveal
* letter spacing transitions
* word-by-word reveal (only for hero sections)
* subtle fade out before the next section appears

Never overuse text animations.

---

## Image Animation

Images should:

* gently fade in
* slightly scale from 0.98 → 1
* optionally reveal through a mask or clip-path
* never abruptly appear

Portfolio images should feel layered and physical.

---

## Hover Interactions

Buttons:

* slight scale (1.02)
* soft shadow increase
* smooth color transition
* press animation (0.98)

Cards:

* small lift
* subtle shadow
* smooth transitions only

---

## Background Motion

Backgrounds should feel alive but almost unnoticed.

Examples:

* slowly moving clouds
* soft floating gradients
* subtle noise
* extremely light parallax

The background should never compete with the content.

---

## Navigation

Navigation should:

* become slightly blurred on scroll
* use smooth transitions
* remain minimal
* avoid distracting animations

---

## Scroll Storytelling

The page should feel like a presentation.

Avoid presenting everything at once.

Instead, reveal information gradually as the user scrolls.

Every section should answer one question before introducing the next.

---

## Portfolio Presentation

Portfolio should not be a static gallery.

Projects should feel like physical objects.

Preferred interactions:

* layered cards
* depth
* subtle perspective
* stack animations
* smooth expansion
* cinematic transitions

Scrolling should create the feeling of browsing premium work.

---

## Timing

Short interactions:
150–250ms

Medium transitions:
300–500ms

Large scene transitions:
500–800ms

Never make users wait unnecessarily.

---

## Performance

Use GPU-friendly animations.

Prefer:

* transform
* opacity

Avoid animating:

* width
* height
* top
* left

Maintain smooth performance on both desktop and mobile.

Respect prefers-reduced-motion.

---

## Overall Feeling

The interface should feel:

* premium
* calm
* modern
* intentional
* immersive
* trustworthy

Users should remember how smooth the experience felt, not how many animations they saw.
