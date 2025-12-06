# mini-lit

Lightweight Lit components with shadcn-inspired theming, Tailwind CSS v4 styling, and Lucide icons.

**[View Live Demo & Interactive Documentation →](https://minilit.mariozechner.at)**
Explore all components with live examples, copy-paste code snippets, and interactive playgrounds.

## Features

- **Two Types of Components**: Functional components for stateless UI elements (Button, Card, Badge) and Custom elements for components with internal state (theme-toggle, language-selector)
- **shadcn/ui Themes**: Compatible with shadcn/ui design system. Built-in default and Claude themes. Dark mode support via `dark` class
- **TypeScript First**: Full TypeScript support with type definitions. IDE autocomplete for all components and i18n
- **Tailwind CSS v4**: Modern styling with the latest Tailwind features
- **Lucide Icons**: Complete icon set with tree-shaking support

## Quick Start

### 1. Installation

```bash
npm install lit @mariozechner/mini-lit
```

### 2. Setup Tailwind CSS v4

#### Option A: Vite Plugin (Recommended)

```bash
npm install -D @tailwindcss/vite
```

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
   plugins: [tailwindcss()],
});
```

#### Option B: Tailwind CLI

```bash
npm install -D @tailwindcss/cli
```

```json
// package.json scripts
"scripts": {
  "dev": "tailwindcss -i ./src/app.css -o ./dist/app.css --watch",
  "build": "tailwindcss -i ./src/app.css -o ./dist/app.css --minify"
}
```

### 3. Configure CSS

```css
/* src/app.css */

/* Import theme (includes dark mode and utilities) */
@import "@mariozechner/mini-lit/styles/themes/default.css";

/* Tell Tailwind to scan mini-lit components */
@source "../node_modules/@mariozechner/mini-lit/dist";

/* Import Tailwind */
@import "tailwindcss";
```

### 4. Configure TypeScript (Important for LitElement)

If you're using LitElement components with decorators (custom elements or your own components extending LitElement), you **must** configure TypeScript properly:

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "useDefineForClassFields": false  // Critical for LitElement reactivity!
  }
}
```

**Note:** `useDefineForClassFields: false` is essential for LitElement's `@property()` and `@state()` decorators to work correctly. Without this setting, reactive properties won't trigger updates properly.

### 5. Use Components

```typescript
import { html, render } from "lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { Card } from "@mariozechner/mini-lit/dist/Card.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import "@mariozechner/mini-lit/dist/ThemeToggle.js";
import { Send } from "lucide";
import "./app.css";

const App = () => html`
   <div class="p-8 bg-background text-foreground min-h-screen">
      <!-- mini-lit components with internal state are full LitElement instances with custom tags -->
      <theme-toggle class="fixed top-4 right-4"></theme-toggle>

      <!-- mini-lit components without internal state are functional components returning TemplateResult -->
      ${Card(html`
         <h1 class="text-2xl font-bold mb-4">Hello mini-lit!</h1>

         ${Button({
            children: html`
               ${icon(Send, "sm")}
               <span>Send Message</span>
            `,
         })}
      `)}
   </div>
`;

render(App(), document.body);
```

## Components

### Actions

- **Buttons** - All button variants and states
- **Copy Button** - Copy text to clipboard
- **Download Button** - Download files

### Layout

- **Cards** - Content containers with header, content, and footer sections
- **Separators** - Visual dividers
- **Split Panel** - Resizable layouts
- **Dialogs** - Modal dialogs

### Forms

- **Inputs** - Text, email, password inputs
- **Textareas** - Multi-line text input
- **Selects** - Dropdown selections
- **Checkboxes** - Boolean selections
- **Switches** - Toggle controls
- **Labels** - Form labels

### Feedback

- **Badges** - Status indicators
- **Alerts** - Important messages with variants
- **Progress** - Progress indicators

### Content

- **Code Block** - Syntax highlighted code with copy functionality
- **Markdown** - Rendered markdown with KaTeX math support
- **Diff Viewer** - Code difference viewer

### Utilities

- **Theme Toggle** - Dark/light mode switcher
- **Language Selector** - i18n language switcher
- **icon()** - Render Lucide icons with size variants
- **i18n()** - Internationalization support

## Component Types

### Functional Components

Stateless components that return `TemplateResult`:

```typescript
import { Button, Card, Badge } from "@mariozechner/mini-lit";

// Use directly in templates
${Button({ variant: "primary", children: "Click me" })}
${Badge({ children: "New" })}
```

### Custom Elements

Stateful components that extend `LitElement`:

```typescript
// Custom elements are automatically registered when using the main import
import "@mariozechner/mini-lit";

// Use as HTML tags
<theme-toggle></theme-toggle>
<code-block .code=${"console.log('Hello')"} language="javascript"></code-block>
```

## Tree-Shaking & Bundle Optimization

**IMPORTANT**: The root index (`@mariozechner/mini-lit`) now only exports core utilities (component system, i18n, and icons). Individual components are **not** exported from the root to encourage optimal tree-shaking.

### Recommended Import Strategy

```typescript
// ✅ Optimal - only includes what you use (~50-100KB)
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { Card } from "@mariozechner/mini-lit/dist/Card.js";
import { icon } from "@mariozechner/mini-lit/dist/icons.js";
import "@mariozechner/mini-lit/dist/ThemeToggle.js";

// ⚠️ Root index only exports core utilities (NOT components)
import { i18n, setTranslations, createComponent } from "@mariozechner/mini-lit";
```

**What's exported from the root index**:
- Component system: `ComponentLitBase`, `createComponent`, `defineComponent`, `styleComponent`, and related types
- i18n system: `i18n`, `setTranslations`, `setLanguage`, `getCurrentLanguage`, `defaultEnglish`, `defaultGerman`
- Icons: `icon` function and related utilities

