/**
 * 保存当前被占用的会话编号。
 *
 * Set是一种集合：
 * - 同一个值不会重复保存；
 * - has(value)：判断是否存在；
 * - add(value)：加入集合；
 * - delete(value)：从集合中删除。
 *
 * <string>表示集合中的元素必须是字符串。
 *
 * 放在函数外，使调用本模块的代码共享同一份集合。
 */
const busySessions = new Set<string>();

/**
 * 尝试占用一个会话。
 *
 * @param id 会话编号，调用方应先统一其格式和大小写
 *
 * 返回值：
 * - 已被占用：返回null，调用方应拒绝或稍后重试；
 * - 占用成功：返回一个函数，调用它即可释放占用。
 */
export function acquireSession(id: string): (() => void) | null {
  if (busySessions.has(id)) return null;
  busySessions.add(id);
  return () => busySessions.delete(id);
}
