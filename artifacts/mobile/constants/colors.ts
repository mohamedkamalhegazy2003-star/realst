/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#18372d',
    tint: '#215746',

    // Core surfaces
    background: '#f5f4ef',
    foreground: '#18372d',

    // Cards / elevated surfaces
    card: '#fffefa',
    cardForeground: '#18372d',

    // Primary action color (buttons, links, active states)
    primary: '#215746',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e7eee8',
    secondaryForeground: '#214539',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#eeeee7',
    mutedForeground: '#708078',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#f1e4d8',
    accentForeground: '#895c40',

    // Destructive actions (delete, error states)
    destructive: '#b5463b',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#dce2dc',
    input: '#dce2dc',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
