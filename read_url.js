import axios from "axios";
import config from "./config.js";
import winston from "winston";
import { generateSummary } from "./ai.js";

// 创建日志记录器
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "url-reader" },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "error.log", level: "error" }),
  ],
});

// 重试函数
async function retryOperation(operation, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      logger.warn(`Retry ${i + 1}/${maxRetries} failed:`, {
        error: error.message,
        stack: error.stack,
      });
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

/**
 * 读取URL内容
 * @param {string} url - 要读取的URL
 * @returns {Promise<Object>} - 处理后的内容对象
 */
export async function readUrl(url) {
  try {
    const headers = {
      "Accept": "application/json",
      "X-Retain-Images": "none",
    };

    if (config.jinaToken) {
      headers["Authorization"] = `Bearer ${config.jinaToken}`;
    }

    const response = await retryOperation(() => 
      axios.get(`https://r.jina.ai/${url}`, { headers })
    );
    
    const { data } = response.data;
    
    return {
      raw: {
        title: data.title,
        content: `# ${data.title}\n\n${data.content}\n\n[${data.title}](${data.url})`,
        url: data.url
      }
    };
  } catch (error) {
    logger.error("Error reading URL:", {
      error: error.message,
      stack: error.stack,
      url,
    });
    throw error;
  }
}

/**
 * 生成内容摘要
 * @param {Object} content - URL内容对象
 * @returns {Promise<string>} - 内容摘要
 */
export async function summarizeContent(content) {
  try {
    const summary = await retryOperation(() => generateSummary(content.raw.content));
    return summary;
  } catch (error) {
    logger.error("Error generating summary:", {
      error: error.message,
      stack: error.stack,
      title: content.raw.title,
    });
    throw error;
  }
} 