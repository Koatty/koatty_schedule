/*
 * @Description: Test debugging utilities
 * @Usage: 
 * @Author: richen
 * @Date: 2024-01-17 22:00:00
 * @LastEditTime: 2024-01-17 22:00:00
 * @License: BSD (3-Clause)
 * @Copyright (c): <richenlin(at)gmail.com>
 */

/**
 * Debug输出函数，只在明确的DEBUG模式下输出
 * @param message - 调试消息
 * @param args - 额外参数
 */
export function debugLog(message: string, ...args: any[]): void {
  if (process.env.NODE_ENV === 'test' && process.env.DEBUG === 'true') {
    console.log(`[DEBUG] ${message}`, ...args);
  }
}

/**
 * 错误调试输出
 * @param message - 错误消息
 * @param args - 额外参数
 */
export function debugError(message: string, ...args: any[]): void {
  if (process.env.NODE_ENV === 'test' && process.env.DEBUG === 'true') {
    console.error(`[DEBUG ERROR] ${message}`, ...args);
  }
}

/**
 * 警告调试输出
 * @param message - 警告消息
 * @param args - 额外参数
 */
export function debugWarn(message: string, ...args: any[]): void {
  if (process.env.NODE_ENV === 'test' && process.env.DEBUG === 'true') {
    console.warn(`[DEBUG WARN] ${message}`, ...args);
  }
}

/**
 * 检查是否处于调试模式
 * @returns 是否启用调试
 */
export function isDebugMode(): boolean {
  return process.env.NODE_ENV === 'test' && process.env.DEBUG === 'true';
} 