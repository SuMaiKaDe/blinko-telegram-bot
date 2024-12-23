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

// 转义 Markdown 特殊字符
function escapeMarkdown(text) {
  return text
    .replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
    .replace(/\n/g, '\n');
}

/**
 * 创建 Telegraph 页面
 * @param {string} title - 页面标题
 * @param {string} content - 页面内容
 * @returns {Promise<string>} - Telegraph URL
 */
async function createTelegraphPage(title, content) {
  try {
    if (!config.telegraphToken) {
      throw new Error('Telegraph token not configured');
    }

    const response = await axios.post('https://api.telegra.ph/createPage', {
      access_token: config.telegraphToken,
      title,
      author_name: 'Blinko Bot',
      content: [
        {
          tag: 'article',
          children: [
            { tag: 'p', children: [content] }
          ]
        }
      ],
      return_content: false
    });

    if (response.data.ok) {
      return response.data.result.url;
    } else {
      throw new Error('Failed to create Telegraph page');
    }
  } catch (error) {
    logger.error("Error creating Telegraph page:", {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
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
    let formattedContent;
    let telegraphUrl = null;

    // 如果内容太长，创建 Telegraph 页面
    if (data.content.length > 1000) {
      try {
        telegraphUrl = await createTelegraphPage(data.title, data.content);
        formattedContent = `${escapeMarkdown(data.title)}\n\n[在 Telegraph 上查看全文](${telegraphUrl})\n\n[原文链接](${data.url})`;
      } catch (error) {
        // 如果创建 Telegraph 页面失败，使用简短预览
        formattedContent = `${escapeMarkdown(data.title)}\n\n内容过长，请使用下方按钮进行操作\n\n[原文链接](${data.url})`;
      }
    } else {
      formattedContent = `${escapeMarkdown(data.title)}\n\n${escapeMarkdown(data.content)}\n\n[原文链接](${data.url})`;
    }
    
    return {
      raw: data,
      formatted: formattedContent,
      telegraphUrl
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
    let formattedSummary = `${escapeMarkdown(content.raw.title)} \\- 摘要\n\n${escapeMarkdown(summary)}`;
    
    if (content.telegraphUrl) {
      formattedSummary += `\n\n[在 Telegraph 上查看全文](${content.telegraphUrl})`;
    }
    
    formattedSummary += `\n\n[原文链接](${content.raw.url})`;
    
    return formattedSummary;
  } catch (error) {
    logger.error("Error generating summary:", {
      error: error.message,
      stack: error.stack,
      title: content.raw.title,
    });
    throw error;
  }
} 