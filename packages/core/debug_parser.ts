import { HoloCompositionParser } from './src/parser/HoloCompositionParser.js';

const parser = new HoloCompositionParser();

const cases = [
  {
    name: 'test3 - no custom traits',
    code: `composition "HoloScriptLanding" {
      object "Page" @layout(type: "block") {
        object "Nav" @theme(className: "landing-nav", tag: "nav") {
          object "NavContainer" @theme(className: "nav-container") {
            object "LogoLink" @theme(className: "nav-logo", tag: "a") {
              object "LogoImg" @theme(className: "nav-logo-img", tag: "img")
            }
          }
        }
      }
    }`,
  },
  {
    name: 'test4 - with text',
    code: `composition "HoloScriptLanding" {
      object "Page" @layout(type: "block") {
        object "Nav" @theme(className: "landing-nav", tag: "nav") {
          object "NavContainer" @theme(className: "nav-container") {
            object "LogoText" @text(content: "HoloScript", element: "span")
          }
        }
      }
    }`,
  },
  {
    name: 'test5 - with link and image',
    code: `composition "HoloScriptLanding" {
      object "Page" @layout(type: "block") {
        object "LogoLink" @theme(className: "nav-logo", tag: "a") @link(href: "/") {
          object "LogoImg" @theme(className: "nav-logo-img", tag: "img") @image(src: "/logo.svg", alt: "HoloScript")
        }
      }
    }`,
  },
];

for (const tc of cases) {
  const res = parser.parse(tc.code);
  if (!res.success) {
    console.log(`❌ ${tc.name} FAILED:`);
    res.errors.forEach((e) => console.log(`  ${e.message}`));
  } else {
    console.log(`✅ ${tc.name} SUCCESS`);
  }
}
