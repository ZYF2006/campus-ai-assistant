import type { ChatMessage } from "@campus-ai/shared-types";
import { HttpError } from "../lib/http-error.js";

/**
 * 上下文选择配置。
 * 本模块只负责：
 * 1. 读取并校验配置；
 * 2. 估算消息占用的 Token；
 * 3. 从历史中选出本次可以携带的完整问答。
 * 本模块不访问数据库、不调用模型，也不生成摘要。
 */
export interface ContextOptions {
  recentTurns: number; //多保留多少轮近期历史
  windowTokens: number; //用于控制上下文的总 Token 预算
  outputTokens: number; //本次模型回答预留的最大 Token 数
  useSummary: boolean; //是否启用摘要策略
}
//摘要正文允许的最大字符数，供其他模块检查摘要长度
export const SUMMARY_MAX_CHARS = 1200;

/**
 * 从环境变量读取一个整数，并检查取值范围。
 *
 * @param name 环境变量名称，例如 CONTEXT_RECENT_TURNS
 * @param fallback 未设置该环境变量时使用的默认值
 * @param min 允许的最小值，包含边界
 * @param max 允许的最大值，包含边界
 *
 * 环境变量通常是字符串，例如 "4"，需要通过 Number 转换为数字。
 * 非数字、小数或超出范围的值都会被拒绝。
 */
function readInteger(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  // ?? 只在值为 null 或 undefined 时使用默认值。
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(500, `后端 ${name} 配置不正确`);
  }
  return value;
}

/**
 * 读取并校验上下文配置。
 * 放在函数内部读取环境变量，可以避免在模块首次导入时，
 * dotenv 尚未加载 .env，就提前固定了配置值。
 */
export function getContextOptions(): ContextOptions {
  // 参数依次为：变量名、默认值、最小值、最大值。
  const windowTokens = readInteger("CONTEXT_WINDOW_TOKENS", 32768, 1024, 131072);
  const outputTokens = readInteger("MODEL_MAX_OUTPUT_TOKENS", 2048, 64, 8192);
  // 总窗口还需要容纳输入，不能全部用于回答。
  if (outputTokens >= windowTokens) throw new HttpError(500, "上下文窗口必须大于回复预留量");
  // 未配置策略时，默认只保留近期原文。
  const strategy = process.env.CONTEXT_STRATEGY ?? "window";
  //只接受已经实现的两种策略，防止拼写错误后采用错误行为。
  if (strategy !== "window" && strategy !== "summary") {
    throw new HttpError(500, "CONTEXT_STRATEGY 只能是 window 或 summary");
  }
  return {
    recentTurns: readInteger("CONTEXT_RECENT_TURNS", 4, 1, 20),
    windowTokens,
    outputTokens,
    useSummary: strategy === "summary", //将字符串策略转换成布尔值，方便后续代码判断。
  };
}

/**
 * 估算一组消息占用的 Token 总数。
 * 教学估算规则：
 * 每条消息的估算量 = 向上取整（正文的UTF-8 字节数 ÷ 2）+ 8
 * - Buffer.byteLength：统计文本编码为 UTF-8 后占多少字节。
 * - Math.ceil：向上取整，避免出现小数预算。
 * - +8：粗略预留角色、消息边界等协议开销。
 * 这只是便于理解预算的启发式估算：
 * 不能用于精确计费，也不能保证绝对不超过真实模型窗口。
 */
export function estimateTokens(messages: ChatMessage[]): number {
  //reduce从初始值0开始，逐条累加消息的估算开销。
  return messages.reduce(
    (total, message) => total + Math.ceil(Buffer.byteLength(message.content, "utf8") / 2) + 8,
    0,
  );
}

/**
 * 根据“近期轮数上限”和“剩余 Token 预算”选择历史。
 *
 * 输入约定：
 * history 按时间从早到晚排列，只包含已完成的问答：
 * [user1, assistant1, user2, assistant2, ...]
 *
 * @param history 数据库读取出的已完成历史，不包含当前问题
 * @param current 本次用户提出、尚未回答的问题
 * @param systemMessages 本次固定携带的系统消息，可包含角色规则与知识资料
 * @param options 已校验的上下文配置
 *
 * 返回：
 * recent：保留为原文、准备发送给模型的近期历史；
 * older：没有进入近期窗口的较早历史。
 *
 * older 的后续用途由调用方决定：
 * - window模式：本次不发送这些旧历史；
 * - summary模式：由其他模块判断哪些旧历史需要生成或更新摘要。
 *
 * 这里只划分数组，不生成摘要，也不删除数据库中的记录。
 */
export function selectHistory(
  history: ChatMessage[],
  current: ChatMessage,
  systemMessages: ChatMessage[],
  options: ContextOptions,
): { recent: ChatMessage[]; older: ChatMessage[] } {
  if (history.length % 2 !== 0) throw new Error("数据库中的对话轮次不完整");

  //摘要模式且存在历史时，先为摘要及其包装文字预留预算。
  // 最多1200个Unicode字符的摘要预留2500个估算Token，包含包装提示。
  const summaryReserve = options.useSummary && history.length > 0 ? 2500 : 0;

  /**
   * 可用于历史原文的预算：
   *
   * 总窗口
   * - 回答预留
   * - 摘要预留
   * - 系统规则、知识资料与当前问题的估算开销
   *
   * 必须先扣除这些固定占用，不能只按历史消息条数裁剪。
   */
  let remaining =
    options.windowTokens -
    options.outputTokens -
    summaryReserve -
    estimateTokens([...systemMessages, current]);
  if (remaining < 0) {
    throw new HttpError(400, "系统资料与当前问题超过上下文预算，请缩短问题或调整后端窗口配置");
  }

  /**
   * start 表示“保留历史”的起始下标。
   *
   * 初始值为history.length，表示暂时没有选中任何历史。
   * 每成功选中一轮，就向前移动两个位置。
   */
  let start = history.length;

  //同时满足两个条件才继续：
  // 1. 前面至少还有两条消息；
  // 2. 已保留的轮数尚未达到recentTurns。
  for (let turns = 0; start >= 2 && turns < options.recentTurns; turns++) {
    // 从后往前取一轮。
    // slice包含起点、不包含终点，因此这里恰好取出两条消息。
    const pair = history.slice(start - 2, start);

    // 检查本次考察的一轮是否为“用户提问→助手回答”。
    // ?. 是可选链：对应元素不存在时返回undefined，避免直接访问时报错。
    if (pair[0]?.role !== "user" || pair[1]?.role !== "assistant") {
      throw new Error("数据库中的对话轮次不完整");
    }

    // 以完整一轮为单位计算开销，避免只保留问题或只保留回答。
    const cost = estimateTokens(pair);

    // 下一轮放不下就停止，不跳过去挑更早、更短的消息。
    // 这样保留下来的历史始终是时间上连续的近期问答。
    // cost恰好等于remaining时仍然可以保留。
    if (cost > remaining) break;

    // 确认可保留这一轮后，再扣减预算并向前移动。
    remaining -= cost;
    start -= 2;
  }

  /**
   * 示例：已有6轮历史，共12条消息；最多保留4轮且预算充足。
   *
   * start依次变化：12 → 10 → 8 → 6 → 4
   *
   * recent = history.slice(4)    → 第3～6轮
   * older  = history.slice(0, 4) → 第1～2轮
   *
   * 当前第7轮问题由调用方单独加入，不包含在recent中。
   *
   * slice创建新数组，因此这里不会修改history原数组。
   * 但数组中的消息对象仍是原对象引用，不是深拷贝。
   */
  return { recent: history.slice(start), older: history.slice(0, start) };
}
