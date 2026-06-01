#!/usr/bin/env node
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function comparable(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9가-힣.+/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDesignSystemMode(value) {
  const normalized = comparable(value || 'generate-design-system');
  const mode = DESIGN_SYSTEM_MODE_ALIASES[normalized] || normalized || 'generate-design-system';
  return DESIGN_SYSTEM_MODES.has(mode) ? mode : 'generate-design-system';
}

function slugify(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '') || 'oh-my-goal-design';
}

const UI_UX_PRO_MAX_SOURCE = {
  repository: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
  reviewed_commit: 'b7e3af80f6e331f6fb456667b82b12cade7c9d35',
};

const SEARCH_CONFIG = {
  product: { maxResults: 1 },
  style: { maxResults: 3 },
  color: { maxResults: 2 },
  landing: { maxResults: 2 },
  typography: { maxResults: 2 },
};

const DESIGN_SYSTEM_MODES = new Set([
  'generate-design-system',
  'lightweight-design-checklist',
  'match-existing-design-system',
  'skip-design-system',
]);

const DESIGN_SYSTEM_MODE_ALIASES = {
  'generate design system': 'generate-design-system',
  'generate design-system md before implementation': 'generate-design-system',
  'generate and enforce a design system': 'generate-design-system',
  'generate-design-system': 'generate-design-system',
  'lightweight design checklist': 'lightweight-design-checklist',
  'use a lightweight design checklist': 'lightweight-design-checklist',
  'lightweight-design-checklist': 'lightweight-design-checklist',
  'match existing design system': 'match-existing-design-system',
  'match the existing design system': 'match-existing-design-system',
  'match-existing-design-system': 'match-existing-design-system',
  'skip design system': 'skip-design-system',
  'skip-design-system': 'skip-design-system',
};

