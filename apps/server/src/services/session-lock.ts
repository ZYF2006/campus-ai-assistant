const busySessions = new Set<string>();

/**
 * 单进程教学版：同一会话的生成与清空互斥；不同会话仍可并行。
 * 多实例部署时需改用数据库锁或分布式锁。
 */
export function acquireSession(id: string): (() => void) | null {
  if (busySessions.has(id)) return null;
  busySessions.add(id);
  return () => busySessions.delete(id);
}
