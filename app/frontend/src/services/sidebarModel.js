/**
 * @typedef {Object} WorkspaceGroup
 * @property {string} id
 * @property {string} name
 * @property {string} path
 * @property {ChatSession[]} sessions
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} id
 * @property {string} title
 * @property {number} timestamp
 * @property {'approval'|'running'|'complete'|'failed'} status
 * @property {boolean} unread
 * @property {boolean} active
 * @property {string} meta
 * @property {string[]} fileRefs
 * @property {number} messageCount
 */

export function buildWorkspaceGroups({
  workspacePath,
  messages,
  isStreaming,
  pendingApproval,
  isTerminalRunning,
  currentCommand,
  serverStatus,
  tree,
}) {
  const workspaceName = getProjectName(workspacePath) || 'Local workspace';
  const workspaceId = workspacePath || 'local-workspace';
  const fileRefs = collectFileRefs(messages, tree);
  const sessions = [
    {
      id: `session-${workspaceId}`,
      title: getSessionTitle(messages, workspacePath),
      timestamp: getLastMessageTime(messages),
      status: getSessionStatus({ isStreaming, pendingApproval, isTerminalRunning, serverStatus }),
      unread: Boolean(pendingApproval),
      active: true,
      meta: formatSessionMeta(messages),
      fileRefs,
      messageCount: messages.length,
    },
  ];

  if (isTerminalRunning) {
    sessions.push({
      id: `task-${workspaceId}`,
      title: currentCommand || 'Terminal task',
      timestamp: Date.now(),
      status: 'running',
      unread: false,
      active: false,
      meta: 'Active tool',
      fileRefs: [],
      messageCount: 0,
    });
  }

  return [{
    id: workspaceId,
    name: workspaceName,
    path: workspacePath,
    sessions,
  }];
}

export function filterWorkspaceGroups(groups, query) {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  return groups
    .map((group) => {
      const groupMatch = includes(group.name, q) || includes(group.path, q);
      const sessions = group.sessions.filter((session) => (
        groupMatch ||
        includes(session.title, q) ||
        includes(session.meta, q) ||
        session.fileRefs.some((ref) => includes(ref, q))
      ));
      return groupMatch && sessions.length === 0 ? { ...group, sessions: group.sessions } : { ...group, sessions };
    })
    .filter((group) => group.sessions.length > 0);
}

export function flattenFileResults(tree, query, limit = 10) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return flattenFiles(tree)
    .filter((file) => includes(file.name, q) || includes(file.path, q))
    .slice(0, limit);
}

export function getProjectName(workspacePath) {
  if (!workspacePath) return '';
  return workspacePath.split(/[\\/]/).filter(Boolean).pop();
}

export function trimRoot(filePath, rootPath) {
  if (!rootPath || !filePath?.startsWith(rootPath)) return filePath;
  return filePath.slice(rootPath.length).replace(/^[\\/]/, '');
}

function getSessionTitle(messages, workspacePath) {
  const firstUser = messages.find((message) => message.role === 'user')?.content?.trim();
  if (firstUser) return firstUser.split(/\s+/).slice(0, 8).join(' ');
  return workspacePath ? 'Current session' : 'Local session';
}

function getLastMessageTime(messages) {
  const last = [...messages].reverse().find((message) => message.timestamp);
  return last?.timestamp || Date.now();
}

function getSessionStatus({ isStreaming, pendingApproval, isTerminalRunning, serverStatus }) {
  if (pendingApproval) return 'approval';
  if (isStreaming || isTerminalRunning || serverStatus === 'starting' || serverStatus === 'loading') return 'running';
  if (serverStatus === 'error') return 'failed';
  return 'complete';
}

function formatSessionMeta(messages) {
  if (!messages.length) return 'No messages';
  return `${messages.length} message${messages.length === 1 ? '' : 's'}`;
}

function collectFileRefs(messages, tree) {
  const fromMessages = messages
    .flatMap((message) => String(message.content || '').match(/[\w./\\-]+\.[a-z0-9]{1,8}/gi) || [])
    .slice(0, 12);
  const fromTree = flattenFiles(tree).slice(0, 8).map((file) => file.path);
  return [...new Set([...fromMessages, ...fromTree])];
}

function flattenFiles(node) {
  if (!node?.children) return [];
  return node.children.flatMap((child) => (
    child.type === 'directory' ? flattenFiles(child) : [child]
  ));
}

function includes(value, query) {
  return String(value || '').toLowerCase().includes(query);
}
