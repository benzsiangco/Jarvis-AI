import { spawn } from 'child_process';

export async function runTerminalCommand({ command, cwd, onData, timeoutMs = 30000 }) {
  return runSpawnCommand({ command, cwd, onData, timeoutMs });
}

function runSpawnCommand({ command, cwd, onData, timeoutMs }) {
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'powershell.exe' : '/bin/sh';
  const args = isWin ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-lc', command];

  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const proc = spawn(shell, args, {
      cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const timer = timeoutMs > 0 ? setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill();
      reject(new Error(`Command timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs) : null;

    const append = (data) => {
      const text = data.toString();
      output += text;
      onData?.(text);
    };

    proc.stdout.on('data', append);
    proc.stderr.on('data', append);
    proc.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ output: output.trim(), exitCode, command });
    });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}
