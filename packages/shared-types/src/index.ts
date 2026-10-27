/**
 * 校园 AI 问答助手 —— 前后端共享类型定义。
 *
 * 本文件是 Monorepo 中唯一的「类型事实来源」：
 * apps/web（Vue 前端）与 apps/server（Express 后端）都通过
 * `import type { ... } from "@campus-ai/shared-types"` 引用这里定义的类型，
 * 从而避免双方各自定义一份聊天数据结构而产生不一致。
 *
 * 文件末尾有一组「类型级自检」，它们在编译期检查上面的类型是否被写错，
 * 但不会在编译产物里留下任何可执行代码。
 */

/* ------------------------------------------------------------------ *
 * 1. 聊天角色
 * ------------------------------------------------------------------ */

/**
 * 聊天消息角色。
 *
 * system：系统指令或 AI 角色设定
 * user：用户发送的消息
 * assistant：大模型生成的回复
 *
 * 使用「字符串字面量联合类型」而不是 enum：
 * - 零运行时开销：编译后完全擦除，不会像 enum 那样生成反向映射对象；
 * - 提示更友好：悬停时直接显示 "system" | "user" | "assistant"；
 * - 与 verbatimModuleSyntax、const、declare 组合时行为稳定，不会出意外。
 */
export type Role = "system" | "user" | "assistant";

/* ------------------------------------------------------------------ *
 * 2. 聊天消息
 * ------------------------------------------------------------------ */

/**
 * 项目中统一使用的聊天消息结构。
 *
 * interface 是定义「对象长什么样」的契约（合同）：它规定对象必须有哪些属性、
 * 属性的类型是什么。以下三个字段都是必填字段。
 */
export interface ChatMessage {
  /** 消息唯一编号 */
  id: string;
  /** 消息角色，必须引用上面定义的 Role */
  role: Role;
  /** 消息正文 */
  content: string;
}

/* ------------------------------------------------------------------ *
 * 3. 统一响应结构（泛型）
 * ------------------------------------------------------------------ */

/**
 * 前后端统一的 JSON 响应结构。
 *
 * T 是类型的「占位符」（形参），定义时先占着坑，使用时才填入具体类型：
 * - ApiResponse<ChatMessage>   → data 是一条消息
 * - ApiResponse<ChatMessage[]> → data 是消息数组
 *
 * 因此不需要为「单条消息」与「消息数组」分别复制一套响应接口。
 */
export interface ApiResponse<T> {
  /** 业务状态码，0 表示成功 */
  code: number;
  /** 状态说明 */
  message: string;
  /** 接口返回的具体业务数据，其类型完全由 T 决定（不是 any） */
  data: T;
}

/* ------------------------------------------------------------------ *
 * 4. 会话历史与聊天请求（第 5 讲：多轮对话与上下文记忆）
 * ------------------------------------------------------------------ */

/**
 * 服务器保存的会话详情：完整问答历史 + 旧对话摘要。
 *
 * 页面用它显示完整历史；模型本次实际收到哪几条由后端窗口策略决定，
 * 两者可以不同，选择窗口不会删除数据库中的记录。
 */
export interface SessionDetail {
  id: string;
  messages: ChatMessage[];
  summary: string;
  /** 摘要覆盖的完整问答轮数。 */
  summaryThrough: number;
}

/**
 * 浏览器提交给流式聊天接口的请求。
 *
 * 第 5 讲只提交两个编号和当前问题：历史由服务器按 sessionId 读取，
 * requestId 用于识别「同一次提问」的重试，避免重复保存。
 */
export interface SessionChatRequest {
  sessionId: string;
  /** 同一次提问重试时不变，新问题才生成新编号。 */
  requestId: string;
  content: string;
}

/* ------------------------------------------------------------------ *
 * 5. 用工具类型派生消息类型
 * ------------------------------------------------------------------ */

/**
 * 创建新消息时，id 由程序生成，因此调用者不需要提供 id。
 *
 * 用 Omit 从 ChatMessage 中「删除」id，保留 role 与 content。
 */
export type NewChatMessage = Omit<ChatMessage, "id">;

/**
 * 修改消息时，目前只允许修改 content。
 *
 * 先用 Pick 只「选择」content 字段（因此不允许出现 role 等其他字段），
 * 再用 Partial 把 content 变为可选字段（可以不填写）。
 */
export type UpdateChatMessage = Partial<Pick<ChatMessage, "content">>;

/* ------------------------------------------------------------------ *
 * 6. 自定义工具类型（进阶：条件类型 + infer）
 * ------------------------------------------------------------------ */

/**
 * 取出数组（或元组）的元素类型；传入非数组类型时得到 never。
 *
 * 实现要点：条件类型中的 `infer U` 让 TypeScript 在匹配
 * `T extends readonly (infer U)[]` 的过程中「就地推断」出元素类型并绑定到 U。
 * 写成 readonly 数组是为了同时兼容可变数组与只读数组。
 *
 * @example
 * type A = ElementOf<ChatMessage[]>;     // ChatMessage
 * type B = ElementOf<readonly string[]>; // string
 * type C = ElementOf<[number, string]>;  // number | string
 * type D = ElementOf<string>;            // never
 */
export type ElementOf<T> = T extends readonly (infer U)[] ? U : never;

/* ------------------------------------------------------------------ *
 * 7. 类型守卫与判别联合（运行时收窄）
 * ------------------------------------------------------------------ */

