/**
 * 校园 AI 问答助手 —— 前后端共享类型定义。
 *
 * 本文件是 Monorepo 中唯一的「类型事实来源」：
 * apps/web（Vue 前端）与 apps/server（Express 后端）都通过
 * `import type { ... } from "@campus-ai/shared-types"` 引用这里定义的类型，
 * 从而避免双方各自定义一份聊天数据结构而产生不一致。
 *
 * 注意：类型声明在编译为 JavaScript 之后会被完全擦除，不产生多余的运行时代码。
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
 * 4. 聊天请求与响应
 * ------------------------------------------------------------------ */

/**
 * 前端发送给后端的聊天请求。
 */
export interface ChatRequest {
  /** 前端发送给后端的聊天消息列表（含历史消息） */
  messages: ChatMessage[];
}

/**
 * 后端返回给前端的聊天响应。
 *
 * 使用类型别名复用泛型接口 ApiResponse<T>，其中 data 为一条 ChatMessage。
 */
export type ChatResponse = ApiResponse<ChatMessage>;

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
 * 8. 类型级自检（编译期断言，不产生运行时代码）
 * ------------------------------------------------------------------ */

/** 类型相等断言：只有当 A 与 B 完全相同时才推断为 true。 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** 编译期断言入口：若泛型参数不是 true，这里就会产生类型错误。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Assert 只在类型层面被使用
declare const assertType: <Assert extends true>() => void;

// ChatMessage 的 role 必须是 Role，不能退化成普通 string。
assertType<Equals<ChatMessage["role"], Role>>();
// ApiResponse<T> 的 data 字段类型必须由 T 决定。
assertType<Equals<ApiResponse<number>["data"], number>>();
// Omit 派生：NewChatMessage 恰好等于 role + content（没有 id）。
assertType<Equals<NewChatMessage, { role: Role; content: string }>>();
// Pick + Partial 派生：UpdateChatMessage 恰好等于可选的 content。
assertType<Equals<UpdateChatMessage, { content?: string }>>();
// 自定义工具类型 ElementOf<T> 的四种典型输入。
assertType<Equals<ElementOf<ChatMessage[]>, ChatMessage>>();
assertType<Equals<ElementOf<readonly string[]>, string>>();
assertType<Equals<ElementOf<[number, string]>, number | string>>();
assertType<Equals<ElementOf<string>, never>>();
// 判别联合：success 分支一定能取到 message。
assertType<Equals<Extract<ChatEvent, { status: "success" }>["message"], ChatMessage>>();

// 上面全是类型断言；这里只保留一个值引用，避免声明被判定为未使用。
void assertType;
