import axios from "axios";
import config from "./config.js";
import winston from "winston";

// 创建日志记录器
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "ai-service" },
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
 * 调用OpenAI API
 * @param {string} prompt - 提示词
 * @param {string} systemPrompt - 系统提示词
 * @returns {Promise<string>} - AI响应
 */
export async function callAI(prompt, systemPrompt = "You are a helpful assistant.") {
  try {
    const response = await retryOperation(() => 
      axios.post(
        `${config.openaiUrl}/chat/completions`,
        {
          model: config.openaiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.openaiKey}`,
          },
        }
      )
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    logger.error("Error calling AI:", {
      error: error.message,
      stack: error.stack,
      promptLength: prompt.length,
    });
    throw error;
  }
}

/**
 * 生成网页内容摘要
 * @param {string} content - 网页内容
 * @returns {Promise<string>} - 内容摘要
 */
export async function generateSummary(content) {
  // 如果内容太长,截取合适长度
  const maxLength = 4000;
  const truncatedContent = content.length > maxLength 
    ? content.substring(0, maxLength) + "...(内容已截断)" 
    : content;
    
  const prompt = `请对以下内容进行简要总结：\n\n${truncatedContent}`;
  const systemPrompt = `请你根据提供的网页内容，撰写一份结构清晰、重点突出且不遗漏重要内容的摘要。
    
要求：
1. **摘要结构：**  
    *   第一行使用'# 标题'格式取一个简要的大标题。
    *   一句话总结：请提供一个简洁、精炼的概括性语句，准确概括整个网页的核心内容。
    *   按照网页内容的逻辑顺序，依次总结各个主要部分的核心内容。
    
2. **突出重点：**  请识别并突出显示网页中的关键信息、主题、重要论点和结论。如果网页内容包含重要数据或结论，请务必在摘要中体现。
3. **不遗漏重要内容：**  在总结时，请确保覆盖网页的所有重要方面，避免关键信息缺失。
    
请注意：
*   摘要应保持客观中立，避免掺杂个人观点或情感色彩。
*   摘要的语言应简洁明了，避免使用过于专业或晦涩的词汇,并使用中文进行总结。
*   摘要的长度适中，既要全面覆盖重要内容，又要避免冗长啰嗦。
*   总结的末尾无需再进行总结，有一句话总结代替。`;
  
  try {
    return await callAI(prompt, systemPrompt);
  } catch (error) {
    logger.error("Error generating summary:", {
      error: error.message,
      stack: error.stack,
      contentLength: content.length,
    });
    throw error;
  }
} 