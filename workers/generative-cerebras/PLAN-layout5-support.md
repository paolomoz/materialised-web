# Layout 5: Enhanced Support/Troubleshooting

## Design Philosophy

When someone types *"My Vitamix is making a grinding noise"*, they're frustrated and need:
1. **Immediate acknowledgment** - "We understand your issue"
2. **Quick diagnosis** - Is this serious? Can I fix it myself?
3. **Step-by-step guidance** - Clear actions to try
4. **Escalation path** - If self-help doesn't work

---

## Page Structure

```
┌──────────────────────────────────────────────────────────┐
│                   SUPPORT-HERO                            │
│  ⚠️ Troubleshooting: Grinding Noise                      │
│  "Let's get your Vitamix back to peak performance"       │
│  [Issue acknowledged, empathetic tone]                   │
├──────────────────────────────────────────────────────────┤
│                  DIAGNOSIS-CARD                           │
│  ┌─────────────┬─────────────┬─────────────┐             │
│  │ 🟢 MINOR    │ 🟡 MODERATE │ 🔴 SERIOUS  │             │
│  │ Ice/frozen  │ Blade wear  │ Motor issue │             │
│  │ ingredients │ or buildup  │             │             │
│  └─────────────┴─────────────┴─────────────┘             │
│  "Most grinding noises are caused by..."                 │
├──────────────────────────────────────────────────────────┤
│                  TROUBLESHOOTING-STEPS                    │
│  Step 1: Check for trapped ingredients                   │
│          [Illustration] → Instructions                    │
│  Step 2: Inspect the blade assembly                      │
│          [Illustration] → Instructions                    │
│  Step 3: Test with water only                            │
│          [Illustration] → Instructions                    │
├──────────────────────────────────────────────────────────┤
│                      FAQ                                  │
│  "Is this covered under warranty?"                       │
│  "How do I know if my blade needs replacing?"            │
│  "Can I still use my blender while it makes noise?"      │
├──────────────────────────────────────────────────────────┤
│                  SUPPORT-CTA                              │
│  ┌─────────────────────┬─────────────────────┐           │
│  │ 📞 Contact Support  │ 🔧 Order Parts      │           │
│  │ Still need help?    │ Replacement blades  │           │
│  └─────────────────────┴─────────────────────┘           │
└──────────────────────────────────────────────────────────┘
```

---

## New Blocks Required

### 1. support-hero

**Purpose:** Empathetic hero that acknowledges the user's issue. No image (text-focused), possibly with an icon.

**Visual:** Alert/warning styling, supportive tone

**Content Model (DA Table):**
```
| Support Hero                                    |
|-------------------------------------------------|
| :icon-warning:                                  |
| Troubleshooting: Grinding Noise                 |
| Let's get your Vitamix back to peak performance |
```

**Generated Content:**
- `icon`: warning, info, or tool icon
- `title`: Issue-specific headline (e.g., "Troubleshooting: Grinding Noise")
- `subtitle`: Empathetic message acknowledging the problem

---

### 2. diagnosis-card

**Purpose:** Quick severity assessment - helps user understand if the issue is minor/moderate/serious

**Visual:** Color-coded cards (green/yellow/red) showing possible causes by severity

**Content Model (DA Table):**
```
| Diagnosis Card                |                        |                      |
|-------------------------------|------------------------|----------------------|
| minor                         | moderate               | serious              |
| Ice or frozen ingredients     | Blade wear or buildup  | Motor issue          |
| Normal during hard blending   | May need cleaning      | Requires service     |
```

**Generated Content:**
- Array of 3 diagnosis items, each with:
  - `severity`: minor | moderate | serious
  - `cause`: Short description of likely cause
  - `implication`: What it means for the user

---

### 3. troubleshooting-steps

**Purpose:** Numbered step-by-step instructions with optional illustrations

**Visual:** Vertical timeline or numbered cards with images

**Content Model (DA Table):**
```
| Troubleshooting Steps                                            |
|------------------------------------------------------------------|
| 1                                                                |
| Check for trapped ingredients                                    |
| Unplug your blender and remove the container. Look under...      |
|------------------------------------------------------------------|
| 2                                                                |
| Inspect the blade assembly                                       |
| With the container removed, check for any visible damage...      |
|------------------------------------------------------------------|
| 3                                                                |
| Test with water only                                             |
| Fill the container halfway with water and run on variable 1...   |
```

**Generated Content:**
- Array of steps, each with:
  - `stepNumber`: 1, 2, 3...
  - `title`: Short action title
  - `instructions`: Detailed instructions
  - `safetyNote`: Optional safety warning (e.g., "Always unplug first")
  - `imagePrompt`: For AI-generated illustration

---

### 4. support-cta

**Purpose:** Dual CTA for escalation - contact support AND order parts/resources

**Visual:** Two-column action buttons

**Content Model (DA Table):**
```
| Support CTA                   |                              |
|-------------------------------|------------------------------|
| Contact Support               | Order Parts                  |
| Still need help? We're here.  | Replacement blades & more    |
| /support/contact              | /shop/parts                  |
| primary                       | secondary                    |
```

**Generated Content:**
- Two CTAs, each with:
  - `title`: Button text
  - `description`: Supporting text
  - `url`: Link destination
  - `style`: primary | secondary

---

## Content Generation Guidelines

The AI should generate:

1. **Issue-specific diagnosis** - Not generic FAQs, but "Here's what likely causes YOUR specific problem"
2. **Actionable steps** - "Do this first, then try this"
3. **Safety warnings** - "Unplug before inspecting blades"
4. **Outcome expectations** - "If step 2 doesn't help, it's likely X"

---

## Visual Differentiation

- **Color scheme**: Subtle warning tones (amber accents) to signal "help mode"
- **Icons**: Tool/wrench icons, checkmarks for completed steps
- **Progress feeling**: User should feel they're making progress through diagnosis

---

## Implementation Checklist

### Blocks to Create:

- [ ] `blocks/support-hero/support-hero.js`
- [ ] `blocks/support-hero/support-hero.css`
- [ ] `blocks/diagnosis-card/diagnosis-card.js`
- [ ] `blocks/diagnosis-card/diagnosis-card.css`
- [ ] `blocks/troubleshooting-steps/troubleshooting-steps.js`
- [ ] `blocks/troubleshooting-steps/troubleshooting-steps.css`
- [ ] `blocks/support-cta/support-cta.js`
- [ ] `blocks/support-cta/support-cta.css`

### Orchestrator Updates:

- [ ] Add `buildSupportHeroHTML()` function
- [ ] Add `buildDiagnosisCardHTML()` function
- [ ] Add `buildTroubleshootingStepsHTML()` function
- [ ] Add `buildSupportCTAHTML()` function
- [ ] Add cases in `buildBlockHTML()` switch
- [ ] Add image requests for troubleshooting step illustrations

### Layout Template Update:

- [ ] Update `LAYOUT_SUPPORT` in `prompts/layouts.ts` with new block types

### Content Prompt:

- [ ] Add block specifications in `prompts/content.ts` for support-specific content generation

---

## Example Queries

- "My Vitamix is making a grinding noise"
- "How to fix leaking"
- "Blender not turning on"
- "Vitamix smells like burning"
- "Container won't lock in place"