const UI_PRO_MAX_DATASETS = {
  product: [
    { productType: 'SaaS (General)', keywords: 'app b2b cloud general saas software subscription', primaryStyle: 'Glassmorphism + Flat Design', secondaryStyles: 'Soft UI Evolution, Minimalism', landingPattern: 'Hero + Features + CTA', dashboardStyle: 'Data-Dense + Real-Time Monitoring', colorFocus: 'Trust blue + accent contrast', keyConsiderations: 'Balance modern feel with clarity. Focus on CTAs.' },
    { productType: 'Micro SaaS', keywords: 'app b2b cloud indie micro micro-saas niche saas small software solo subscription', primaryStyle: 'Flat Design + Vibrant & Block', secondaryStyles: 'Motion-Driven, Micro-interactions', landingPattern: 'Minimal & Direct + Demo', dashboardStyle: 'Executive Dashboard', colorFocus: 'Vibrant primary + white space', keyConsiderations: 'Keep simple, show product quickly. Speed is key.' },
    { productType: 'AI/Chatbot Platform', keywords: 'ai llm chatbot agent openai copilot assistant automation memory zep mirofish personalization smart recommendation dynamic', primaryStyle: 'Glassmorphism + Flat Design', secondaryStyles: 'Minimalism, Motion-Driven', landingPattern: 'AI Personalization Landing', dashboardStyle: 'Conversational Analytics', colorFocus: 'AI purple + cyan interactions', keyConsiderations: 'Show concrete product state, trust boundaries, loading/error states, and inspectable AI output.' },
    { productType: 'Developer Tool / IDE', keywords: 'dev developer tool ide cli api sdk docs documentation code coding terminal plugin', primaryStyle: 'Dark Mode (OLED) + Minimalism', secondaryStyles: 'Flat Design, Bento Box Grid', landingPattern: 'Minimal & Direct + Documentation', dashboardStyle: 'Real-Time Monitor + Terminal', colorFocus: 'Dark syntax theme colors + blue focus', keyConsiderations: 'Keyboard shortcuts, syntax highlighting, fast performance, command examples.' },
    { productType: 'Knowledge Base/Documentation', keywords: 'base documentation knowledge docs guide reference search', primaryStyle: 'Minimalism + Accessible & Ethical', secondaryStyles: 'Swiss Modernism 2.0, Flat Design', landingPattern: 'FAQ/Documentation', dashboardStyle: 'N/A - Documentation focused', colorFocus: 'Clean hierarchy + minimal color', keyConsiderations: 'Search-first, clear navigation, code highlighting, version switching.' },
    { productType: 'E-commerce', keywords: 'buy commerce ecommerce products retail sell shop store checkout marketplace', primaryStyle: 'Vibrant & Block-based', secondaryStyles: 'Aurora UI, Motion-Driven', landingPattern: 'Feature-Rich Showcase', dashboardStyle: 'Sales Intelligence Dashboard', colorFocus: 'Brand primary + success green', keyConsiderations: 'Engagement and conversions. High visual hierarchy.' },
    { productType: 'Financial Dashboard', keywords: 'admin analytics dashboard data financial panel metrics revenue finance', primaryStyle: 'Dark Mode (OLED) + Data-Dense', secondaryStyles: 'Minimalism, Accessible & Ethical', landingPattern: 'N/A - Dashboard focused', dashboardStyle: 'Financial Dashboard', colorFocus: 'Dark bg + red/green alerts + trust blue', keyConsiderations: 'High contrast, real-time updates, accuracy paramount.' },
    { productType: 'Analytics Dashboard', keywords: 'admin analytics dashboard data panel charts reports metrics', primaryStyle: 'Data-Dense + Heat Map', secondaryStyles: 'Minimalism, Dark Mode (OLED)', landingPattern: 'N/A - Analytics focused', dashboardStyle: 'Drill-Down Analytics + Comparative', colorFocus: 'Cool to hot gradients + neutral grey', keyConsiderations: 'Clarity over aesthetics. Color-coded data priority.' },
    { productType: 'Healthcare App', keywords: 'app clinic health healthcare medical patient wellness fitness mental', primaryStyle: 'Neumorphism + Accessible & Ethical', secondaryStyles: 'Soft UI Evolution, Claymorphism', landingPattern: 'Social Proof-Focused', dashboardStyle: 'User Behavior Analytics', colorFocus: 'Calm blue + health green + trust', keyConsiderations: 'Accessibility mandatory. Calming aesthetic.' },
    { productType: 'Educational App', keywords: 'app course education educational learning school training flashcard study quiz', primaryStyle: 'Claymorphism + Micro-interactions', secondaryStyles: 'Vibrant & Block-based, Flat Design', landingPattern: 'Storytelling-Driven', dashboardStyle: 'Learning Analytics', colorFocus: 'Playful colors + clear hierarchy', keyConsiderations: 'Engagement and ease of use. Age-appropriate design.' },
    { productType: 'Portfolio/Personal', keywords: 'portfolio personal agency creative artist photography case study profile link bio', primaryStyle: 'Motion-Driven + Minimalism', secondaryStyles: 'Brutalism, Editorial Grid', landingPattern: 'Portfolio Grid', dashboardStyle: 'N/A - Portfolio focused', colorFocus: 'Monochrome + blue accent', keyConsiderations: 'Visuals first, fast loading, contact path obvious.' },
  ],
  reasoning: [
    { uiCategory: 'SaaS (General)', recommendedPattern: 'Hero + Features + CTA', stylePriority: 'Glassmorphism + Flat Design', colorMood: 'Trust blue + Accent contrast', typographyMood: 'Professional + Hierarchy', keyEffects: 'Subtle hover (200-250ms) + Smooth transitions', decisionRules: '{"if_ux_focused":"prioritize-minimalism","if_data_heavy":"add-glassmorphism"}', antiPatterns: 'Excessive animation + Dark mode by default', severity: 'HIGH' },
    { uiCategory: 'Micro SaaS', recommendedPattern: 'Hero-Centric + Trust', stylePriority: 'Motion-Driven + Vibrant & Block', colorMood: 'Bold primaries + Accent contrast', typographyMood: 'Modern + Energetic typography', keyEffects: 'Scroll-triggered animations + Parallax', decisionRules: '{"if_pre_launch":"use-waitlist-pattern","if_video_ready":"add-hero-video"}', antiPatterns: 'Static design + No video + Poor mobile', severity: 'HIGH' },
    { uiCategory: 'AI/Chatbot Platform', recommendedPattern: 'AI Personalization Landing', stylePriority: 'Glassmorphism + Minimalism', colorMood: 'AI purple + Cyan interaction states', typographyMood: 'Tech + Trustworthy hierarchy', keyEffects: 'Dynamic content swap + Fade transitions + Product-state highlights', decisionRules: '{"must_have":"visible-ai-output-state","if_memory_enabled":"show-privacy-boundary","if_chat":"include-loading-and-error-states"}', antiPatterns: 'Generic AI purple gradients + Abstract hero art only + Hidden data/privacy states', severity: 'HIGH' },
    { uiCategory: 'Developer Tool / IDE', recommendedPattern: 'Minimal & Direct + Documentation', stylePriority: 'Dark Mode (OLED) + Minimalism', colorMood: 'Dark syntax theme + Blue focus', typographyMood: 'Technical + Precise typography', keyEffects: 'Copyable command affordances + Crisp focus states', decisionRules: '{"must_have":"command-example","must_have":"keyboard-accessible-controls"}', antiPatterns: 'Marketing-only hero copy + Low-density dashboard + Hidden docs path', severity: 'HIGH' },
    { uiCategory: 'Knowledge Base/Documentation', recommendedPattern: 'FAQ/Documentation', stylePriority: 'Minimalism + Accessible & Ethical', colorMood: 'Clean hierarchy + Minimal color', typographyMood: 'Readable + Search-first', keyEffects: 'Instant search feedback + Anchor highlight', decisionRules: '{"must_have":"search","must_have":"clear-navigation"}', antiPatterns: 'Decorative pages + Buried navigation + Unreadable code blocks', severity: 'HIGH' },
    { uiCategory: 'Financial Dashboard', recommendedPattern: 'Data-Dense Dashboard', stylePriority: 'Dark Mode (OLED) + Data-Dense', colorMood: 'Dark bg + Red/Green alerts + Trust blue', typographyMood: 'Clear + Readable typography', keyEffects: 'Real-time number animations + Alert pulse', decisionRules: '{"must_have":"real-time-updates","must_have":"high-contrast"}', antiPatterns: 'Light mode default + Slow rendering', severity: 'HIGH' },
    { uiCategory: 'Analytics Dashboard', recommendedPattern: 'Data-Dense + Drill-Down', stylePriority: 'Data-Dense + Heat Map', colorMood: 'Cool to hot gradients + Neutral grey', typographyMood: 'Clear + Functional typography', keyEffects: 'Hover tooltips + Chart zoom + Filter animations', decisionRules: '{"must_have":"data-export","if_large_dataset":"virtualize-lists"}', antiPatterns: 'Ornate design + No filtering', severity: 'HIGH' },
    { uiCategory: 'Healthcare App', recommendedPattern: 'Social Proof-Focused', stylePriority: 'Neumorphism + Accessible & Ethical', colorMood: 'Calm blue + Health green', typographyMood: 'Readable + Large type (16px+)', keyEffects: 'Soft box-shadow + Smooth press (150ms)', decisionRules: '{"must_have":"wcag-aaa-compliance","if_medication":"red-alert-colors"}', antiPatterns: 'Bright neon colors + Motion-heavy animations + AI purple/pink gradients', severity: 'HIGH' },
    { uiCategory: 'Educational App', recommendedPattern: 'Feature-Rich Showcase', stylePriority: 'Claymorphism + Micro-interactions', colorMood: 'Playful colors + Clear hierarchy', typographyMood: 'Friendly + Engaging typography', keyEffects: 'Soft press (200ms) + Fluffy elements', decisionRules: '{"if_gamification":"add-progress-animation","if_children":"increase-playfulness"}', antiPatterns: 'Dark modes + Complex jargon', severity: 'MEDIUM' },
    { uiCategory: 'Portfolio/Personal', recommendedPattern: 'Storytelling-Driven', stylePriority: 'Motion-Driven + Minimalism', colorMood: 'Brand primary + Artistic', typographyMood: 'Expressive + Variable typography', keyEffects: 'Parallax (3-5 layers) + Scroll-triggered reveals', decisionRules: '{"if_creative_field":"add-brutalism","if_minimal_portfolio":"reduce-motion"}', antiPatterns: 'Corporate templates + Generic layouts', severity: 'MEDIUM' },
  ],
  style: [
    { styleCategory: 'Minimalism & Swiss Style', type: 'General', keywords: 'Clean simple spacious functional white space high contrast geometric sans-serif grid-based essential', primaryColors: 'Monochromatic, Black #000000, White #FFFFFF', effectsAnimation: 'Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading', bestFor: 'Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools', lightMode: 'Full', darkMode: 'Full', performance: 'Excellent', accessibility: 'WCAG AAA', implementationChecklist: 'Grid-based layout, clear typography hierarchy, no unnecessary decorations, WCAG contrast verified', designSystemVariables: '--spacing: 2rem, --border-radius: 0px, --shadow: none' },
    { styleCategory: 'Glassmorphism', type: 'General', keywords: 'Frosted glass transparent blurred background layered vibrant background light source depth multi-layer', primaryColors: 'Translucent white rgba(255,255,255,0.1-0.3)', effectsAnimation: 'Backdrop blur (10-20px), subtle border, light reflection, Z-depth', bestFor: 'Modern SaaS, financial dashboards, high-end corporate, lifestyle apps, modal overlays, navigation', lightMode: 'Full', darkMode: 'Full', performance: 'Good', accessibility: 'Ensure 4.5:1', implementationChecklist: 'Backdrop-filter blur 10-20px, translucent overlays, subtle border, text contrast checked', designSystemVariables: '--blur-amount: 15px, --glass-opacity: 0.15' },
    { styleCategory: 'Flat Design', type: 'General', keywords: 'flat simple clean colorful functional material cards hierarchy accessible fast', primaryColors: 'Brand primary plus neutral surface', effectsAnimation: 'Fast hover, clear pressed states, minimal transitions', bestFor: 'SaaS, productivity, mobile apps, dashboards, forms', lightMode: 'Full', darkMode: 'Full', performance: 'Excellent', accessibility: 'High', implementationChecklist: 'Clear hierarchy, strong focus states, no fake depth needed', designSystemVariables: '--radius: 8px, --shadow: none, --transition: 180ms' },
    { styleCategory: 'Dark Mode (OLED)', type: 'Dashboard', keywords: 'dark oled terminal code editor dashboard developer financial analytics high contrast', primaryColors: 'Deep navy/black backgrounds with focused accent', effectsAnimation: 'Crisp focus, subtle glow, fast keyboard interactions', bestFor: 'Developer tools, financial dashboards, monitoring, IDE-like products', lightMode: 'Partial', darkMode: 'Full', performance: 'Excellent', accessibility: 'High when contrast verified', implementationChecklist: 'Avoid pure black text issues, verify contrast, define semantic alert colors', designSystemVariables: '--surface: #020617, --foreground: #F8FAFC, --accent: #22C55E' },
    { styleCategory: 'Vibrant & Block-based', type: 'Marketing/App', keywords: 'bold blocks vibrant playful conversion colorful cards high hierarchy', primaryColors: 'Bold primary plus high-contrast accent', effectsAnimation: 'Card hover lift, scale effect, animated section reveals', bestFor: 'Micro SaaS, education, e-commerce, creator tools', lightMode: 'Full', darkMode: 'Partial', performance: 'Good', accessibility: 'Needs contrast checks', implementationChecklist: 'Large touch targets, strict color contrast, stable card dimensions', designSystemVariables: '--block-radius: 12px, --accent-contrast: 7:1' },
    { styleCategory: 'Neumorphism', type: 'Soft UI', keywords: 'soft embossed debossed health wellness calm rounded pastel', primaryColors: 'Soft blue, pink, grey pastels', effectsAnimation: 'Soft box-shadow, smooth press 150ms, subtle inner shadow', bestFor: 'Health/wellness apps, meditation, fitness trackers', lightMode: 'Full', darkMode: 'Partial', performance: 'Good', accessibility: 'Low contrast risk', implementationChecklist: 'Keep contrast high enough, use pressed state only where clear', designSystemVariables: '--radius: 14px, --shadow-soft: multiple shadows' },
    { styleCategory: 'Motion-Driven', type: 'Expressive', keywords: 'motion animation parallax scroll-triggered portfolio storytelling product demo', primaryColors: 'Depends on brand, often high contrast', effectsAnimation: 'Scroll-triggered animations, parallax, reveal choreography', bestFor: 'Portfolios, launches, product demos, creative agencies', lightMode: 'Full', darkMode: 'Full', performance: 'Medium', accessibility: 'Needs reduced motion', implementationChecklist: 'prefers-reduced-motion, no blocking animations, 150-300ms where possible', designSystemVariables: '--motion-duration: 240ms, --motion-easing: ease-out' },
  ],
  color: [
    { productType: 'SaaS (General)', primary: '#2563EB', onPrimary: '#FFFFFF', secondary: '#3B82F6', onSecondary: '#FFFFFF', accent: '#EA580C', onAccent: '#FFFFFF', background: '#F8FAFC', foreground: '#1E293B', card: '#FFFFFF', muted: '#E9EFF8', border: '#E2E8F0', destructive: '#DC2626', ring: '#2563EB', notes: 'Trust blue + orange CTA contrast.' },
    { productType: 'AI/Chatbot Platform', primary: '#2563EB', onPrimary: '#FFFFFF', secondary: '#7C3AED', onSecondary: '#FFFFFF', accent: '#0891B2', onAccent: '#FFFFFF', background: '#F8FAFC', foreground: '#1E1B4B', card: '#FFFFFF', muted: '#ECEEF9', border: '#DBEAFE', destructive: '#DC2626', ring: '#2563EB', notes: 'AI interaction palette, adjusted away from dominant purple by default.' },
    { productType: 'Developer Tool / IDE', primary: '#0F766E', onPrimary: '#FFFFFF', secondary: '#1F2937', onSecondary: '#FFFFFF', accent: '#D97706', onAccent: '#FFFFFF', background: '#F9FAFB', foreground: '#111827', card: '#FFFFFF', muted: '#E5E7EB', border: '#D1D5DB', destructive: '#DC2626', ring: '#0F766E', notes: 'Quiet technical utility with code-friendly contrast.' },
    { productType: 'Financial Dashboard', primary: '#0F172A', onPrimary: '#FFFFFF', secondary: '#1E293B', onSecondary: '#FFFFFF', accent: '#22C55E', onAccent: '#0F172A', background: '#020617', foreground: '#F8FAFC', card: '#0E1223', muted: '#1A1E2F', border: '#334155', destructive: '#EF4444', ring: '#0F172A', notes: 'Dark bg + green positive indicators.' },
    { productType: 'Analytics Dashboard', primary: '#1E40AF', onPrimary: '#FFFFFF', secondary: '#3B82F6', onSecondary: '#FFFFFF', accent: '#D97706', onAccent: '#FFFFFF', background: '#F8FAFC', foreground: '#1E3A8A', card: '#FFFFFF', muted: '#E9EEF6', border: '#DBEAFE', destructive: '#DC2626', ring: '#1E40AF', notes: 'Blue data + amber highlights.' },
    { productType: 'Healthcare App', primary: '#0891B2', onPrimary: '#FFFFFF', secondary: '#22D3EE', onSecondary: '#0F172A', accent: '#059669', onAccent: '#FFFFFF', background: '#ECFEFF', foreground: '#164E63', card: '#FFFFFF', muted: '#E8F1F6', border: '#A5F3FC', destructive: '#DC2626', ring: '#0891B2', notes: 'Calm cyan + health green.' },
    { productType: 'Educational App', primary: '#4F46E5', onPrimary: '#FFFFFF', secondary: '#818CF8', onSecondary: '#0F172A', accent: '#EA580C', onAccent: '#FFFFFF', background: '#EEF2FF', foreground: '#1E1B4B', card: '#FFFFFF', muted: '#EBEEF8', border: '#C7D2FE', destructive: '#DC2626', ring: '#4F46E5', notes: 'Playful indigo + energetic orange.' },
    { productType: 'E-commerce', primary: '#059669', onPrimary: '#FFFFFF', secondary: '#10B981', onSecondary: '#0F172A', accent: '#EA580C', onAccent: '#FFFFFF', background: '#ECFDF5', foreground: '#064E3B', card: '#FFFFFF', muted: '#E8F1F3', border: '#A7F3D0', destructive: '#DC2626', ring: '#059669', notes: 'Success green + urgency orange.' },
    { productType: 'Portfolio/Personal', primary: '#18181B', onPrimary: '#FFFFFF', secondary: '#3F3F46', onSecondary: '#FFFFFF', accent: '#2563EB', onAccent: '#FFFFFF', background: '#FAFAFA', foreground: '#09090B', card: '#FFFFFF', muted: '#E8ECF0', border: '#E4E4E7', destructive: '#DC2626', ring: '#18181B', notes: 'Monochrome + blue accent.' },
  ],
  landing: [
    { patternName: 'Hero + Features + CTA', keywords: 'hero hero-centric features feature-rich cta call-to-action saas', sectionOrder: 'Hero with headline/image > Value prop > Key features (3-5) > CTA section > Footer', primaryCtaPlacement: 'Hero sticky + Bottom', colorStrategy: 'Hero brand primary. Features card surface. CTA contrasting accent.', conversionOptimization: 'Deep CTA placement. Use contrasting color and sticky navbar CTA.' },
    { patternName: 'Product Demo + Features', keywords: 'demo product-demo features showcase interactive product demo app surface', sectionOrder: 'Hero > Product video/mockup center > Feature breakdown per section > Comparison optional > CTA', primaryCtaPlacement: 'Video center + CTA right/bottom', colorStrategy: 'Product surround uses brand color overlay; feature icons use primary.', conversionOptimization: 'Embedded product demo increases engagement. Use interactive mockup when possible.' },
    { patternName: 'AI Personalization Landing', keywords: 'ai personalization smart recommendation dynamic chatbot assistant', sectionOrder: 'Dynamic hero > Relevant features > Tailored proof/trust > Smart CTA', primaryCtaPlacement: 'Context-aware CTA near product state', colorStrategy: 'Adaptive AI interaction color with stable neutral surface.', conversionOptimization: 'Show personalized output state and fallback for new users.' },
    { patternName: 'Minimal & Direct + Documentation', keywords: 'minimal direct documentation docs developer cli command api sdk', sectionOrder: 'Hero command/product UI > Quickstart > Workflow proof > Docs/API examples > CTA', primaryCtaPlacement: 'Hero command + docs CTA', colorStrategy: 'Neutral technical surface with one accent.', conversionOptimization: 'Fast path to command, docs, and proof.' },
    { patternName: 'Portfolio Grid', keywords: 'portfolio grid showcase gallery masonry visual case study', sectionOrder: 'Hero identity > Project grid > About/process > Contact', primaryCtaPlacement: 'Project cards + footer contact', colorStrategy: 'Neutral background lets work dominate.', conversionOptimization: 'Visuals first, filters by category, fast image loading.' },
    { patternName: 'Feature-Rich Showcase', keywords: 'feature-rich showcase ecommerce education product benefits social proof', sectionOrder: 'Hero > Feature sections > Social proof > Pricing or CTA > Footer', primaryCtaPlacement: 'Hero + post-proof CTA', colorStrategy: 'High contrast CTA with structured feature surfaces.', conversionOptimization: 'Show proof before final CTA.' },
  ],
  typography: [
    { fontPairingName: 'Tech Startup', category: 'Sans + Sans', headingFont: 'Space Grotesk', bodyFont: 'DM Sans', moodKeywords: 'tech startup modern innovative bold futuristic', bestFor: 'Tech companies, startups, SaaS, developer tools, AI products', googleFontsUrl: 'https://fonts.google.com/share?selection.family=DM+Sans:wght@400;500;700|Space+Grotesk:wght@400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');" },
    { fontPairingName: 'Minimal Swiss', category: 'Sans + Sans', headingFont: 'Inter', bodyFont: 'Inter', moodKeywords: 'minimal clean swiss functional neutral professional dashboard documentation', bestFor: 'Dashboards, admin panels, documentation, enterprise apps, design systems', googleFontsUrl: 'https://fonts.google.com/share?selection.family=Inter:wght@300;400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');" },
    { fontPairingName: 'Developer Mono', category: 'Mono + Sans', headingFont: 'JetBrains Mono', bodyFont: 'IBM Plex Sans', moodKeywords: 'code developer technical precise functional hacker cli docs', bestFor: 'Developer tools, documentation, code editors, tech blogs, CLI apps', googleFontsUrl: 'https://fonts.google.com/share?selection.family=IBM+Plex+Sans:wght@300;400;500;600;700|JetBrains+Mono:wght@400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');" },
    { fontPairingName: 'Modern Professional', category: 'Sans + Sans', headingFont: 'Poppins', bodyFont: 'Open Sans', moodKeywords: 'modern professional clean corporate friendly approachable', bestFor: 'SaaS, corporate sites, business apps, startups, professional services', googleFontsUrl: 'https://fonts.google.com/share?selection.family=Open+Sans:wght@300;400;500;600;700|Poppins:wght@400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap');" },
    { fontPairingName: 'Classic Elegant', category: 'Serif + Sans', headingFont: 'Playfair Display', bodyFont: 'Inter', moodKeywords: 'elegant luxury sophisticated timeless premium editorial portfolio', bestFor: 'Luxury brands, fashion, spa, beauty, editorial, high-end e-commerce', googleFontsUrl: 'https://fonts.google.com/share?selection.family=Inter:wght@300;400;500;600;700|Playfair+Display:wght@400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap');" },
    { fontPairingName: 'Wellness Calm', category: 'Serif + Sans', headingFont: 'Lora', bodyFont: 'Raleway', moodKeywords: 'calm wellness health relaxing natural organic', bestFor: 'Health apps, wellness, spa, meditation, yoga, organic brands', googleFontsUrl: 'https://fonts.google.com/share?selection.family=Lora:wght@400;500;600;700|Raleway:wght@300;400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Raleway:wght@300;400;500;600;700&display=swap');" },
    { fontPairingName: 'Playful Creative', category: 'Display + Sans', headingFont: 'Fredoka', bodyFont: 'Nunito', moodKeywords: 'playful friendly fun creative warm approachable education', bestFor: 'Educational, gaming, creative tools, entertainment', googleFontsUrl: 'https://fonts.google.com/share?selection.family=Fredoka:wght@400;500;600;700|Nunito:wght@300;400;500;600;700', cssImport: "@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@300;400;500;600;700&display=swap');" },
  ],
};