**Available component paths**:
- Functional components: `/dist/Button.js`, `/dist/Card.js`, `/dist/Input.js`, `/dist/Select.js`, `/dist/Checkbox.js`, etc.
- Custom elements: `/dist/ThemeToggle.js`, `/dist/CodeBlock.js`, `/dist/MarkdownBlock.js`, `/dist/LanguageSelector.js`, etc.
- Core utilities: `/dist/mini.js` (fc, createState, refs)

**Bundle Size**:
- Direct imports: ~50-100KB (only what you use)
- Importing all components: ~400KB+ (if you manually import everything)

## Themes

mini-lit uses shadcn/ui compatible themes with CSS custom properties for colors, borders, and shadows.

### Built-in Themes

- `default` - Clean, modern theme
- `claude` - Claude-inspired theme

Switch themes by importing a different CSS file:

```css
@import "@mariozechner/mini-lit/styles/themes/claude.css";
```

### Dark Mode

Toggle dark mode via the `dark` class:

```javascript
document.documentElement.classList.toggle("dark");
```

Or use the built-in `<theme-toggle>` component.

### Custom Themes

For custom themes and theme generators:

- [shadcn/ui themes](https://ui.shadcn.com/themes)
- [Tweakcn theme generator](https://tweakcn.com/)

## Internationalization

### 1. Define TypeScript Interface (for autocomplete)

```typescript
declare module "@mariozechner/mini-lit" {
   interface i18nMessages extends MiniLitRequiredMessages {
      Welcome: string;
      Settings: string;
      cartItems: (count: number) => string;
      greeting: (name: string, time: string) => string;
   }
}
```

### 2. Set Translations

```typescript
import { setTranslations, defaultEnglish, defaultGerman } from "@mariozechner/mini-lit";

const translations = {
   en: {
      ...defaultEnglish, // Includes required messages like "Copy", "Copied!"
      Welcome: "Welcome",
      Settings: "Settings",
      cartItems: (count: number) =>
         count === 0 ? "Your cart is empty" : count === 1 ? "1 item in your cart" : `${count} items in your cart`,
      greeting: (name: string, time: string) => `Good ${time}, ${name}!`,
   },
   de: {
      ...defaultGerman, // Includes required messages like "Kopieren", "Kopiert!"
      Welcome: "Willkommen",
      Settings: "Einstellungen",
      cartItems: (count: number) =>
         count === 0
            ? "Ihr Warenkorb ist leer"
            : count === 1
              ? "1 Artikel im Warenkorb"
              : `${count} Artikel im Warenkorb`,
      greeting: (name: string, time: string) => `Guten ${time}, ${name}!`,
   },
};

setTranslations(translations);
```

### 3. Use in Your App

```typescript
import { i18n, getCurrentLanguage, setLanguage } from "@mariozechner/mini-lit";

// Simple strings
${i18n("Welcome")}
${i18n("Settings")}

// Functions with parameters
${i18n("cartItems")(3)}  // "3 items in your cart"
${i18n("greeting")("Alice", "morning")}  // "Good morning, Alice!"

// Language management
getCurrentLanguage()  // "en" or "de"
setLanguage("de")     // switches to German, reloads page

// Add language selector to UI
<language-selector></language-selector>
```

## Development

The mini-lit repository includes both the component library and a comprehensive example gallery showcasing all components.

### Setup

```bash
# Clone the repository
git clone https://github.com/badlogic/mini-lit.git
cd mini-lit

# Install dependencies
npm install
```

### Development Workflow

Run the development server with hot module replacement:

```bash
npm run dev
```

This command orchestrates:

1. **TypeScript compilation** of the mini-lit library (watching for changes in `/src`, outputting to `/dist`)
2. **Vite dev server** for the example gallery (in `/example`), automatically picking up the latest mini-lit builds

Open the URL displayed by Vite (typically http://localhost:5173) to view the example gallery. Any changes to either the mini-lit source code or the example application will trigger automatic rebuilds and browser updates through HMR.

### Project Structure

```
mini-lit/
├── src/              # mini-lit component library source
├── dist/             # Compiled library output
├── styles/           # Theme CSS files
├── example/          # Interactive component gallery
│   └── src/
│       └── pages/    # Individual component demos
└── package.json      # Library package configuration
```

### Code Quality

Run formatting and linting checks for both the library and example:

```bash
npm run check
```

This command:

- Formats all code with Prettier
- Lints with Biome for code quality and style consistency
- Type-checks both the library and example with TypeScript
- Automatically runs on git commit via Husky pre-commit hooks

### Building for Production

```bash
# Build the library
npm run build

# Build the example gallery
cd example && npm run build
```

### Publishing & Deployment

#### Publishing to npm

```bash
# Build and publish the library to npm
npm run build
npm publish --access public
```

#### Deploying the Documentation Site

```bash
# Quick sync (when only source files changed)
./run.sh sync

# Full deploy (when Docker/infrastructure changed)
./run.sh deploy
```

The `sync` command builds and syncs files without restarting services, while `deploy` also restarts the Docker containers on the server.

## Examples

See the `/example` directory for a complete working example with all components, or visit the [live demo](https://minilit.mariozechner.at).

## Resources

- [npm Package](https://www.npmjs.com/package/@mariozechner/mini-lit)
- [GitHub Repository](https://github.com/badlogic/mini-lit)
- [Live Demo](https://minilit.mariozechner.at)
- [Lit Documentation](https://lit.dev)
- [Tailwind CSS v4](https://tailwindcss.com)

## License

MIT