/**
 * 判断任意运行时值是否为合法的 Role。
 *
 * 类型谓词 `value is Role` 让调用方在 if 分支内把 unknown 收窄成 Role。
 * 这是「TypeScript 类型检查不能代替运行时数据校验」的落地方式：
 * 外部传入的数据一律先当作 unknown，校验通过后才作为共享类型使用。
 */
export function isRole(value: unknown): value is Role {
  return value === "system" || value === "user" || value === "assistant";
}

/**
 * 判断任意运行时值是否为合法的 ChatMessage。
 */
export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    isRole(candidate.role) &&
    typeof candidate.content === "string"
  );
}

/**
 * 聊天接口可能产生的事件类型。
 *
 * 这里演示「判别联合」（discriminated union）：每个成员都带有一个
 * status 字面量字段作为「判别式」，配合 switch 可以让 TypeScript
 * 精确收窄到某一分支，并检查该分支的字段是否齐全。
 */
export type ChatEvent =
  | { status: "pending" }
  | { status: "success"; message: ChatMessage }
  | { status: "failure"; reason: string; retryable: boolean };

/**
 * 把 ChatEvent 转换成为界面上可直接显示的一行文案。
 *
 * switch 中的穷尽性检查（never 兜底）保证：
 * 以后给 ChatEvent 增加新成员时，这里会立刻编译报错，不会漏处理。
 */
export function describeChatEvent(event: ChatEvent): string {
  switch (event.status) {
    case "pending":
      return "正在思考…";
    case "success":
      return `已收到回复：${event.message.content}`;
    case "failure":
      return event.retryable ? `发送失败：${event.reason}（可重试）` : `发送失败：${event.reason}`;
    default: {
      // 穷尽性检查：走到这里说明 ChatEvent 出现了尚未处理的新成员。
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 8. 流式响应事件（SSE）
 * ------------------------------------------------------------------ */

/**
 * 模型服务产生的事件。
 *
 * 与上面的 ChatEvent（前端界面状态）不同，这是「模型 → 后端」这一段的事件：
 * - delta：新增的一段文字；
 * - done：生成结束，携带模型的结束原因。
 *
 * 注意：一次收到的一段文字，不一定恰好对应一个 Token。
 */
export type ModelStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; finishReason: string };

/**
 * 后端通过 SSE 逐段推送给前端的事件。
 *
 * 除模型事件外，还可能发送错误信息（例如模型服务异常、超时）：
 * - delta：模型逐段生成的增量文本；
 * - done：生成完成，携带模型的结束原因；
 * - error：生成过程中出错。
 * 每个事件都会被 JSON.stringify 后放进 SSE 的 data 字段。
 */
export type ChatStreamEvent = ModelStreamEvent | { type: "error"; message: string };

/* ------------------------------------------------------------------ *
 * 9. 类型级自检（编译期断言，完全不产生运行时代码）
 * ------------------------------------------------------------------ */

/** 类型相等断言：只有当 A 与 B 完全相同时才推断为 true。 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * 编译期断言入口。
 *
 * 这里刻意把它声明为「类型」而不是「值」：R extends true 是类型参数约束，
 * 因此 `Assert<Equals<...>>` 只会在编译期被检查，编译成 JavaScript 后
 * 整段代码会被彻底擦除，不会产生任何可执行语句。
 *
 * 反例：如果写成 `declare const assertType: <A extends true>() => void`
 * 再调用 `assertType<...>()`，tsc 会保留那次调用，产物里就会出现 `assertType()`
 * —— 这个常量从未被定义，任何模块只要 import 本包就会在运行时直接抛错。
 */
type Assert<R extends true> = R;

/** 逐项断言：每一项都必须是 true，否则这里会立刻编译报错。 */
type TypeAssertions = [
  // ChatMessage 的 role 必须是 Role，不能退化成普通 string。
  Assert<Equals<ChatMessage["role"], Role>>,
  // ApiResponse<T> 的 data 字段类型必须由 T 决定。
  Assert<Equals<ApiResponse<number>["data"], number>>,
  // Omit 派生：NewChatMessage 恰好等于 role + content（没有 id）。
  Assert<Equals<NewChatMessage, { role: Role; content: string }>>,
  // Pick + Partial 派生：UpdateChatMessage 恰好等于可选的 content。
  Assert<Equals<UpdateChatMessage, { content?: string }>>,
  // 自定义工具类型 ElementOf<T> 的四种典型输入。
  Assert<Equals<ElementOf<ChatMessage[]>, ChatMessage>>,
  Assert<Equals<ElementOf<readonly string[]>, string>>,
  Assert<Equals<ElementOf<[number, string]>, number | string>>,
  Assert<Equals<ElementOf<string>, never>>,
  // 判别联合：success 分支一定能取到 message。
  Assert<Equals<Extract<ChatEvent, { status: "success" }>["message"], ChatMessage>>,
  // 流式事件：delta 分支一定能取到增量文本。
  Assert<Equals<Extract<ChatStreamEvent, { type: "delta" }>["text"], string>>,
  // 流式事件：done 分支一定能取到模型的结束原因。
  Assert<Equals<Extract<ChatStreamEvent, { type: "done" }>["finishReason"], string>>,
];

/** 消费上面的断言结果：只有 TypeAssertions 全部为 true 时这一行才成立。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 仅用于编译期自检
type AllTypeAssertionsPass = Assert<TypeAssertions extends [true, ...true[]] ? true : false>;