const SEARCH_FIELDS = {
  product: ['productType', 'keywords', 'primaryStyle', 'secondaryStyles', 'landingPattern', 'dashboardStyle', 'colorFocus', 'keyConsiderations'],
  style: ['styleCategory', 'type', 'keywords', 'primaryColors', 'effectsAnimation', 'bestFor', 'implementationChecklist', 'designSystemVariables'],
  color: ['productType', 'primary', 'secondary', 'accent', 'background', 'foreground', 'notes'],
  landing: ['patternName', 'keywords', 'sectionOrder', 'primaryCtaPlacement', 'colorStrategy', 'conversionOptimization'],
  typography: ['fontPairingName', 'category', 'headingFont', 'bodyFont', 'moodKeywords', 'bestFor'],
};

const PRIORITY_RULES = [
  {
    priority: 1,
    category: 'Accessibility',
    impact: 'critical',
    checks: ['WCAG AA contrast', 'visible focus states', 'keyboard navigation', 'labels for icon-only controls'],
    avoid: ['removing focus rings', 'color-only meaning', 'placeholder-only labels'],
  },
  {
    priority: 2,
    category: 'Touch and interaction',
    impact: 'critical',
    checks: ['44px minimum touch target', '8px spacing between targets', 'press/loading/error feedback'],
    avoid: ['hover-only affordances', 'instant unexplained state changes', 'tiny click targets'],
  },
  {
    priority: 3,
    category: 'Performance and stability',
    impact: 'high',
    checks: ['reserved media dimensions', 'lazy loading below fold', 'transform/opacity animation only'],
    avoid: ['layout shift', 'animating width/height', 'unbounded third-party scripts'],
  },
  {
    priority: 4,
    category: 'Style selection',
    impact: 'high',
    checks: ['style matches product category', 'one icon language', 'semantic color tokens'],
    avoid: ['mixed visual styles', 'emoji as icons', 'raw hex scattered through components'],
  },
  {
    priority: 5,
    category: 'Layout and responsive',
    impact: 'high',
    checks: ['mobile-first 375/768/1024/1440 verification', 'no horizontal scroll', 'stable dimensions for fixed-format UI'],
    avoid: ['fixed px page widths', 'nested cards as page layout', 'text overflow or overlap'],
  },
  {
    priority: 6,
    category: 'Typography and color',
    impact: 'medium',
    checks: ['16px minimum body on mobile', '1.5 line-height', 'semantic foreground/background pairs'],
    avoid: ['body text under 12px', 'gray-on-gray contrast', 'negative letter spacing'],
  },
  {
    priority: 7,
    category: 'Animation',
    impact: 'medium',
    checks: ['150-300ms purposeful motion', 'reduced-motion fallback', 'interruptible transitions'],
    avoid: ['decorative-only motion', 'blocking input during animation', 'motion longer than 500ms'],
  },
  {
    priority: 8,
    category: 'Forms and feedback',
    impact: 'medium',
    checks: ['visible labels', 'inline errors near fields', 'recovery path for failures'],
    avoid: ['errors only at top', 'no loading state', 'destructive actions without confirmation'],
  },
  {
    priority: 9,
    category: 'Navigation',
    impact: 'high',
    checks: ['predictable back behavior', 'active location state', 'deep links for key screens'],
    avoid: ['overloaded nav', 'broken back stack', 'icon-only primary nav'],
  },
  {
    priority: 10,
    category: 'Charts and data',
    impact: 'low',
    checks: ['legend/tooltips', 'accessible color pairs', 'data fallback text'],
    avoid: ['color-only encoding', 'unlabeled axes', 'chart type mismatched to data shape'],
  },
];

