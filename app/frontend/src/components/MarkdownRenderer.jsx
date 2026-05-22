/**
 * MarkdownRenderer — production-grade markdown rendering.
 * Tables, code blocks, lists, headings all render with ChatGPT/Cursor quality.
 */
import { useState, useRef } from 'react';
import { Copy, Check, WrapText, ChevronDown, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ImageCarousel from './ImageCarousel';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('rs', rust);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);

/** Strip raw tool-call markers so they don't render as text */
export function sanitizeToolCalls(text) {
  if (!text) return '';
  return text
    .replace(/<tool_call>call:(\w+)\s*(\{[\s\S]*?\})/gm, '')
    .replace(/<\|tool_call\|>call:(\w+)\s*(\{[\s\S]*?\})/gm, '')
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\{"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[\s\S]*?\}\s*\}/gm, '')
    .replace(/^I will [^\n]+\bsir\b[^\n]*\n?/i, '')
    .trim();
}

/** Extract plain text from markdown for clipboard */
function toPlainText(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/, '').replace(/```$/, '').trim())
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s*[|].*[|]\s*$/gm, (row) =>
      row.split('|').map((c) => c.trim()).filter(Boolean).join('  ')
    )
    .replace(/^\s*[-|: ]+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function MarkdownRenderer({ content, compact = false }) {
  if (!content) return null;
  const text = sanitizeToolCalls(content);

  // Split on special markers: [VIDEO:id], [BOX:content], [IMAGES:base64]
  const parts = text.split(/(\[VIDEO:[A-Za-z0-9_-]{11}\]|\[BOX:[^\]]{1,500}\]|\[IMAGES:[A-Za-z0-9+/=]{1,8000}\])/g);

  if (parts.length > 1) {
    return (
      <div className={`markdown-body ${compact ? 'markdown-compact' : ''}`}>
        {parts.map((part, i) => {
          const videoMatch = part.match(/^\[VIDEO:([A-Za-z0-9_-]{11})\]$/);
          if (videoMatch) return <YouTubeEmbed key={i} videoId={videoMatch[1]} />;

          const boxMatch = part.match(/^\[BOX:([^\]]{1,500})\]$/);
          if (boxMatch) return <CopyBox key={i} value={boxMatch[1]} />;

          const imagesMatch = part.match(/^\[IMAGES:([A-Za-z0-9+/=]{1,8000})\]$/);
          if (imagesMatch) {
            try {
              const decoded = JSON.parse(decodeURIComponent(escape(atob(imagesMatch[1]))));
              return <ImageCarousel key={i} images={decoded.images || []} query={decoded.query || ''} />;
            } catch { return null; }
          }

          if (!part.trim()) return null;
          return (
            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={buildComponents(compact)}>
              {part}
            </ReactMarkdown>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`markdown-body ${compact ? 'markdown-compact' : ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(compact)}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function buildComponents(compact) {
  return {
    code({ node, className, children }) {
      const lang = (className || '').replace('language-', '') || 'text';
      const raw = String(children).replace(/\n$/, '');
      const isBlock = raw.includes('\n') || (className && className.startsWith('language-'));
      if (!isBlock) return <code className="md-inline-code">{raw}</code>;
      return <CodeBlock lang={lang} content={raw} compact={compact} />;
    },
    a({ href, children }) {
      const isExternal = href && (href.startsWith('http') || href.startsWith('//'));
      const handleClick = (e) => {
        if (!isExternal) return;
        e.preventDefault();
        // In Tauri, use the electronAPI shim which calls shell_open_path
        // This routes through the OS default browser
        if (window.electronAPI?.openPath) {
          window.electronAPI.openPath(href).catch(() => {});
        } else {
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      };
      return (
        <a
          href={href}
          onClick={handleClick}
          className="md-link"
          style={{ cursor: 'pointer' }}
        >
          {children}
          {isExternal && <span className="md-link-icon">↗</span>}
        </a>
      );
    },
    img({ src, alt }) {
      return <img src={src} alt={alt || ''} loading="lazy" />;
    },
    table({ children }) {
      return (
        <div className="md-table-wrap">
          <table className="md-table">{children}</table>
        </div>
      );
    },
    thead({ children }) { return <thead>{children}</thead>; },
    tbody({ children }) { return <tbody>{children}</tbody>; },
    tr({ children }) { return <tr>{children}</tr>; },
    th({ children, style }) {
      return <th style={style}>{children}</th>;
    },
    td({ children, style }) {
      return <td style={style}>{children}</td>;
    },
  };
}

// ── Copy Box ──────────────────────────────────────────────────────────────────
// Renders a styled single-value box with a copy button.
// Used for commands, paths, keys, IDs, URLs, etc.

function CopyBox({ value, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="md-copy-box">
      {label && <span className="md-copy-box-label">{label}</span>}
      <div className="md-copy-box-inner">
        <code className="md-copy-box-value">{value}</code>
        <button
          className="md-copy-box-btn"
          onClick={handleCopy}
          title="Copy"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}

// Export so backend synthesizeDirectResponse can use the marker format
export { CopyBox };

// ── Code Block ────────────────────────────────────────────────────────────────

const COLLAPSE_THRESHOLD = 40; // lines

function CodeBlock({ lang, content, compact }) {
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lines = content.split('\n');
  const isLong = lines.length > COLLAPSE_THRESHOLD;
  // Plain text / tree blocks — no syntax highlighting, just monospace card
  const isPlain = !lang || lang === 'text' || lang === 'plaintext';

  const fontSize = compact ? '11.5px' : '12.5px';
  const hlStyle = {
    ...oneDark,
    'pre[class*="language-"]': {
      ...oneDark['pre[class*="language-"]'],
      background: 'transparent',
      margin: 0,
      borderRadius: 0,
      padding: compact ? '12px 14px' : '14px 16px',
      fontSize,
      lineHeight: '1.7',
      whiteSpace: wrap ? 'pre-wrap' : 'pre',
      wordBreak: wrap ? 'break-all' : 'normal',
    },
    'code[class*="language-"]': {
      ...oneDark['code[class*="language-"]'],
      background: 'transparent',
      fontSize,
    },
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const displayContent = collapsed ? lines.slice(0, 8).join('\n') + '\n...' : content;

  return (
    <div className="md-code-block">
      {/* Floating copy button — top right, always visible on hover */}
      <button className="md-code-float-copy" onClick={handleCopy} title="Copy">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>

      {/* Language badge + controls — only show for non-plain blocks */}
      {!isPlain && (
        <div className="md-code-header">
          <span className="md-code-lang">{lang}</span>
          {isLong && (
            <button className="md-code-action" onClick={() => setCollapsed((v) => !v)}>
              {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              <span>{collapsed ? `${lines.length} lines` : 'collapse'}</span>
            </button>
          )}
          <button
            className="md-code-action"
            onClick={() => setWrap((v) => !v)}
            style={{ color: wrap ? 'rgba(34,211,238,0.7)' : undefined }}
            title={wrap ? 'Disable wrap' : 'Wrap lines'}
          >
            <WrapText size={10} />
          </button>
        </div>
      )}

      <div className={`md-code-body${collapsed ? ' md-code-collapsed' : ''}`}>
        {isPlain ? (
          // Plain text — simple pre, no syntax highlighting
          <pre className="md-code-plain">{displayContent}</pre>
        ) : (
          <SyntaxHighlighter
            language={lang}
            style={hlStyle}
            wrapLongLines={wrap}
            PreTag="div"
            showLineNumbers={lines.length > 5}
            lineNumberStyle={{ color: 'rgba(255,255,255,0.12)', fontSize: '10px', minWidth: '2.5em', paddingRight: '12px', userSelect: 'none' }}
          >
            {displayContent}
          </SyntaxHighlighter>
        )}
      </div>

      {collapsed && (
        <button className="md-code-expand-btn" onClick={() => setCollapsed(false)}>
          Show all {lines.length} lines
        </button>
      )}
    </div>
  );
}

// ── YouTube Embed ─────────────────────────────────────────────────────────────

// Global autoplay preference — persisted to localStorage
function getAutoplay() {
  try { return localStorage.getItem('jarvis:ytAutoplay') !== 'false'; } catch { return true; }
}
function setAutoplay(val) {
  try { localStorage.setItem('jarvis:ytAutoplay', String(val)); } catch {}
}

function YouTubeEmbed({ videoId }) {
  const [dismissed, setDismissed] = useState(false);
  const [playing, setPlaying] = useState(() => getAutoplay()); // auto-start if autoplay on
  const [autoplay, setAutoplayState] = useState(getAutoplay);

  if (dismissed) return null;

  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=${playing && autoplay ? 1 : 0}&rel=0&modestbranding=1`;

  const handlePlay = () => setPlaying(true);

  const toggleAutoplay = (e) => {
    e.stopPropagation();
    const next = !autoplay;
    setAutoplayState(next);
    setAutoplay(next);
  };

  return (
    <div className="md-yt-card">
      {/* Player area */}
      <div className="md-yt-player">
        {playing ? (
          <iframe
            src={embedUrl}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="md-yt-iframe"
          />
        ) : (
          <div className="md-yt-thumb-wrap" onClick={handlePlay}>
            <img
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt="YouTube video"
              className="md-yt-thumb"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="md-yt-overlay">
              <div className="md-yt-play">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="md-yt-footer">
        <button
          className={`md-yt-autoplay-toggle ${autoplay ? 'md-yt-autoplay-on' : ''}`}
          onClick={toggleAutoplay}
          title={autoplay ? 'Autoplay ON — click to disable' : 'Autoplay OFF — click to enable'}
        >
          <span className="md-yt-autoplay-dot" />
          Autoplay {autoplay ? 'on' : 'off'}
        </button>

        <button
          className="md-yt-open-btn"
          onClick={() => window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank')}
          title="Open in browser"
        >
          ↗ Browser
        </button>

        <button
          className="md-yt-dismiss"
          onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          title="Dismiss"
        >✕</button>
      </div>
    </div>
  );
}
