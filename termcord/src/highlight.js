// A small, language-agnostic syntax highlighter for code blocks.
const KEYWORDS = new Set(`
  const let var function return if else for while do break continue switch case default class extends new delete
  typeof instanceof in of import from export async await try catch finally throw yield static public private
  protected void int float double char long short unsigned signed bool boolean string struct enum union typedef
  namespace using template virtual override final interface implements package def lambda pass raise except with
  as assert global nonlocal elif not and or is fn pub impl trait mod use crate self Self mut ref match where loop
  move dyn unsafe type func go defer chan map range select then fi done esac local end begin unless module
  require include val when object super this
`.trim().split(/\s+/));
const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'None', 'True', 'False', 'nil', 'NaN']);

const HASH = new Set(['py', 'python', 'sh', 'bash', 'zsh', 'shell', 'console', 'rb', 'ruby', 'yaml', 'yml', 'toml', 'perl',
  'pl', 'r', 'makefile', 'make', 'dockerfile', 'docker', 'ini', 'conf', 'nix', 'ps1', 'powershell', 'elixir', 'ex', 'jl',
  'julia', 'nim', 'tcl', 'awk']);
const DASH = new Set(['sql', 'lua', 'haskell', 'hs', 'elm', 'ada']);
const NO_SLASH = new Set(['html', 'xml', 'svg', 'css', 'json', 'md', 'markdown']);
const PLAIN = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'ansi', 'log', 'output']);
const QUOTE_IS_LIFETIME = new Set(['rust', 'rs']);

const TOKEN = /"(?:\\.|[^"\\])*"?|`(?:\\.|[^`\\])*`?|'(?:\\.|[^'\\])*'|\b0[xX][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\w*|[A-Za-z_$][\w$]*|\/\/|\/\*|#|--/g;

// Returns a function that turns one source line into [{ text, kind }] spans.
// kind is key, str, num, com, fn, add, del or undefined; block comments carry over between lines.
export function highlighter(lang = '') {
  lang = lang.toLowerCase();
  if (PLAIN.has(lang)) return (line) => (line ? [{ text: line }] : []);
  if (lang === 'diff' || lang === 'patch') {
    return (line) => (line ? [{ text: line, kind: line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : line.startsWith('@@') ? 'key' : undefined }] : []);
  }
  const hash = HASH.has(lang), dash = DASH.has(lang);
  const slash = !hash && !dash && !NO_SLASH.has(lang);
  const block = slash || lang === 'css' || lang === 'sql';
  let inBlock = false;

  return (line) => {
    const out = [];
    const push = (text, kind) => {
      if (!text) return;
      const last = out.at(-1);
      if (last && last.kind === kind) last.text += text;
      else out.push({ text, kind });
    };
    let pos = 0;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) {
        push(line, 'com');
        return out;
      }
      push(line.slice(0, end + 2), 'com');
      pos = end + 2;
      inBlock = false;
    }
    TOKEN.lastIndex = pos;
    for (let m; (m = TOKEN.exec(line));) {
      const tok = m[0];
      push(line.slice(pos, m.index));
      pos = m.index + tok.length;
      const rest = () => {
        push(line.slice(m.index), 'com');
        pos = line.length;
        TOKEN.lastIndex = pos;
      };
      if (tok === '//') {
        if (slash) rest();
        else push(tok);
      } else if (tok === '#') {
        if (hash && (m.index === 0 || /\s/.test(line[m.index - 1]))) rest();
        else push(tok);
      } else if (tok === '--') {
        if (dash) rest();
        else push(tok);
      } else if (tok === '/*') {
        if (!block) {
          push(tok);
          continue;
        }
        const end = line.indexOf('*/', pos);
        if (end < 0) {
          inBlock = true;
          rest();
        } else {
          push(line.slice(m.index, end + 2), 'com');
          pos = end + 2;
          TOKEN.lastIndex = pos;
        }
      } else if (tok[0] === "'" && QUOTE_IS_LIFETIME.has(lang) && tok.length > 4) {
        // 'a, 'b are lifetimes, not one long string
        push("'");
        pos = m.index + 1;
        TOKEN.lastIndex = pos;
      } else if (tok[0] === '"' || tok[0] === "'" || tok[0] === '`') push(tok, 'str');
      else if (/\d/.test(tok[0])) push(tok, 'num');
      else if (KEYWORDS.has(tok)) push(tok, 'key');
      else if (LITERALS.has(tok)) push(tok, 'num');
      else if (/^\s*\(/.test(line.slice(pos))) push(tok, 'fn');
      else push(tok);
    }
    push(line.slice(pos));
    return out;
  };
}