const STACK_RULES = {
  'nextjs-vercel': [
    'Prefer server components for data-heavy UI and isolate client components to interactive islands.',
    'Use Next/Image or explicit image dimensions to prevent layout shift.',
    'Keep server-only secrets outside client bundles; public env vars must use NEXT_PUBLIC_ only when safe.',
  ],
  'react-vite': [
    'Keep reusable UI primitives small and colocated with feature surfaces until duplication proves abstraction.',
    'Reserve space for async content and test keyboard navigation in browser.',
  ],
  'static-html-css-js': [
    'Use semantic HTML first, CSS variables for tokens, and progressive enhancement for interactions.',
    'Avoid adding a framework unless acceptance or deployment evidence requires it.',
  ],
};

function stackGuidelines(stack) {
  return STACK_RULES[safeString(stack).trim()] || [
    'Match the repository stack and existing component conventions.',
    'Prefer semantic HTML, stable layout dimensions, and explicit focus states.',
  ];
}

function tokenize(text) {
  return safeString(text)
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function rowText(row, fields) {
  return fields.map((field) => safeString(row[field])).join(' ');
}

function unique(values) {
  return [...new Set(values)];
}

// Ported and adapted from ui-ux-pro-max core.py BM25 search.
function searchDomain(query, domain, maxResults = 3) {
  const rows = UI_PRO_MAX_DATASETS[domain] || [];
  const fields = SEARCH_FIELDS[domain] || Object.keys(rows[0] || {});
  if (rows.length === 0) return [];

  const corpus = rows.map((row) => tokenize(rowText(row, fields)));
  const avgdl = corpus.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(corpus.length, 1);
  const queryTokens = unique(tokenize(query));
  const docFreq = new Map();
  for (const token of queryTokens) {
    docFreq.set(token, corpus.filter((doc) => doc.includes(token)).length);
  }

  const k1 = 1.5;
  const b = 0.75;
  return rows
    .map((row, index) => {
      const doc = corpus[index];
      const dl = Math.max(doc.length, 1);
      let score = 0;
      for (const token of queryTokens) {
        const tf = doc.filter((item) => item === token).length;
        if (tf === 0) continue;
        const df = docFreq.get(token) || 0;
        const idf = Math.log((rows.length - df + 0.5) / (df + 0.5) + 1);
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgdl))));
      }
      const haystack = rowText(row, fields).toLowerCase();
      for (const token of queryTokens) {
        if (haystack.includes(token)) score += 0.12;
      }
      return { ...row, _score: Number(score.toFixed(4)), _domain: domain };
    })
    .sort((left, right) => right._score - left._score)
    .slice(0, maxResults);
}

