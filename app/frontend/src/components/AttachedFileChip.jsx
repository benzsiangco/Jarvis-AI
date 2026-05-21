/**
 * AttachedFileChip — shows a single dropped file as a preview chip.
 * Images → thumbnail. Text/code → colored icon + filename.
 */
import { X, FileText, FileCode, FileJson, EyeOff } from 'lucide-react';

/* Map file extensions → icon color */
const EXT_COLOR = {
  js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#61dafb',
  py: '#3572a5', json: '#8bc34a', jsonc: '#8bc34a',
  css: '#563d7c', html: '#e34c26', htm: '#e34c26',
  md: '#a0aec0', mdx: '#a0aec0', txt: '#a0aec0',
  sh: '#89e051', bash: '#89e051',
  yaml: '#cb171e', yml: '#cb171e',
  sql: '#336791', go: '#00add8', rs: '#dea584',
  java: '#b07219', rb: '#701516', php: '#4F5D95',
  c: '#555555', cpp: '#f34b7d', h: '#555555', cs: '#178600',
  vue: '#41b883', svelte: '#ff3e00',
};

function getIconColor(ext) {
  return EXT_COLOR[ext] ?? '#718096';
}

/* Pick the most semantic icon for a given extension */
function FileIcon({ ext, size = 14 }) {
  if (['json', 'jsonc'].includes(ext)) return <FileJson size={size} />;
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'rb', 'php', 'c', 'cpp', 'h', 'cs', 'vue', 'svelte'].includes(ext))
    return <FileCode size={size} />;
  return <FileText size={size} />;
}

export default function AttachedFileChip({ attachment, onRemove, imageBlocked }) {
  const { id, name, ext, isImage, preview, size } = attachment;

  const sizeLabel = size < 1024
    ? `${size}B`
    : size < 1_048_576
      ? `${(size / 1024).toFixed(1)}KB`
      : `${(size / 1_048_576).toFixed(1)}MB`;

  return (
    <div className={`attach-chip ${isImage ? 'attach-chip-image-card' : ''} ${imageBlocked ? 'attach-chip-blocked' : ''}`}>
      {imageBlocked ? (
        <div className="attach-chip-thumb attach-chip-blocked-overlay">
          <div className="attach-chip-blocked-icon"><EyeOff size={14} /></div>
          <img src={preview} alt={name} className="attach-chip-img opacity-30" draggable={false} />
        </div>
      ) : isImage && preview ? (
        <div className="attach-chip-thumb">
          <img src={preview} alt={name} className="attach-chip-img" draggable={false} />
        </div>
      ) : (
        <div className="attach-chip-icon" style={{ color: getIconColor(ext) }}>
          <FileIcon ext={ext} size={13} />
        </div>
      )}

      <div className="attach-chip-meta">
        <span className="attach-chip-name" title={name}>{name}</span>
        <span className="attach-chip-size">{imageBlocked ? 'not supported' : sizeLabel}</span>
      </div>

      <button
        className="attach-chip-remove"
        onClick={() => onRemove(id)}
        title={`Remove ${name}`}
        aria-label={`Remove ${name}`}
        type="button"
      >
        <X size={10} />
      </button>
    </div>
  );
}
