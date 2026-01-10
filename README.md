# Fishbowl (iPad PWA)

This repo currently contains the product/functional spec for **Fishbowl**, an offline-capable, pass-and-play party game designed to run as a **web app + installable PWA** on a single iPad.

## Table of Contents
- About
- Spec

## About
Fishbowl is similar to Moniker: players submit words/phrases into a shared “fishbowl”, then two teams play three timed rounds (Describe, Charades, One-word clue) using the same items.

## Spec
See `FISHBOWL_SPEC.md`.

## Hosting (free)
The application is hosted on GitHub Pages.
**Auto-Deployment:** The project is configured to automatically deploy to the live site on **every push to any branch**. This ensures the live URL always runs the latest committed code for testing.

## Developer Notes
**Versioning:**
When releasing updates, you must manually increment the `APP_VERSION` constant in `web/src/App.tsx`. This version number is displayed in the app to help users verify they have the latest code.