function parsePlusList(value, fallback = []) {
  const items = safeString(value)
    .split(/\s*\+\s*|,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function findReasoningRule(category) {
  const categoryLower = safeString(category).toLowerCase();
  for (const rule of UI_PRO_MAX_DATASETS.reasoning) {
    if (safeString(rule.uiCategory).toLowerCase() === categoryLower) return rule;
  }
  for (const rule of UI_PRO_MAX_DATASETS.reasoning) {
    const candidate = safeString(rule.uiCategory).toLowerCase();
    if (candidate.includes(categoryLower) || categoryLower.includes(candidate)) return rule;
  }
  const categoryTokens = tokenize(categoryLower.replace(/[/-]/g, ' '));
  return UI_PRO_MAX_DATASETS.reasoning.find((rule) => {
    const candidateTokens = tokenize(safeString(rule.uiCategory).replace(/[/-]/g, ' '));
    return candidateTokens.some((token) => categoryTokens.includes(token));
  }) || null;
}

function parseDecisionRules(value) {
  try {
    return JSON.parse(safeString(value) || '{}');
  } catch {
    return {};
  }
}

// Ported and adapted from ui-ux-pro-max design_system.py _apply_reasoning.
function applyReasoning(category) {
  const rule = findReasoningRule(category);
  if (!rule) {
    return {
      pattern: 'Hero + Features + CTA',
      stylePriority: ['Minimalism', 'Flat Design'],
      colorMood: 'Professional',
      typographyMood: 'Clean',
      keyEffects: 'Subtle hover transitions',
      antiPatterns: '',
      decisionRules: {},
      severity: 'MEDIUM',
    };
  }
  return {
    pattern: rule.recommendedPattern || 'Hero + Features + CTA',
    stylePriority: parsePlusList(rule.stylePriority, ['Minimalism', 'Flat Design']),
    colorMood: rule.colorMood || '',
    typographyMood: rule.typographyMood || '',
    keyEffects: rule.keyEffects || '',
    antiPatterns: rule.antiPatterns || '',
    decisionRules: parseDecisionRules(rule.decisionRules),
    severity: rule.severity || 'MEDIUM',
  };
}

// Ported and adapted from ui-ux-pro-max design_system.py _multi_domain_search.
function multiDomainSearch(query, { category = '', reasoning = {} } = {}) {
  const stylePriority = reasoning.stylePriority || [];
  const results = {};
  for (const [domain, config] of Object.entries(SEARCH_CONFIG)) {
    let searchQuery = query;
    if (domain === 'style' && stylePriority.length > 0) searchQuery = `${query} ${stylePriority.slice(0, 2).join(' ')}`;
    if (domain === 'color') searchQuery = `${query} ${category} ${reasoning.colorMood || ''}`;
    if (domain === 'landing') searchQuery = `${query} ${reasoning.pattern || ''}`;
    if (domain === 'typography') searchQuery = `${query} ${reasoning.typographyMood || ''}`;
    results[domain] = searchDomain(searchQuery, domain, config.maxResults);
  }
  return results;
}

// Ported and adapted from ui-ux-pro-max design_system.py _select_best_match.
function selectBestMatch(results, priorityKeywords = [], nameField = 'styleCategory') {
  if (!results || results.length === 0) return {};
  if (!priorityKeywords || priorityKeywords.length === 0) return results[0];
  for (const priority of priorityKeywords) {
    const priorityLower = safeString(priority).toLowerCase().trim();
    for (const result of results) {
      const name = safeString(result[nameField]).toLowerCase();
      if (priorityLower && (name.includes(priorityLower) || priorityLower.includes(name))) return result;
    }
  }
  const scored = results.map((result) => {
    const row = JSON.stringify(result).toLowerCase();
    let score = result._score || 0;
    for (const keyword of priorityKeywords) {
      const keywordLower = safeString(keyword).toLowerCase().trim();
      if (!keywordLower) continue;
      if (safeString(result[nameField]).toLowerCase().includes(keywordLower)) score += 10;
      else if (safeString(result.keywords).toLowerCase().includes(keywordLower)) score += 3;
      else if (row.includes(keywordLower)) score += 1;
    }
    return { result, score };
  });
  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.result || results[0];
}

function splitSections(value, fallback) {
  const text = safeString(value);
  const sections = text
    .split(/\s*>\s*|,\s*(?=\d+\.|\w)/)
    .map((item) => item.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
  return sections.length > 0 ? sections : fallback;
}

function slugCategory(value) {
  const normalized = safeString(value).toLowerCase();
  if (/ai|chatbot|llm|copilot|agent/.test(normalized)) return 'ai-saas';
  if (/developer|ide|documentation|knowledge/.test(normalized)) return 'developer-tool';
  if (/commerce|shop|store/.test(normalized)) return 'commerce';
  if (/financial/.test(normalized)) return 'financial-dashboard';
  if (/analytics|dashboard/.test(normalized)) return 'analytics-dashboard';
  if (/health|wellness|medical/.test(normalized)) return 'wellness';
  if (/education|learning|study/.test(normalized)) return 'education';
  if (/portfolio|personal/.test(normalized)) return 'portfolio';
  return slugify(value || 'generic-web');
}

function effectList(...values) {
  const items = values.flatMap((value) => parsePlusList(value));
  return items.length > 0 ? unique(items) : ['150-250ms hover transitions', 'focus-visible rings'];
}

function avoidList(value, style) {
  const items = parsePlusList(value);
  if (safeString(style).toLowerCase().includes('glass')) {
    items.push('Low-contrast frosted surfaces without an opaque fallback');
  }
  items.push('Nested cards as page layout', 'Text overflow or overlap', 'Decorative blobs that do not clarify the product');
  return unique(items).filter(Boolean);
}

export function buildDesignSystem({ objective, projectName, stack, page, mode } = {}) {
  const designMode = normalizeDesignSystemMode(mode);
  const query = safeString(objective).trim() || 'web app';
  const productResult = searchDomain(query, 'product', 1);
  const product = productResult[0] || {};
  const categoryName = product.productType || 'General';
  const reasoning = applyReasoning(categoryName);
  const searchResults = multiDomainSearch(query, { category: categoryName, reasoning });
  searchResults.product = productResult;

  const bestStyle = selectBestMatch(searchResults.style, reasoning.stylePriority, 'styleCategory');
  const bestColor = searchResults.color?.[0] || {};
  const bestTypography = searchResults.typography?.[0] || {};
  const bestLanding = searchResults.landing?.[0] || {};
  const patternName = bestLanding.patternName || product.landingPattern || reasoning.pattern;
  const sections = splitSections(bestLanding.sectionOrder || product.landingPattern, [
    'Hero with concrete product state',
    'Primary workflow',
    'Key features',
    'Verification or trust',
    'CTA/footer',
  ]);
  const styleName = bestStyle.styleCategory || product.primaryStyle || reasoning.stylePriority.join(' + ');
  const effects = effectList(bestStyle.effectsAnimation, reasoning.keyEffects);
  const colors = {
    primary: bestColor.primary || '#2563EB',
    onPrimary: bestColor.onPrimary || '#FFFFFF',
    secondary: bestColor.secondary || '#334155',
    onSecondary: bestColor.onSecondary || '#FFFFFF',
    accent: bestColor.accent || '#EA580C',
    onAccent: bestColor.onAccent || '#FFFFFF',
    background: bestColor.background || '#F8FAFC',
    foreground: bestColor.foreground || '#1E293B',
    card: bestColor.card || '#FFFFFF',
    muted: bestColor.muted || '#E9EFF8',
    border: bestColor.border || '#CBD5E1',
    destructive: bestColor.destructive || '#DC2626',
    ring: bestColor.ring || bestColor.primary || '#2563EB',
    notes: bestColor.notes || reasoning.colorMood,
  };
  const typography = {
    heading: bestTypography.headingFont || 'Inter',
    body: bestTypography.bodyFont || 'Inter',
    mood: bestTypography.moodKeywords || reasoning.typographyMood,
    bestFor: bestTypography.bestFor || '',
    googleFontsUrl: bestTypography.googleFontsUrl || '',
    cssImport: bestTypography.cssImport || '',
  };
  return {
    source: 'oh-my-goal/design-system-runtime:ported-ui-ux-pro-max-core',
    mode: designMode,
    external_analysis: 'Ported and reshaped from ui-ux-pro-max-skill code paths: BM25-style domain search, product classification, reasoning rules, multi-domain design-system generation, best-match selection, MASTER.md plus page overrides, and pre-delivery UI checks.',
    upstream_evidence: {
      ...UI_UX_PRO_MAX_SOURCE,
      adapted_patterns: ['core.py BM25 search', 'design_system.py _multi_domain_search', 'design_system.py _apply_reasoning', 'design_system.py _select_best_match', 'format_master_md persistence model', 'priority QA checklist'],
    },
    project_name: safeString(projectName).trim() || query,
    page: safeString(page).trim() || undefined,
    stack: safeString(stack).trim() || 'auto',
    category: slugCategory(categoryName),
    ui_pro_max: {
      category: categoryName,
      product,
      reasoning,
      matches: Object.fromEntries(Object.entries(searchResults).map(([domain, rows]) => [domain, rows.map((row) => ({ label: row.productType || row.styleCategory || row.patternName || row.fontPairingName || row.uiCategory || domain, score: row._score }))])),
    },
    pattern: patternName,
    pattern_details: {
      cta_placement: bestLanding.primaryCtaPlacement || 'Above fold',
      color_strategy: bestLanding.colorStrategy || product.colorFocus || reasoning.colorMood,
      conversion: bestLanding.conversionOptimization || '',
    },
    sections,
    style: styleName,
    style_details: {
      type: bestStyle.type || 'General',
      keywords: bestStyle.keywords || '',
      best_for: bestStyle.bestFor || '',
      performance: bestStyle.performance || '',
      accessibility: bestStyle.accessibility || '',
      implementation_checklist: bestStyle.implementationChecklist || '',
      variables: bestStyle.designSystemVariables || '',
    },
    colors,
    typography,
    effects,
    avoid: avoidList(reasoning.antiPatterns, styleName),
    decision_rules: reasoning.decisionRules,
    severity: reasoning.severity,
    priority_rules: PRIORITY_RULES,
    stack_guidelines: stackGuidelines(stack),
    tokens: {
      primitive: {
        'color-primary-base': colors.primary,
        'color-secondary-base': colors.secondary,
        'color-accent-base': colors.accent,
        'color-surface-base': colors.background,
        'color-card-base': colors.card,
        'color-muted-base': colors.muted,
        'color-white': '#FFFFFF',
        'font-heading-base': typography.heading,
        'font-body-base': typography.body,
        'space-1': '4px',
        'space-2': '8px',
        'space-3': '12px',
        'space-4': '16px',
        'radius-sm': '4px',
        'radius-md': '8px',
      },
      semantic: {
        'color-primary': 'var(--color-primary-base)',
        'color-secondary': 'var(--color-secondary-base)',
        'color-accent': 'var(--color-accent-base)',
        'color-background': 'var(--color-surface-base)',
        'color-card': 'var(--color-card-base)',
        'color-muted': 'var(--color-muted-base)',
        'color-primary-foreground': 'var(--color-white)',
        'color-secondary-foreground': colors.onSecondary,
        'color-accent-foreground': colors.onAccent,
        'color-foreground': colors.foreground,
        'color-border': colors.border,
        'color-destructive': colors.destructive,
        'color-ring': colors.ring,
        'font-display': 'var(--font-heading-base)',
        'font-body': 'var(--font-body-base)',
        'duration-fast': '180ms',
        'focus-ring': '0 0 0 3px color-mix(in srgb, var(--color-primary) 28%, transparent)',
      },
      component: {
        button: ['--button-bg: var(--color-primary)', '--button-fg: var(--color-primary-foreground)', '--button-hover-bg: var(--color-secondary)', '--button-disabled-bg: var(--color-border)', '--button-radius: var(--radius-md)', '--button-transition: background var(--duration-fast) ease'],
        card: ['--card-bg: var(--color-background)', '--card-border: var(--color-border)', '--card-radius: var(--radius-md)', '--card-shadow: none'],
        input: ['--input-border: var(--color-border)', '--input-focus-ring: var(--focus-ring)', '--input-radius: var(--radius-sm)', '--input-bg: var(--color-background)', '--input-fg: var(--color-foreground)'],
      },
    },
    checklist: [
      'Use lucide or existing icon library instead of emoji-like text symbols.',
      'Every clickable element has pointer affordance, hover state, and focus-visible state.',
      'Use generated primitive, semantic, and component tokens instead of scattering raw visual values.',
      'Text contrast meets WCAG AA; verify light mode contrast before delivery.',
      'Respect prefers-reduced-motion and keep animation purposeful.',
      'Verify responsive layouts at 375px, 768px, 1024px, and 1440px.',
      'Use stable dimensions for fixed-format controls, grids, and cards.',
      'Avoid one-note palettes, nested cards, text overlap, and decorative blobs.',
    ],
  };
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function colorRows(system) {
  return [
    ['Primary', system.colors.primary, '--color-primary'],
    ['On Primary', system.colors.onPrimary, '--color-primary-foreground'],
    ['Secondary', system.colors.secondary, '--color-secondary'],
    ['On Secondary', system.colors.onSecondary, '--color-secondary-foreground'],
    ['Accent/CTA', system.colors.accent, '--color-accent'],
    ['On Accent', system.colors.onAccent, '--color-accent-foreground'],
    ['Background', system.colors.background, '--color-background'],
    ['Foreground', system.colors.foreground, '--color-foreground'],
    ['Card', system.colors.card, '--color-card'],
    ['Muted', system.colors.muted, '--color-muted'],
    ['Border', system.colors.border, '--color-border'],
    ['Destructive', system.colors.destructive, '--color-destructive'],
    ['Focus Ring', system.colors.ring, '--color-ring'],
  ];
}

function formatFullDesignSystemMarkdown(system) {
  return [
    `# Design System: ${system.project_name}`,
    '',
    `Source: ${system.source}`,
    `Design system mode: ${system.mode}`,
    `Upstream analysis: ${system.upstream_evidence.repository} @ ${system.upstream_evidence.reviewed_commit}`,
    `Category: ${system.category}`,
    `UI/UX Pro Max category: ${system.ui_pro_max?.category || system.category}`,
    `Stack: ${system.stack}`,
    system.page ? `Page override: ${system.page}` : undefined,
    '',
    '## Ported Search Evidence',
    '- Runtime model: ported from UI/UX Pro Max `core.py` BM25 search and `design_system.py` product -> reasoning -> multi-domain selection flow.',
    '- Domains searched: product, style, color, landing, typography.',
    markdownTable(
      ['Domain', 'Best Match', 'Score'],
      Object.entries(system.ui_pro_max?.matches || {}).map(([domain, rows]) => [
        domain,
        rows[0]?.label || 'none',
        rows[0]?.score === undefined ? 'n/a' : String(rows[0].score),
      ]),
    ),
    '',
    '## Pattern',
    '- Reference Model: ported and reshaped from ui-ux-pro-max-skill code snippets for product classification, style, color, typography, and UI checks.',
    `- Name: ${system.pattern}`,
    `- CTA placement: ${system.pattern_details?.cta_placement || 'Above fold'}`,
    `- Color strategy: ${system.pattern_details?.color_strategy || 'Use product category palette'}`,
    system.pattern_details?.conversion ? `- Conversion: ${system.pattern_details.conversion}` : undefined,
    '- Sections:',
    ...system.sections.map((section, index) => `  ${index + 1}. ${section}`),
    '',
    '## Style',
    `- Direction: ${system.style}`,
    system.style_details?.best_for ? `- Best for: ${system.style_details.best_for}` : undefined,
    system.style_details?.performance ? `- Performance: ${system.style_details.performance}` : undefined,
    system.style_details?.accessibility ? `- Accessibility: ${system.style_details.accessibility}` : undefined,
    system.style_details?.implementation_checklist ? `- Implementation checklist: ${system.style_details.implementation_checklist}` : undefined,
    '- Effects:',
    ...system.effects.map((effect) => `  - ${effect}`),
    '',
    '## Colors',
    markdownTable(
      ['Role', 'Hex', 'CSS Variable'],
      colorRows(system),
    ),
    '',
    '## Typography',
    `- Heading: ${system.typography.heading}`,
    `- Body: ${system.typography.body}`,
    system.typography.mood ? `- Mood: ${system.typography.mood}` : undefined,
    system.typography.bestFor ? `- Best for: ${system.typography.bestFor}` : undefined,
    system.typography.googleFontsUrl ? `- Google Fonts: ${system.typography.googleFontsUrl}` : undefined,
    system.typography.cssImport ? ['- CSS import:', '```css', system.typography.cssImport, '```'].join('\n') : undefined,
    '',
    '## Reasoning Rules',
    `- Severity: ${system.severity || 'MEDIUM'}`,
    ...Object.entries(system.decision_rules || {}).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Token Architecture',
    'Use a three-layer token structure so the goal can change visual direction without rewriting every component.',
    '',
    '### Primitive Tokens',
    markdownTable(
      ['Token', 'Value'],
      Object.entries(system.tokens.primitive).map(([key, value]) => [`--${key}`, value]),
    ),
    '',
    '### Semantic Tokens',
    markdownTable(
      ['Token', 'Value'],
      Object.entries(system.tokens.semantic).map(([key, value]) => [`--${key}`, value]),
    ),
    '',
    '### Component Tokens',
    ...Object.entries(system.tokens.component).flatMap(([component, tokens]) => [
      `- ${component}:`,
      ...tokens.map((token) => `  - \`${token}\``),
    ]),
    '',
    '## Stack Guidelines',
    ...system.stack_guidelines.map((item) => `- ${item}`),
    '',
    '## Priority QA Rules',
    markdownTable(
      ['Priority', 'Category', 'Impact', 'Must Check', 'Avoid'],
      system.priority_rules.map((rule) => [
        String(rule.priority),
        rule.category,
        rule.impact,
        rule.checks.join('; '),
        rule.avoid.join('; '),
      ]),
    ),
    '',
    '## Avoid',
    ...system.avoid.map((item) => `- ${item}`),
    '',
    '## Pre-Delivery Checklist',
    ...system.checklist.map((item) => `- [ ] ${item}`),
    '',
    '## Harness Rule',
    'Design is not subjective polish after implementation. Treat this file as a quality gate: implementation, tester, and critic lanes must cite it when accepting or rejecting UI work.',
  ].filter((line) => line !== undefined).join('\n');
}

function formatLightweightDesignChecklist(system) {
  return [
    `# Design System: ${system.project_name}`,
    '',
    `Source: ${system.source}`,
    `Design system mode: ${system.mode}`,
    `Upstream analysis: ${system.upstream_evidence.repository} @ ${system.upstream_evidence.reviewed_commit}`,
    `Category: ${system.category}`,
    `Stack: ${system.stack}`,
    '',
    '## Lightweight UI Quality Checklist',
    'This intake mode intentionally avoids a full token system. Use these checks as the minimum UI quality gate.',
    '',
    '## Recommended Direction',
    `- Pattern: ${system.pattern}`,
    `- Style: ${system.style}`,
    `- Typography: ${system.typography.heading} headings, ${system.typography.body} body`,
    system.colors.notes ? `- Palette note: ${system.colors.notes}` : undefined,
    '',
    '## Essential Colors',
    markdownTable(
      ['Role', 'Hex', 'CSS Variable'],
      colorRows(system).filter(([role]) => ['Primary', 'On Primary', 'Accent/CTA', 'On Accent', 'Background', 'Foreground', 'Border', 'Focus Ring'].includes(role)),
    ),
    '',
    '## Must Pass',
    '- Layout fits at 375px, 768px, 1024px, and 1440px without text overlap.',
    '- Interactive controls have hover, pressed, disabled, and focus-visible states.',
    '- Text contrast meets WCAG AA for selected foreground/background pairs.',
    '- Motion is short, purposeful, and respects prefers-reduced-motion.',
    '- No nested page cards, decorative blobs, or one-note palette drift.',
    '',
    '## Harness Rule',
    'Use this file as a compact UI gate. Do not expand into a full design system unless the user changes the intake decision.',
  ].filter((line) => line !== undefined).join('\n');
}

function formatExistingDesignSystemAlignment(system) {
  return [
    `# Design System: ${system.project_name}`,
    '',
    `Source: ${system.source}`,
    `Design system mode: ${system.mode}`,
    `Category fallback: ${system.category}`,
    `Stack: ${system.stack}`,
    '',
    '## Repository-First Rule',
    'The selected intake mode is to match the existing design system. Before adding UI, inspect current tokens, CSS variables, component primitives, spacing, typography, and icon usage in the repository.',
    '',
    '## Existing-System Audit',
    '- Identify theme files, global CSS, Tailwind config, design tokens, or component libraries already present.',
    '- Reuse existing buttons, inputs, cards, layout primitives, icons, and state styles before adding new ones.',
    '- If a new token is unavoidable, name it consistently with the repo convention and record why the existing set was insufficient.',
    '- The designer and critic lanes should reject UI that conflicts with established repo patterns.',
    '',
    '## Fallback Reference',
    'Use the ported UI/UX Pro Max guidance below only for gaps not covered by the existing repo design system.',
    '',
    formatFullDesignSystemMarkdown({ ...system, mode: 'match-existing-design-system fallback' }),
  ].filter((line) => line !== undefined).join('\n');
}

function formatSkippedDesignSystem(system) {
  return [
    `# Design System: ${system.project_name}`,
    '',
    `Source: ${system.source}`,
    `Design system mode: ${system.mode}`,
    `Stack: ${system.stack}`,
    '',
    '## Skipped By Intake',
    'The selected intake mode skips design-system generation. Do not auto-start the design-system runtime and do not spend worker lanes inventing a visual system.',
    '',
    '## Minimal UI Safety Gate',
    '- Preserve existing repository UI conventions.',
    '- Avoid text overlap, unreadable contrast, broken focus states, and mobile overflow.',
    '- Do not add decorative UI or broad styling work unless it is required by acceptance criteria.',
    '- For website/app work, still verify the final screen at the primary mobile and desktop breakpoints.',
    '',
    '## Harness Rule',
    'This file records an explicit skip decision so the goal does not silently generate or enforce a full design system.',
  ].join('\n');
}

export function formatDesignSystemMarkdown(system) {
  const mode = normalizeDesignSystemMode(system?.mode);
  if (mode === 'skip-design-system') return formatSkippedDesignSystem({ ...system, mode });
  if (mode === 'lightweight-design-checklist') return formatLightweightDesignChecklist({ ...system, mode });
  if (mode === 'match-existing-design-system') return formatExistingDesignSystemAlignment({ ...system, mode });
  return formatFullDesignSystemMarkdown({ ...system, mode: 'generate-design-system' });
}

function parseArgs(argv) {
  const parsed = { cwd: process.cwd(), json: false, persist: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--persist') {
      parsed.persist = true;
      continue;
    }
    if (['--objective', '--project', '--slug', '--stack', '--page', '--cwd', '--mode'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2)] = value;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    parsed.objective = [parsed.objective, arg].filter(Boolean).join(' ');
  }
  return parsed;
}

async function writeAtomic(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, content, 'utf-8');
  await rename(tmp, path);
}

async function persistDesignSystem({ cwd, slug, system, markdown }) {
  const root = join(cwd, '.omg', 'design-systems', slug);
  const master = join(root, 'MASTER.md');
  await writeAtomic(master, `${markdown}\n`);
  const written = [relative(cwd, master)];
  if (system.page) {
    const pagePath = join(root, 'pages', `${slugify(system.page)}.md`);
    await writeAtomic(pagePath, [
      `# Page Override: ${system.page}`,
      '',
      `Base system: ../MASTER.md`,
      '',
      'Use this file only for page-specific deviations. Anything not specified here inherits from MASTER.md.',
      '',
      '## Page-Specific Questions',
      '- What is the primary user task on this page?',
      '- Which component states must be visible without scrolling?',
      '- Which responsive breakpoint is most likely to fail?',
      '- Which accessibility or interaction rule from MASTER.md is highest risk here?',
      '',
      '## Override Slots',
      '- Layout variation: TBD',
      '- Component density: inherit',
      '- Motion variation: inherit',
      '- Data/chart rule: inherit unless this page includes charts',
      '- Verification probe: screenshot or browser check at 375px, 768px, 1024px, and 1440px',
      '',
    ].join('\n'));
    written.push(relative(cwd, pagePath));
  }
  return { root: relative(cwd, root), written };
}

function printHelp() {
  console.log(`oh-my-goal design-system-runtime

Usage:
  node scripts/design-system-runtime.mjs --objective "<objective>" [--project <name>] [--stack <stack>] [--mode generate-design-system|lightweight-design-checklist|match-existing-design-system|skip-design-system] [--persist] [--json]

Purpose:
  Generate an Oh My Goal design-system artifact for web/app work. The model is
  ported and reshaped from ui-ux-pro-max-skill product/style/color/typography
  code paths. Mode controls whether the harness uses a full system, a compact
  checklist, existing-repo alignment, or an explicit skip record.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const cwd = resolve(args.cwd || process.cwd());
  const objective = safeString(args.objective).trim();
  if (!objective) throw new Error('Missing --objective.');
  const slug = slugify(args.slug || args.project || objective);
  const system = buildDesignSystem({ objective, projectName: args.project || args.slug, stack: args.stack, page: args.page, mode: args.mode });
  const markdown = formatDesignSystemMarkdown(system);
  const persisted = args.persist ? await persistDesignSystem({ cwd, slug, system, markdown }) : undefined;
  const payload = { ok: true, slug, system, markdown, ...(persisted ? { persisted } : {}) };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`[oh-my-goal design-system-runtime] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
