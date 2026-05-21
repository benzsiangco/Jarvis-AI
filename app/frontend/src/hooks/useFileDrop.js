/**
 * useFileDrop — drag-and-drop + file picker for the chat composer.
 *
 * Returns:
 *   attachments  – array of { id, file, name, type, preview, content, isImage }
 *   isDragging   – true while files are being dragged over the drop zone
 *   dropRef      – ref to attach to the drop target element
 *   openPicker   – programmatically open the OS file picker
 *   removeFile   – remove one attachment by id
 *   clearAll     – remove all attachments
 *   fileInputRef – hidden <input type="file"> ref (attach to DOM)
 */

import { useState, useRef, useCallback } from 'react';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp']);
const TEXT_EXTS   = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'json', 'jsonc', 'yaml', 'yml',
  'md', 'mdx', 'txt', 'css', 'html', 'htm', 'xml', 'sh', 'bash',
  'toml', 'env', 'gitignore', 'sql', 'graphql', 'vue', 'svelte',
  'rs', 'go', 'java', 'rb', 'php', 'c', 'cpp', 'h', 'cs',
]);

const MAX_FILES    = 8;
const MAX_TEXT_BYTES = 200_000; // 200 KB max text read
const MAX_IMAGE_DIM = 1024;    // max pixels on longest side (prevents OOM crash in llama.cpp)
const IMAGE_QUALITY = 0.75;    // JPEG quality for resized images
let _id = 0;

function getExt(name) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function isTextFile(file) {
  if (file.type.startsWith('text/')) return true;
  return TEXT_EXTS.has(getExt(file.name));
}

async function readFile(file) {
  if (IMAGE_TYPES.has(file.type)) {
    const dataUrl = await fileToDataUrl(file);
    const resized = await resizeImage(dataUrl, MAX_IMAGE_DIM, IMAGE_QUALITY);
    return { isImage: true, preview: dataUrl, content: resized };
  }
  if (isTextFile(file) && file.size <= MAX_TEXT_BYTES) {
    const text = await file.text();
    return { isImage: false, preview: null, content: text };
  }
  // Binary / too large — just show metadata
  return { isImage: false, preview: null, content: null };
}

/** Resize image to max dimension while preserving aspect ratio, return base64 JPEG */
function resizeImage(dataUrl, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw <= maxDim && nh <= maxDim) {
        resolve(dataUrl);
        return;
      }
      let w, h;
      if (nw > nh) { w = maxDim; h = Math.round(nh * maxDim / nw); }
      else { h = maxDim; w = Math.round(nw * maxDim / nh); }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function useFileDrop() {
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging]   = useState(false);
  const dropRef     = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounter = useRef(0); // track nested drag-enter/leave correctly

  const addFiles = useCallback(async (fileList) => {
    const files = [...fileList].slice(0, MAX_FILES - attachments.length);
    if (!files.length) return;

    const results = await Promise.all(files.map(async (file) => {
      const { isImage, preview, content } = await readFile(file);
      return {
        id: `f${++_id}`,
        file,
        name: file.name,
        ext: getExt(file.name),
        size: file.size,
        type: file.type,
        isImage,
        preview,
        content,
      };
    }));

    setAttachments((prev) => [...prev, ...results].slice(0, MAX_FILES));
  }, [attachments.length]);

  const removeFile = useCallback((id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setAttachments([]);
  }, []);

  const openPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /* ── Drag handlers ───────────────────────────────────────── */
  const onDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault(); // required to allow drop
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const onFileInputChange = useCallback((e) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      e.target.value = ''; // reset so same file can be re-added
    }
  }, [addFiles]);

  return {
    attachments,
    isDragging,
    dropRef,
    fileInputRef,
    openPicker,
    removeFile,
    clearAll,
    addFiles,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
    onFileInputChange,
  };
}
