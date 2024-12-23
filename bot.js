import { Telegraf, session } from "telegraf";
import axios from "axios";
import FormData from "form-data";
import config from "./config.js";
import winston from "winston";
import { toMyMarkdown } from "./tomd.js";
import { readUrl, summarizeContent } from "./read_url.js";
import { callAI } from "./ai.js";

// 增加api是否以/结尾判断
if (!config.apiUrl.endsWith("/")) {
  config.apiUrl = config.apiUrl + "/";
}

// 创建日志记录器
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  defaultMeta: { service: "telegram-bot" },
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

// 创建 Telegraf 实例
const bot = new Telegraf(config.telegramToken);

// 启用session
bot.use(session());

// 处理回调查询的具体逻辑
async function handleCallbackQuery(ctx) {
  const [action, messageId] = ctx.callbackQuery.data.split("_");
  const urlContent = ctx.session?.[messageId];

  if (!urlContent) {
    await ctx.answerCallbackQuery("内容已过期，请重新发送URL");
    return;
  }

  switch (action) {
    case "save":
      const saveResult = await sendToApi(urlContent.formatted, []);
      await ctx.answerCallbackQuery(saveResult.id ? "保存成功" : "保存失败");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      break;

    case "summarize":
      await ctx.editMessageText(urlContent.formatted + "\n\n正在生成摘要...");
      
      try {
        const summary = await summarizeContent(urlContent);
        await ctx.editMessageText(summary, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "保存", callback_data: `save_summary_${messageId}` },
                { text: "取消", callback_data: `cancel_${messageId}` },
              ],
            ],
          },
        });
        
        ctx.session[messageId] = { ...urlContent, formatted: summary };
      } catch (error) {
        logger.error("Error generating summary:", {
          error: error.message,
          stack: error.stack,
        });
        await ctx.editMessageText(urlContent.formatted + "\n\n生成摘要失败，请重试", {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "保存", callback_data: `save_${messageId}` },
                { text: "总结", callback_data: `summarize_${messageId}` },
                { text: "取消", callback_data: `cancel_${messageId}` },
              ],
            ],
          },
        });
      }
      break;

    case "save_summary":
      const summaryResult = await sendToApi(urlContent.formatted, []);
      await ctx.answerCallbackQuery(summaryResult.id ? "摘要保存成功" : "摘要保存失败");
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      break;

    case "cancel":
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.answerCallbackQuery("已取消");
      break;
  }
}

// 监听消息
bot.on("message", async (ctx) => {
  try {
    const userId = parseInt(config.userId);

    // 检查消息是否来自指定用户
    if (ctx.message.from.id === userId) {
      const markdownText = toMyMarkdown(ctx.message);
      let content = ctx.message.text
        ? ctx.message.text
        : markdownText
        ? markdownText
        : null;
      let attachments = [];

      // 检查是否是URL
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = content?.match(urlRegex);

      if (urls && urls.length > 0) {
        const loadingMessage = await ctx.reply("正在读取URL内容...", {
          reply_to_message_id: ctx.message.message_id,
        });

        try {
          const urlContent = await retryOperation(() => readUrl(urls[0]));
          
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            null,
            urlContent.formatted,
            {
              parse_mode: "MarkdownV2",
              disable_web_page_preview: true,
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "保存", callback_data: `save_${loadingMessage.message_id}` },
                    { text: "总结", callback_data: `summarize_${loadingMessage.message_id}` },
                    { text: "取消", callback_data: `cancel_${loadingMessage.message_id}` },
                  ],
                ],
              },
            }
          );

          ctx.session = ctx.session || {};
          ctx.session[loadingMessage.message_id] = urlContent;
          
          return;
        } catch (error) {
          logger.error("Error processing URL:", {
            error: error.message,
            stack: error.stack,
            url: urls[0],
          });
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMessage.message_id,
            null,
            "URL读取失败，请稍后重试"
          );
          return;
        }
      }

      // 处理普通消息和文件
      const savingMessage = await ctx.reply("收到，正在保存", {
        reply_to_message_id: ctx.message.message_id,
      });

      if (ctx.message.document || ctx.message.photo) {
        let fileIds = [];
        if (ctx.message.document) {
          fileIds.push(ctx.message.document.file_id);
        }
        if (ctx.message.photo) {
          fileIds = fileIds.concat(
            ctx.message.photo.slice(-1).map((photo) => photo.file_id)
          );
        }

        for (const fileId of fileIds) {
          const fileUrl = await retryOperation(() => getFileLink(ctx, fileId));
          let fileinfo = {
            filename: ctx.message.document?.file_name || "file",
          };
          const fileResponse = await retryOperation(() => uploadFile(fileUrl, fileinfo));

          if (fileResponse.status === 200) {
            const { filePath: path, fileName: name, type, size } = fileResponse;
            attachments.push({ path, name, type, size });
          } else {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              savingMessage.message_id,
              null,
              `文件上传失败:${fileResponse}`
            );
          }
        }
      }

      const saveResult = await retryOperation(() => sendToApi(content, attachments));
      if (saveResult.id) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          savingMessage.message_id,
          null,
          "已保存"
        );
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          savingMessage.message_id,
          null,
          `保存失败:${saveResult}`
        );
      }
    }
  } catch (error) {
    logger.error("An error occurred:", {
      error: error.message,
      stack: error.stack,
      userId: ctx.message.from.id,
    });
    await ctx.reply("发生错误，请稍后再试");
  }
});

// 处理回调查询
bot.on("callback_query", async (ctx) => {
  try {
    const timeoutMs = 30000; // 30秒超时
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("操作超时")), timeoutMs)
    );

    await Promise.race([
      handleCallbackQuery(ctx),
      timeoutPromise
    ]);
  } catch (error) {
    logger.error("Error handling callback query:", {
      error: error.message,
      stack: error.stack,
      query: ctx.callbackQuery.data,
    });
    await ctx.answerCallbackQuery(
      error.message === "操作超时" ? "操作超时,请重试" : "处理请求时发生错误"
    );
  }
});

// 获取文件链接
async function getFileLink(ctx, fileId) {
  try {
    const file = await ctx.telegram.getFile(fileId);
    return `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
  } catch (error) {
    logger.error("Error getting file link:", {
      error: error.message,
      stack: error.stack,
      fileId,
    });
    throw error;
  }
}

// 上传文件到 API
async function uploadFile(fileUrl, fileinfo) {
  try {
    const response = await axios.get(fileUrl, { responseType: "stream" });
    const fileStream = response.data;
    const formData = new FormData();
    formData.append("file", fileStream, { filename: fileinfo.filename });

    const uploadResponse = await axios.post(
      `${config.apiUrl}/api/file/upload`,
      formData,
      {
        headers: { Authorization: `Bearer ${config.apiToken}` },
      }
    );

    return uploadResponse.data;
  } catch (error) {
    logger.error("Error uploading file:", {
      error: error.message,
      stack: error.stack,
      fileUrl,
    });
    throw error;
  }
}

// 发送消息到 API
async function sendToApi(content, attachments) {
  try {
    const payload = {
      content,
      type: 0,
      attachments,
    };

    const response = await axios.post(
      `${config.apiUrl}/api/v1/note/upsert`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiToken}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    logger.error("Error sending to API:", {
      error: error.message,
      stack: error.stack,
      contentLength: content?.length,
    });
    throw error;
  }
}

// 启动机器人
bot.launch();

// 优雅退出
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
