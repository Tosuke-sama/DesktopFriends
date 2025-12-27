import { invoke } from "@tauri-apps/api/tauri";

/**
 * 前端调试日志工具
 * 将日志输出到后端终端，方便开发时查看
 */

type LogLevel = "debug" | "info" | "warn" | "error";

async function sendLog(level: LogLevel, message: string, data?: any) {
  // 总是发送日志到后端（后端会处理输出）

  try {
    await invoke("debug_log", {
      level,
      message,
      data: data !== undefined ? data : null,
    });
  } catch (e) {
    // 如果后端调用失败，降级到 console
    console.error("[Debug] Failed to send log to backend:", e);
  }
}

/**
 * 为什么叫做 Joker？
 * 因为这个可以帮助我们找出代码中的 🤡
 * （其实纯粹是因为突发恶疾想叫这个名字 😊
 */
const JokerConsole = {
  /** 这个预期是安全的日志，在生产环境中不会生效（在打包构建的时候理应被干掉） */
  "🤡": (...args: any[]) => {
    console.log(...args);
    const message = args
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");
    sendLog("debug", "[🤡] " + message);
  },

  /**
   * 信息级别日志
   */
  info: (message: string, data?: any) => {
    console.info(message, data);
    sendLog("info", message, data);
  },

  /**
   * 警告级别日志
   */
  warn: (message: string, data?: any) => {
    console.warn(message, data);
    sendLog("warn", message, data);
  },

  /**
   * 错误级别日志
   */
  "❌": (message: string, data?: any) => {
    console.error(message, data);
    sendLog("error", message, data);
  },

  /**
   * 分组日志开始
   */
  group: (label: string) => {
    console.group(label);
    sendLog("info", `──── ${label} ────`);
  },

  /**
   * 分组日志结束
   */
  groupEnd: () => {
    console.groupEnd();
    sendLog("info", "────────────────");
  },

  /**
   * 表格输出
   */
  table: (data: any) => {
    console.table(data);
    sendLog("debug", "Table data:", data);
  },

  /**
   * 计时开始
   */
  time: (label: string) => {
    console.time(label);
    sendLog("debug", `⏱️  Timer started: ${label}`);
  },

  /**
   * 计时结束
   */
  timeEnd: (label: string) => {
    console.timeEnd(label);
    sendLog("debug", `⏱️  Timer ended: ${label}`);
  },
};

export { JokerConsole };
